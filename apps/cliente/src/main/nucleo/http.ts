import type { RespostaDeErro } from '@compartilhado/tipos';
import type { EstadoConectividade } from './conectividade';

/** A chave está em Offline: nenhuma requisição sai do aparelho (D-14). */
export class ErroOffline extends Error {
  constructor() {
    super('A chave está em Offline: nada sai do aparelho.');
    this.name = 'ErroOffline';
  }
}

/** O servidor não respondeu (rede, VM fora do ar, tempo esgotado). */
export class ErroDeRede extends Error {
  constructor(readonly motivo: string) {
    super(`Servidor inacessível (${motivo}).`);
    this.name = 'ErroDeRede';
  }
}

/** A requisição foi cancelada porque a chave foi para Offline no meio. */
export class ErroCancelado extends Error {
  constructor() {
    super('Requisição cancelada: a chave foi para Offline.');
    this.name = 'ErroCancelado';
  }
}

export interface RespostaHttp<T = unknown> {
  status: number;
  corpo: T;
  /** Só para respostas de erro no formato padrão {erro, mensagem}. */
  erro: RespostaDeErro | null;
  cabecalhos: Headers;
  bytes: ArrayBuffer | null;
}

export interface OpcoesHttp {
  metodo?: 'GET' | 'POST';
  corpo?: unknown;
  token?: string | null;
  consulta?: Record<string, string | null | undefined>;
  /** Para o PDF: a resposta vem em bytes. */
  binario?: boolean;
  tempoLimiteMs?: number;
}

export interface Dispositivo {
  id: string;
  nome: string;
}

const TEMPO_LIMITE_PADRAO_MS = 20_000;

/**
 * O único lugar do app que fala com a rede. Com a chave em Offline, recusa tudo antes de qualquer conexão;
 * se a chave for para Offline no meio de uma requisição, cancela.
 */
export class ClienteHttp {
  private readonly emAndamento = new Set<AbortController>();

  constructor(
    private readonly conectividade: EstadoConectividade,
    private readonly servidor: () => string | null,
    private readonly dispositivo: () => Dispositivo | null,
    private readonly buscar: typeof fetch = (...argumentos) => fetch(...argumentos),
    private readonly versao = '1.0.0',
  ) {
    conectividade.assinar((modo) => {
      if (modo === 'OFFLINE') this.cancelarTudo();
    });
  }

  async requisitar<T = unknown>(rota: string, opcoes: OpcoesHttp = {}): Promise<RespostaHttp<T>> {
    if (!this.conectividade.online) throw new ErroOffline();
    const base = this.servidor();
    if (!base) throw new ErroDeRede('endereço do servidor não configurado');

    const cabecalhos: Record<string, string> = {
      Accept: opcoes.binario ? 'application/pdf' : 'application/json',
      'User-Agent': `MedicalField-Cliente/${this.versao} (Electron)`,
    };
    if (opcoes.corpo !== undefined) cabecalhos['Content-Type'] = 'application/json';
    if (opcoes.token) cabecalhos.Authorization = `Bearer ${opcoes.token}`;
    const dispositivo = this.dispositivo();
    if (dispositivo) {
      cabecalhos['X-Dispositivo-Id'] = dispositivo.id;
      // Cabeçalho HTTP só aceita texto simples: o nome vai codificado como URL ("Ambul%C3%A2ncia%2001")
      cabecalhos['X-Dispositivo-Nome'] = encodeURIComponent(dispositivo.nome);
    }

    const controle = new AbortController();
    let esgotou = false;
    const relogio = setTimeout(() => {
      esgotou = true;
      controle.abort();
    }, opcoes.tempoLimiteMs ?? TEMPO_LIMITE_PADRAO_MS);
    this.emAndamento.add(controle);
    try {
      const resposta = await this.buscar(urlCompleta(base, rota, opcoes.consulta), {
        method: opcoes.metodo ?? 'GET',
        headers: cabecalhos,
        body: opcoes.corpo === undefined ? undefined : JSON.stringify(opcoes.corpo),
        signal: controle.signal,
      });
      const ok = resposta.status >= 200 && resposta.status < 300;
      if (ok && opcoes.binario) {
        return { status: resposta.status, corpo: null as T, erro: null, cabecalhos: resposta.headers, bytes: await resposta.arrayBuffer() };
      }
      const texto = await resposta.text();
      let corpo: unknown = null;
      try {
        corpo = texto ? JSON.parse(texto) : null;
      } catch {
        corpo = null;
      }
      const erro = !ok && corpo && typeof (corpo as RespostaDeErro).erro === 'string' ? (corpo as RespostaDeErro) : null;
      return { status: resposta.status, corpo: corpo as T, erro, cabecalhos: resposta.headers, bytes: null };
    } catch (falha) {
      if (controle.signal.aborted && !esgotou) throw new ErroCancelado();
      throw new ErroDeRede(esgotou ? 'tempo esgotado' : falha instanceof Error ? falha.message : String(falha));
    } finally {
      clearTimeout(relogio);
      this.emAndamento.delete(controle);
    }
  }

  cancelarTudo(): void {
    for (const controle of this.emAndamento) controle.abort();
  }
}

function urlCompleta(base: string, rota: string, consulta?: Record<string, string | null | undefined>): string {
  const url = new URL(`/api${rota}`, base.endsWith('/') ? base : `${base}/`);
  for (const [nome, valor] of Object.entries(consulta ?? {})) {
    if (valor) url.searchParams.set(nome, valor);
  }
  return url.toString();
}

/** "http://203.0.113.10", "203.0.113.10", "http://localhost:8088/" → a forma usada nas requisições. */
export function normalizarEnderecoDoServidor(texto: string): string | null {
  const limpo = texto.trim();
  if (!limpo) return null;
  const comEsquema = /^https?:\/\//i.test(limpo) ? limpo : `http://${limpo}`;
  try {
    const url = new URL(comEsquema);
    if (!url.hostname) return null;
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}
