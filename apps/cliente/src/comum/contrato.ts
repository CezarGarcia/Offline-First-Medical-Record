/**
 * O contrato entre as telas (processo de renderização) e o núcleo local (processo principal): o que as telas
 * podem pedir e o que recebem. As telas nunca acessam o banco nem a rede; tudo passa por aqui (docs/04, 4.2).
 */
import type {
  Atendimento,
  EnvioEmail,
  Medicamento,
  Modo,
  Pessoa,
  PessoaResumo,
  ProfissionalResumo,
  Prontuario,
  Sincronizacao,
  TipoDestinatario,
  TipoRegistro,
  AtendimentoResumo,
} from '@compartilhado/tipos';
import type { DadosAtendimento, DadosPessoa, DadosProntuario, ProblemaDeCampo } from '@compartilhado/validacao';

export type EstadoSync = 'PENDENTE' | 'SINCRONIZADO' | 'ERRO';

/** Registros do banco local: os mesmos formatos da API, mais o estado da sincronização. */
export interface PessoaLocal extends Omit<Pessoa, 'sincronizacao'> {
  sincronizacao: Sincronizacao | null;
  estadoSync: EstadoSync;
}

export interface ProntuarioLocal extends Omit<Prontuario, 'sincronizacao'> {
  sincronizacao: Sincronizacao | null;
  estadoSync: EstadoSync;
}

export interface AtendimentoLocal extends Omit<Atendimento, 'sincronizacao'> {
  sincronizacao: Sincronizacao | null;
  estadoSync: EstadoSync;
}

export interface AtendimentoResumoLocal extends Omit<AtendimentoResumo, 'sincronizacao' | 'pessoa'> {
  pessoa: PessoaResumo;
  sincronizacao: Sincronizacao | null;
  estadoSync: EstadoSync;
}

export type TipoItemDaFila = 'CRIAR_PESSOA' | 'CRIAR_PRONTUARIO' | 'CRIAR_ATENDIMENTO' | 'ENVIAR_EMAIL';
export type StatusItemDaFila = 'PENDENTE' | 'ENVIANDO' | 'CONCLUIDO' | 'ERRO';

export interface ItemDaFila {
  ordem: number;
  id: string;
  tipo: TipoItemDaFila;
  entidadeId: string;
  /** Ex.: "Pessoa: Maria Oliveira" */
  descricao: string;
  status: StatusItemDaFila;
  tentativas: number;
  ultimoErro: string | null;
  proximaTentativaEm: string | null;
  criadoEm: string;
  concluidoEm: string | null;
}

export interface DestinatarioDoEmail {
  tipo: TipoDestinatario;
  email?: string | null;
}

/** Um pedido de envio da ficha por e-mail, como está na fila do aparelho. */
export interface PedidoDeEmailLocal {
  id: string;
  atendimentoId: string;
  destinatario: DestinatarioDoEmail;
  status: StatusItemDaFila;
  ultimoErro: string | null;
  /** A resposta do ms-docs, depois de enviado. */
  resultado: EnvioEmail | null;
  criadoEm: string;
}

export interface AtendimentoDetalheLocal extends AtendimentoLocal {
  pessoa: PessoaLocal;
  prontuario: ProntuarioLocal;
  emails: PedidoDeEmailLocal[];
}

export interface PacienteDetalhe {
  pessoa: PessoaLocal;
  /** Normalmente um. Dois só por um instante, até a unificação no servidor resolver (docs/05, 5.3). */
  prontuarios: ProntuarioLocal[];
  atendimentos: AtendimentoResumoLocal[];
}

export interface LogLocal {
  id: string;
  profissionalId: string | null;
  /** Para a tela: o nome de quem já entrou neste aparelho (não vai para o servidor). */
  profissionalNome: string | null;
  dataHora: string;
  acao: string;
  modo: Modo;
  detalhes: Record<string, unknown> | null;
  enviadoEm: string | null;
}

export interface SessaoNaTela {
  profissional: ProfissionalResumo;
  /** Como a sessão começou. */
  modoLogin: Modo;
  /** Login feito offline e o app foi reaberto (a senha não fica guardada): é preciso entrar online para sincronizar. */
  precisaLoginOnline: boolean;
}

export interface EstadoDoApp {
  versao: string;
  perfil: string;
  caminhoDoBanco: string;
  configurado: boolean;
  servidorUrl: string | null;
  dispositivo: { id: string; nome: string } | null;
  /** Posição da chave "Simular Conectividade". */
  conectividade: Modo;
  /** Com a chave em Online: o servidor respondeu na última tentativa? */
  servidorAcessivel: boolean;
  sessao: SessaoNaTela | null;
  pendentes: number;
  itensComErro: number;
  sincronizando: boolean;
  ultimaSincronizacaoEm: string | null;
  /** Por que a última sessão acabou (aparece na tela de login). */
  motivoDoFimDaSessao: string | null;
}

export interface ResultadoDoLogin {
  modo: Modo;
  /** Ex.: "Servidor inacessível: entrou em modo offline." */
  aviso: string | null;
}

export interface DadosDoLogin {
  tipoRegistro: TipoRegistro;
  registro: string;
  senha: string;
}

export interface DadosDaConfiguracao {
  servidorUrl: string;
  dispositivoNome: string;
}

/** Tudo o que as telas podem pedir ao núcleo. */
export interface ApiDoNucleo {
  estado(): Promise<EstadoDoApp>;
  configurar(dados: DadosDaConfiguracao): Promise<void>;
  entrar(dados: DadosDoLogin): Promise<ResultadoDoLogin>;
  /** Com uma sessão offline e o app reaberto: entra online de novo, só com a senha, para sincronizar. */
  confirmarSenhaOnline(senha: string): Promise<void>;
  sair(): Promise<void>;
  mudarConectividade(modo: Modo): Promise<void>;
  sincronizar(): Promise<void>;

  medicamentosAtivos(): Promise<Medicamento[]>;
  buscarPessoas(termo: string): Promise<PessoaLocal[]>;
  pessoaComCpf(cpf: string): Promise<PessoaLocal | null>;
  paciente(pessoaId: string): Promise<PacienteDetalhe | null>;
  atendimentos(): Promise<AtendimentoResumoLocal[]>;
  atendimento(id: string): Promise<AtendimentoDetalheLocal | null>;

  criarPessoa(dados: DadosPessoa): Promise<PessoaLocal>;
  criarProntuario(pessoaId: string, dados: DadosProntuario): Promise<ProntuarioLocal>;
  criarAtendimento(prontuarioId: string, dados: DadosAtendimento): Promise<AtendimentoLocal>;
  pedirEmail(atendimentoId: string, destinatario: DestinatarioDoEmail): Promise<PedidoDeEmailLocal>;
  /** Baixa o PDF (o servidor gera) e pergunta onde salvar. null se a pessoa cancelou. */
  baixarPdf(atendimentoId: string): Promise<{ salvoEm: string } | null>;

  fila(): Promise<ItemDaFila[]>;
  tentarDeNovo(itemId: string): Promise<void>;
  logsLocais(): Promise<LogLocal[]>;
}

export type MetodoDoNucleo = keyof ApiDoNucleo;

export const METODOS_DO_NUCLEO: readonly MetodoDoNucleo[] = [
  'estado',
  'configurar',
  'entrar',
  'confirmarSenhaOnline',
  'sair',
  'mudarConectividade',
  'sincronizar',
  'medicamentosAtivos',
  'buscarPessoas',
  'pessoaComCpf',
  'paciente',
  'atendimentos',
  'atendimento',
  'criarPessoa',
  'criarProntuario',
  'criarAtendimento',
  'pedirEmail',
  'baixarPdf',
  'fila',
  'tentarDeNovo',
  'logsLocais',
];

/** Erro que atravessa da camada do núcleo para a tela (o IPC só leva dados simples). */
export interface ErroSerializado {
  codigo: string;
  mensagem: string;
  detalhes?: ProblemaDeCampo[];
  bloqueadoAte?: string;
}

export type RespostaDoNucleo<T> = { ok: true; valor: T } | { ok: false; erro: ErroSerializado };

/** Avisos do núcleo para as telas: o estado mudou (chave, sessão, fila) ou os dados mudaram (algo salvo ou sincronizado). */
export type EventoDoNucleo = { tipo: 'estado'; estado: EstadoDoApp } | { tipo: 'dados' };

export const CANAL_DE_CHAMADAS = 'medicalfield:nucleo';
export const CANAL_DE_EVENTOS = 'medicalfield:evento';

/** O que o preload expõe para as telas em `window.medicalfield`. */
export interface PonteDoNucleo {
  chamar(metodo: MetodoDoNucleo, argumentos: unknown[]): Promise<RespostaDoNucleo<unknown>>;
  aoAvisar(ouvinte: (evento: EventoDoNucleo) => void): () => void;
}
