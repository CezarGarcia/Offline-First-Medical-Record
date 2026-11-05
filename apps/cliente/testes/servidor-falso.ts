/**
 * Um servidor MedicalField de mentira, em memória, no lugar do fetch: imita as regras que o núcleo precisa
 * (login, tokens, idempotência pelo ID, unificação por CPF e por prontuário repetido, "receber dados", logs,
 * PDF e e-mail). Cada rota pode ser forçada a responder outra coisa, ou a "cair" (erro de rede).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type {
  Atendimento,
  Medicamento,
  Pessoa,
  ProfissionalResumo,
  Prontuario,
  Sincronizacao,
} from '@compartilhado/tipos';
import bcrypt from 'bcryptjs';
import { Nucleo } from '../src/main/nucleo/nucleo';
import type { Cofre } from '../src/main/nucleo/sessao';

export const SENHA = 'senha-certa';
export const SERVIDOR = 'http://servidor.teste';

export const ANA: ProfissionalResumo = {
  id: '0193f000-0000-7000-8000-0000000000c3',
  nome: 'Dra. Ana Souza',
  tipoRegistro: 'CRM',
  registro: '12345-RS',
  perfil: 'OPERACIONAL',
};

/** Nunca entrou online nos aparelhos dos testes: só entra offline pela réplica de credenciais (D-51). */
export const CARLOS: ProfissionalResumo = {
  id: '0193f000-0000-7000-8000-0000000000c4',
  nome: 'Carlos Pereira',
  tipoRegistro: 'SOCORRISTA',
  registro: 'SOC-0001',
  perfil: 'OPERACIONAL',
};
export const SENHA_DO_CARLOS = 'senha-do-carlos';

export const MEDICAMENTO: Medicamento = {
  id: '0193f000-0000-7000-8000-000000000501',
  nome: 'Dipirona',
  apresentacao: 'Ampola 500 mg/mL',
  unidadePadrao: 'G',
  ativo: true,
  atualizadoEm: '2026-11-01T10:00:00Z',
};

interface Chamada {
  metodo: string;
  caminho: string;
  consulta: URLSearchParams;
  corpo: any;
  cabecalhos: Record<string, string>;
}

type Forcada = { metodo: string; caminho: RegExp; vezes: number; resposta: () => Response | 'REDE' };

export const json = (status: number, corpo: unknown) =>
  new Response(status === 204 ? null : JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });
const erro = (status: number, codigo: string, mensagem = codigo, extras: Record<string, unknown> = {}) =>
  json(status, { erro: codigo, mensagem, ...extras });

export class ServidorFalso {
  readonly chamadas: Chamada[] = [];
  readonly pessoas = new Map<string, Pessoa>();
  readonly prontuarios = new Map<string, Prontuario>();
  readonly atendimentos = new Map<string, Atendimento>();
  readonly apelidos = new Map<string, string>();
  readonly logs: any[] = [];
  readonly emails: any[] = [];
  medicamentos: Medicamento[] = [MEDICAMENTO];
  unificacoes: { entidade: 'PESSOA' | 'PRONTUARIO'; idDescartado: string; idMantido: string }[] = [];
  fora = false;
  /** Os ativos, com o hash da senha (como em auth.profissional): a réplica do login offline. */
  ativos = [
    { ...ANA, senhaHash: bcrypt.hashSync(SENHA, 4) },
    { ...CARLOS, senhaHash: bcrypt.hashSync(SENHA_DO_CARLOS, 4) },
  ];
  private tokens = new Set<string>();
  private refreshTokens = new Set<string>();
  private contador = 0;
  private forcadas: Forcada[] = [];

  /** As próximas `vezes` chamadas a essa rota respondem outra coisa. */
  forcar(metodo: string, caminho: RegExp, resposta: () => Response | 'REDE', vezes = 1): void {
    this.forcadas.push({ metodo, caminho, vezes, resposta });
  }

  invalidarTokens(): void {
    this.tokens.clear();
  }

  invalidarSessoes(): void {
    this.tokens.clear();
    this.refreshTokens.clear();
  }

  chamadasPara(metodo: string, caminho: string | RegExp): Chamada[] {
    return this.chamadas.filter(
      (c) => c.metodo === metodo && (typeof caminho === 'string' ? c.caminho === caminho : caminho.test(c.caminho)),
    );
  }

  buscar = async (endereco: string | URL | Request, opcoes: RequestInit = {}): Promise<Response> => {
    const url = new URL(String(endereco));
    const metodo = (opcoes.method ?? 'GET').toUpperCase();
    const chamada: Chamada = {
      metodo,
      caminho: url.pathname,
      consulta: url.searchParams,
      corpo: typeof opcoes.body === 'string' ? JSON.parse(opcoes.body) : null,
      cabecalhos: Object.fromEntries(new Headers(opcoes.headers).entries()),
    };
    if (opcoes.signal?.aborted) throw new DOMException('cancelada', 'AbortError');
    if (this.fora) throw new TypeError('fetch failed');
    this.chamadas.push(chamada);
    const forcada = this.forcadas.find((f) => f.metodo === metodo && f.caminho.test(url.pathname) && f.vezes > 0);
    if (forcada) {
      forcada.vezes -= 1;
      const resposta = forcada.resposta();
      if (resposta === 'REDE') throw new TypeError('fetch failed');
      return resposta;
    }
    return this.responder(chamada);
  };

  private novoToken(prefixo: string): string {
    this.contador += 1;
    return `${prefixo}-${this.contador}-com-mais-de-vinte-caracteres`;
  }

  private sincronizacao(): Sincronizacao {
    const agora = new Date().toISOString();
    return { sincronizadoPorId: ANA.id, recebidoEm: agora, atualizadoEm: agora };
  }

  private responder(c: Chamada): Response {
    const { metodo, caminho, corpo } = c;
    if (metodo === 'POST' && caminho === '/api/auth/login') {
      if (corpo.registro.toUpperCase() !== ANA.registro || corpo.tipoRegistro !== ANA.tipoRegistro || corpo.senha !== SENHA) {
        return erro(401, 'CREDENCIAIS_INVALIDAS', 'Registro ou senha incorretos.');
      }
      const token = this.novoToken('acesso');
      const refresh = this.novoToken('refresh');
      this.tokens.add(token);
      this.refreshTokens.add(refresh);
      return json(200, {
        tokenDeAcesso: token,
        tokenDeAcessoExpiraEm: new Date(Date.now() + 15 * 60_000).toISOString(),
        refreshToken: refresh,
        sessaoExpiraEm: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        profissional: ANA,
      });
    }
    if (metodo === 'POST' && caminho === '/api/auth/refresh') {
      if (!this.refreshTokens.has(corpo.refreshToken)) return erro(401, 'SESSAO_INVALIDA');
      const token = this.novoToken('acesso');
      this.tokens.add(token);
      return json(200, {
        tokenDeAcesso: token,
        tokenDeAcessoExpiraEm: new Date(Date.now() + 15 * 60_000).toISOString(),
        sessaoExpiraEm: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      });
    }
    const token = c.cabecalhos.authorization?.replace('Bearer ', '') ?? '';
    if (!this.tokens.has(token)) return erro(401, 'NAO_AUTENTICADO');

    if (metodo === 'POST' && caminho === '/api/auth/logout') return json(204, null);
    if (metodo === 'GET' && caminho === '/api/auth/credenciais-offline') {
      return json(200, { geradoEm: new Date().toISOString(), profissionais: this.ativos });
    }
    if (metodo === 'POST' && caminho === '/api/pessoa') return this.criarPessoa(corpo);
    if (metodo === 'POST' && caminho === '/api/prontuario') return this.criarProntuario(corpo);
    if (metodo === 'POST' && caminho === '/api/atendimento') return this.criarAtendimento(corpo);
    if (metodo === 'GET' && caminho === '/api/sync/pull') {
      return json(200, {
        cursor: new Date().toISOString(),
        medicamentos: this.medicamentos,
        pessoas: [...this.pessoas.values()],
        prontuarios: [...this.prontuarios.values()],
        atendimentos: [...this.atendimentos.values()],
        unificacoes: this.unificacoes,
      });
    }
    if (metodo === 'POST' && caminho === '/api/log') {
      this.logs.push(...corpo.logs);
      return json(200, { recebidos: corpo.logs.length, repetidos: 0 });
    }
    const email = caminho.match(/^\/api\/documentos\/ficha\/([^/]+)\/email$/);
    if (metodo === 'POST' && email) {
      this.emails.push(corpo);
      return json(201, {
        id: corpo.id,
        atendimentoId: email[1],
        status: 'ENVIADO',
        destinatarioTipo: corpo.destinatario.tipo,
        destinatarioEmail: corpo.destinatario.email ?? 'familiar@exemplo.com',
        erro: null,
        tentativas: 1,
        enviadoEm: new Date().toISOString(),
      });
    }
    const pdf = caminho.match(/^\/api\/documentos\/ficha\/([^/]+)\/pdf$/);
    if (metodo === 'GET' && pdf) {
      if (!this.atendimentos.has(pdf[1] ?? '')) return erro(404, 'NAO_ENCONTRADO');
      return new Response('%PDF-1.7 ficha', {
        status: 200,
        headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="ficha-atendimento-TESTE.pdf"' },
      });
    }
    return erro(404, 'NAO_ENCONTRADO', `rota desconhecida no servidor falso: ${metodo} ${caminho}`);
  }

  private criarPessoa(corpo: any): Response {
    const id = this.apelidos.get(corpo.id) ?? corpo.id;
    const existente = this.pessoas.get(id);
    if (existente) {
      const unificado = id !== corpo.id;
      return json(200, { resultado: unificado ? 'UNIFICADO' : 'JA_EXISTIA', id, idEnviado: corpo.id, conflitoId: null, dados: existente });
    }
    const mesmoCpf = corpo.cpf ? [...this.pessoas.values()].find((p) => p.cpf === corpo.cpf) : undefined;
    if (mesmoCpf) {
      // Mais recente vence, de forma simplificada: o telefone que chegou fica; o resto é complemento
      const mesclada = { ...mesmoCpf, telefone: corpo.telefone ?? mesmoCpf.telefone, email: mesmoCpf.email ?? corpo.email };
      this.pessoas.set(mesmoCpf.id, mesclada);
      this.apelidos.set(corpo.id, mesmoCpf.id);
      this.unificacoes.push({ entidade: 'PESSOA', idDescartado: corpo.id, idMantido: mesmoCpf.id });
      return json(200, { resultado: 'UNIFICADO', id: mesmoCpf.id, idEnviado: corpo.id, conflitoId: 'c-1', dados: mesclada });
    }
    const pessoa: Pessoa = { ...corpo, sincronizacao: this.sincronizacao() };
    this.pessoas.set(pessoa.id, pessoa);
    return json(201, { resultado: 'CRIADO', id: pessoa.id, idEnviado: pessoa.id, conflitoId: null, dados: pessoa });
  }

  private criarProntuario(corpo: any): Response {
    const pessoaId = this.apelidos.get(corpo.pessoaId) ?? corpo.pessoaId;
    if (!this.pessoas.has(pessoaId)) return erro(422, 'PESSOA_NAO_ENCONTRADA', 'Pessoa não encontrada.');
    if (this.prontuarios.has(corpo.id)) {
      return json(200, { resultado: 'JA_EXISTIA', id: corpo.id, idEnviado: corpo.id, conflitoId: null, dados: this.prontuarios.get(corpo.id) });
    }
    const daPessoa = [...this.prontuarios.values()].find((p) => p.pessoaId === pessoaId);
    if (daPessoa) {
      const mesclado = { ...daPessoa, alergias: corpo.alergias ?? daPessoa.alergias };
      this.prontuarios.set(daPessoa.id, mesclado);
      this.apelidos.set(corpo.id, daPessoa.id);
      this.unificacoes.push({ entidade: 'PRONTUARIO', idDescartado: corpo.id, idMantido: daPessoa.id });
      return json(200, { resultado: 'UNIFICADO', id: daPessoa.id, idEnviado: corpo.id, conflitoId: 'c-2', dados: mesclado });
    }
    const prontuario: Prontuario = { ...corpo, pessoaId, sincronizacao: this.sincronizacao() };
    this.prontuarios.set(prontuario.id, prontuario);
    return json(201, { resultado: 'CRIADO', id: prontuario.id, idEnviado: prontuario.id, conflitoId: null, dados: prontuario });
  }

  private criarAtendimento(corpo: any): Response {
    const prontuarioId = this.apelidos.get(corpo.prontuarioId) ?? corpo.prontuarioId;
    if (!this.prontuarios.has(prontuarioId)) return erro(422, 'PRONTUARIO_NAO_ENCONTRADO', 'Prontuário não encontrado.');
    if (this.atendimentos.has(corpo.id)) {
      return json(200, { resultado: 'JA_EXISTIA', id: corpo.id, idEnviado: corpo.id, conflitoId: null, dados: this.atendimentos.get(corpo.id) });
    }
    const atendimento: Atendimento = {
      ...corpo,
      prontuarioId,
      glasgow: corpo.glasgow ? { ...corpo.glasgow, total: corpo.glasgow.ocular + corpo.glasgow.verbal + corpo.glasgow.motora } : null,
      medicamentos: corpo.medicamentos.map((m: any) => ({ ...m, nome: this.medicamentos.find((x) => x.id === m.medicamentoId)?.nome })),
      sincronizacao: this.sincronizacao(),
    };
    this.atendimentos.set(atendimento.id, atendimento);
    return json(201, { resultado: 'CRIADO', id: atendimento.id, idEnviado: atendimento.id, conflitoId: null, dados: atendimento });
  }
}

/** Cofre de mentira: "cifra" sem segredo nenhum (no Windows, o app usa o DPAPI pelo safeStorage). */
export const cofreFalso: Cofre = {
  disponivel: () => true,
  cifrar: async (texto) => new TextEncoder().encode(`cifrado:${texto}`),
  decifrar: async (dados) => new TextDecoder().decode(dados).replace(/^cifrado:/, ''),
};

export interface Aparelho {
  nucleo: Nucleo;
  servidor: ServidorFalso;
  pasta: string;
  arquivos: { nome: string; conteudo: Uint8Array }[];
  relogio: { deslocamentoMs: number };
  reabrir(): Promise<Aparelho>;
  fechar(): Promise<void>;
}

/** Um aparelho novo (banco vazio numa pasta temporária), já configurado. */
/** Um sistema sem cofre de senhas (acontece em alguns Linux): nada que precise de cofre vai para o disco. */
export const semCofre: Cofre = {
  disponivel: () => false,
  cifrar: async () => {
    throw new Error('sem cofre');
  },
  decifrar: async () => {
    throw new Error('sem cofre');
  },
};

export function novoAparelho(
  servidor = new ServidorFalso(),
  pasta = mkdtempSync(join(tmpdir(), 'medicalfield-')),
  configurar = true,
  cofre: Cofre = cofreFalso,
): Aparelho {
  const arquivos: { nome: string; conteudo: Uint8Array }[] = [];
  const relogio = { deslocamentoMs: 0 };
  const nucleo = new Nucleo({
    caminhoDoBanco: join(pasta, 'medicalfield.db'),
    perfil: 'teste',
    versao: '1.0.0-teste',
    cofre,
    buscar: servidor.buscar as typeof fetch,
    agora: () => new Date(Date.now() + relogio.deslocamentoMs),
    salvarArquivo: async (nome, conteudo) => {
      arquivos.push({ nome, conteudo });
      return join(pasta, nome);
    },
  });
  if (configurar && !nucleo.estadoAtual().configurado) {
    void nucleo.configurar({ servidorUrl: SERVIDOR, dispositivoNome: 'Ambulância Teste' });
  }
  nucleo.iniciar();
  const aparelho: Aparelho = {
    nucleo,
    servidor,
    pasta,
    arquivos,
    relogio,
    async reabrir() {
      await nucleo.encerrar();
      return novoAparelho(servidor, pasta, false, cofre);
    },
    async fechar() {
      await nucleo.encerrar();
      rmSync(pasta, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    },
  };
  return aparelho;
}

/** Espera o motor de sincronização terminar o que estiver fazendo. */
export async function semPendencias(nucleo: Nucleo): Promise<void> {
  await nucleo.motor.sincronizar('ENVIO');
}

export const PESSOA = { nome: 'Maria Oliveira', cpf: '36062031363', telefone: '51911110000' };

export function atendimentoBasico(agora = new Date()) {
  return {
    dataHora: new Date(agora.getTime() - 60_000).toISOString(),
    localOcorrencia: 'BR-386, km 350',
    tipoOcorrencia: 'CLINICA' as const,
    queixaPrincipal: 'Dor abdominal',
    triagem: { protocolo: 'MANCHESTER' as const, cor: 'AMARELO' as const },
    glasgow: { ocular: 4, verbal: 5, motora: 6 },
    sinaisVitais: { paSistolica: 120, spo2: 97 },
    medicamentos: [
      { medicamentoId: MEDICAMENTO.id, dose: 1, unidade: 'G' as const, via: 'INTRAVENOSA' as const, horario: agora.toISOString() },
    ],
    procedimentos: null,
    desfecho: { tipo: 'LIBERADO_NO_LOCAL' as const, destino: null },
    observacoes: null,
  };
}
