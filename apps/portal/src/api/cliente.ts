import type { RespostaLogin, RespostaRefresh, TipoRegistro } from '@compartilhado/tipos';
import { ErroDaApi, ErroDeRede, erroDaResposta } from './erros';
import { type ArmazemDaSessao, armazemDaSessao } from './sessao';

type Consulta = Record<string, string | number | boolean | null | undefined>;

export interface OpcoesDaRequisicao {
  metodo?: 'GET' | 'POST';
  corpo?: unknown;
  consulta?: Consulta;
  /** Login e renovação não levam o token de acesso. */
  semToken?: boolean;
}

export interface ArquivoBaixado {
  conteudo: Blob;
  nome: string | null;
}

/** Renova o token quando faltam menos de 30 segundos para ele vencer (ele vale 15 minutos). */
const ANTECEDENCIA_DA_RENOVACAO_MS = 30_000;

export const SESSAO_TERMINOU = 'Sua sessão terminou. Entre de novo.';

/**
 * Fala com a API pelo Nginx (mesmo endereço do portal, prefixo /api). Coloca o token de acesso em cada
 * requisição e o renova sozinho com o refresh token: antes de vencer, ou quando o servidor responde 401.
 */
export class ClienteApi {
  private renovacaoEmAndamento: Promise<boolean> | null = null;

  constructor(
    private readonly sessao: ArmazemDaSessao,
    private readonly base = '/api',
    private readonly buscar: typeof fetch = (...argumentos) => fetch(...argumentos),
  ) {}

  async json<T>(rota: string, opcoes: OpcoesDaRequisicao = {}): Promise<T> {
    const resposta = await this.requisitar(rota, opcoes);
    if (resposta.status === 204) return undefined as T;
    return (await resposta.json()) as T;
  }

  async arquivo(rota: string): Promise<ArquivoBaixado> {
    const resposta = await this.requisitar(rota);
    return { conteudo: await resposta.blob(), nome: nomeDoArquivo(resposta.headers.get('content-disposition')) };
  }

  /** A resposta crua (para quem precisa do status, como o envio de e-mail: 201 ou 200). Lança se não for 2xx. */
  async requisitar(rota: string, opcoes: OpcoesDaRequisicao = {}): Promise<Response> {
    if (!opcoes.semToken) await this.renovarSeEstiverVencendo();
    let resposta = await this.enviar(rota, opcoes);
    if (resposta.status === 401 && !opcoes.semToken && this.sessao.atual()) {
      const erro = await erroDaResposta(resposta.clone());
      if (erro.codigo === 'NAO_AUTENTICADO' && (await this.renovar())) {
        resposta = await this.enviar(rota, opcoes);
      }
    }
    if (!resposta.ok) throw await erroDaResposta(resposta);
    return resposta;
  }

  async login(tipoRegistro: TipoRegistro, registro: string, senha: string): Promise<RespostaLogin> {
    return this.json<RespostaLogin>('/auth/login', {
      metodo: 'POST',
      corpo: { tipoRegistro, registro, senha },
      semToken: true,
    });
  }

  /** Encerra a sessão no servidor (o refresh token deixa de valer) e no navegador. */
  async logout(): Promise<void> {
    try {
      if (this.sessao.atual()) await this.requisitar('/auth/logout', { metodo: 'POST' });
    } catch {
      // Sem conexão: a sessão do navegador sai do mesmo jeito; a do servidor vence sozinha
    } finally {
      this.sessao.encerrar(null);
    }
  }

  /** Encerra no servidor a sessão de um login que o portal não aceitou (perfil operacional). */
  async encerrarSessaoRecusada(tokenDeAcesso: string): Promise<void> {
    try {
      await this.buscar(`${this.base}/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenDeAcesso}` },
      });
    } catch {
      // Se falhar, a sessão vence sozinha; ela nunca chegou a ser usada no portal
    }
  }

  /** O token de acesso válido agora (renovando antes, se precisar). Usado pela página da API (Swagger UI). */
  async tokenAtual(): Promise<string | null> {
    await this.renovarSeEstiverVencendo();
    return this.sessao.atual()?.tokenDeAcesso ?? null;
  }

  /** Várias requisições recebendo 401 ao mesmo tempo esperam uma renovação só. */
  renovar(): Promise<boolean> {
    this.renovacaoEmAndamento ??= this.fazerRenovacao().finally(() => {
      this.renovacaoEmAndamento = null;
    });
    return this.renovacaoEmAndamento;
  }

  private async fazerRenovacao(): Promise<boolean> {
    const sessao = this.sessao.atual();
    if (!sessao) return false;
    const resposta = await this.enviar('/auth/refresh', {
      metodo: 'POST',
      corpo: { refreshToken: sessao.refreshToken },
      semToken: true,
    });
    if (!resposta.ok) {
      // Refresh token vencido ou revogado: só entrando de novo
      this.sessao.encerrar(SESSAO_TERMINOU);
      return false;
    }
    const renovado = (await resposta.json()) as RespostaRefresh;
    this.sessao.salvar({ ...sessao, ...renovado });
    return true;
  }

  private async renovarSeEstiverVencendo(): Promise<void> {
    const sessao = this.sessao.atual();
    if (!sessao) return;
    if (Date.parse(sessao.sessaoExpiraEm) <= Date.now()) {
      this.sessao.encerrar(SESSAO_TERMINOU);
      return;
    }
    if (Date.parse(sessao.tokenDeAcessoExpiraEm) - Date.now() < ANTECEDENCIA_DA_RENOVACAO_MS) {
      await this.renovar();
    }
  }

  private async enviar(rota: string, opcoes: OpcoesDaRequisicao): Promise<Response> {
    const cabecalhos: Record<string, string> = { Accept: 'application/json' };
    if (opcoes.corpo !== undefined) cabecalhos['Content-Type'] = 'application/json';
    const sessao = this.sessao.atual();
    if (!opcoes.semToken && sessao) cabecalhos.Authorization = `Bearer ${sessao.tokenDeAcesso}`;
    try {
      return await this.buscar(this.base + rota + textoDaConsulta(opcoes.consulta), {
        method: opcoes.metodo ?? 'GET',
        headers: cabecalhos,
        body: opcoes.corpo === undefined ? undefined : JSON.stringify(opcoes.corpo),
      });
    } catch {
      throw new ErroDeRede();
    }
  }
}

function textoDaConsulta(consulta: Consulta | undefined): string {
  if (!consulta) return '';
  const parametros = new URLSearchParams();
  for (const [nome, valor] of Object.entries(consulta)) {
    if (valor !== undefined && valor !== null && valor !== '') parametros.set(nome, String(valor));
  }
  const texto = parametros.toString();
  return texto ? `?${texto}` : '';
}

/** "attachment; filename=\"ficha-atendimento-9F3A1C2B.pdf\"" vira "ficha-atendimento-9F3A1C2B.pdf". */
export function nomeDoArquivo(cabecalho: string | null): string | null {
  const achado = cabecalho?.match(/filename="?([^";]+)"?/i);
  return achado?.[1] ?? null;
}

export function eErroDaApi(erro: unknown, codigo?: string): erro is ErroDaApi {
  return erro instanceof ErroDaApi && (codigo === undefined || erro.codigo === codigo);
}

export const api = new ClienteApi(armazemDaSessao);
