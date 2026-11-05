/**
 * Formatos das respostas da API (docs/06-api.md). Usados pelo Portal Admin e pelo app cliente (D-21).
 * Datas e horas chegam em ISO 8601 UTC ("2026-11-03T13:05:00Z"); datas sem hora, como "2026-11-03".
 */

export type Uuid = string;
export type DataHoraIso = string;
export type DataIso = string;

export type TipoRegistro = 'CRM' | 'COREN' | 'SOCORRISTA';
export type Perfil = 'ADMIN' | 'OPERACIONAL';
export type Modo = 'ONLINE' | 'OFFLINE';
export type Sexo = 'MASCULINO' | 'FEMININO' | 'OUTRO' | 'NAO_INFORMADO';
export type TipoSanguineo = 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-' | 'DESCONHECIDO';
export type TipoOcorrencia = 'CLINICA' | 'TRAUMA' | 'OBSTETRICA' | 'PSIQUIATRICA' | 'OUTRO';
export type Protocolo = 'MANCHESTER' | 'START';
export type CorTriagem = 'VERMELHO' | 'LARANJA' | 'AMARELO' | 'VERDE' | 'AZUL' | 'PRETO';
export type TipoDesfecho = 'ENCAMINHADO_HOSPITAL' | 'LIBERADO_NO_LOCAL' | 'RECUSOU_ATENDIMENTO' | 'OBITO';
export type Unidade = 'MG' | 'MCG' | 'G' | 'ML' | 'UI' | 'GOTA' | 'COMPRIMIDO' | 'AMPOLA' | 'OUTRA';
export type Via =
  | 'INTRAVENOSA'
  | 'INTRAMUSCULAR'
  | 'SUBCUTANEA'
  | 'ORAL'
  | 'SUBLINGUAL'
  | 'INALATORIA'
  | 'INTRAOSSEA'
  | 'TOPICA'
  | 'OUTRA';

// ---------------------------------------------------------------- ms-auth

export interface ProfissionalResumo {
  id: Uuid;
  nome: string;
  tipoRegistro: TipoRegistro;
  registro: string;
  perfil: Perfil;
}

export interface Profissional extends ProfissionalResumo {
  ativo: boolean;
  criadoEm: DataHoraIso;
}

export interface RespostaLogin {
  tokenDeAcesso: string;
  tokenDeAcessoExpiraEm: DataHoraIso;
  refreshToken: string;
  sessaoExpiraEm: DataHoraIso;
  profissional: ProfissionalResumo;
}

/** Um profissional ativo com o hash bcrypt da senha: a réplica para o login offline (D-51). */
export interface CredencialDoServidor extends ProfissionalResumo {
  senhaHash: string;
}

export interface RespostaCredenciaisOffline {
  geradoEm: DataHoraIso;
  profissionais: CredencialDoServidor[];
}

export interface RespostaRefresh {
  tokenDeAcesso: string;
  tokenDeAcessoExpiraEm: DataHoraIso;
  sessaoExpiraEm: DataHoraIso;
}

export interface Pagina<T> {
  itens: T[];
  pagina: number;
  tamanho: number;
  total: number;
}

export interface LogAcesso {
  id: Uuid;
  dataHora: DataHoraIso;
  servico: string;
  ipCliente: string;
  profissionalId: Uuid | null;
  metodo: string;
  rota: string;
  statusCode: number;
  tempoMs: number;
  dispositivoId: Uuid | null;
  userAgent: string | null;
}

export interface LogCliente {
  id: Uuid;
  profissionalId: Uuid | null;
  dispositivoId: Uuid;
  dispositivoNome: string | null;
  dataHora: DataHoraIso;
  acao: string;
  modo: Modo;
  detalhes: Record<string, unknown> | null;
  enviadoPorId: Uuid;
  recebidoEm: DataHoraIso;
}

// ---------------------------------------------------------------- ms-clinico

/** Rastreabilidade de todo registro clínico: quem criou, onde e como (docs/05, bloco de origem). */
export interface Origem {
  criadoPorId: Uuid;
  criadoPorNome: string;
  criadoPorRegistro: string;
  criadoEm: DataHoraIso;
  dispositivoId: Uuid | null;
  dispositivoNome: string | null;
  modo: Modo;
}

export interface Sincronizacao {
  sincronizadoPorId: Uuid;
  recebidoEm: DataHoraIso;
  atualizadoEm: DataHoraIso;
}

export interface Contato {
  nome: string | null;
  parentesco: string | null;
  telefone: string | null;
  email: string | null;
}

export interface PessoaResumo {
  id: Uuid;
  nome: string;
  cpf: string | null;
}

export interface Pessoa extends PessoaResumo {
  dataNascimento: DataIso | null;
  sexo: Sexo | null;
  telefone: string | null;
  email: string | null;
  contato: Contato | null;
  origem: Origem;
  sincronizacao: Sincronizacao;
}

export interface Prontuario {
  id: Uuid;
  pessoaId: Uuid;
  tipoSanguineo: TipoSanguineo | null;
  alergias: string | null;
  comorbidades: string | null;
  medicamentosUsoContinuo: string | null;
  observacoes: string | null;
  origem: Origem;
  sincronizacao: Sincronizacao;
}

/** GET /api/prontuario: cada prontuário com um resumo da pessoa. */
export interface ProntuarioDaLista extends Prontuario {
  pessoa: PessoaResumo;
}

/** GET /api/prontuario/{id da pessoa}: com os dados completos da pessoa. */
export interface ProntuarioComPessoa extends Prontuario {
  pessoa: Pessoa;
}

export interface Triagem {
  protocolo: Protocolo;
  cor: CorTriagem;
}

export interface Glasgow {
  ocular: number;
  verbal: number;
  motora: number;
  total: number;
}

export interface SinaisVitais {
  paSistolica: number | null;
  paDiastolica: number | null;
  frequenciaCardiaca: number | null;
  frequenciaRespiratoria: number | null;
  spo2: number | null;
  temperatura: number | null;
  glicemia: number | null;
}

export interface MedicamentoAdministrado {
  id: Uuid;
  medicamentoId: Uuid;
  nome: string;
  dose: number;
  unidade: Unidade;
  via: Via;
  horario: DataHoraIso;
  observacao: string | null;
}

export interface Desfecho {
  tipo: TipoDesfecho;
  destino: string | null;
}

export interface Atendimento {
  id: Uuid;
  prontuarioId: Uuid;
  dataHora: DataHoraIso;
  localOcorrencia: string | null;
  tipoOcorrencia: TipoOcorrencia;
  queixaPrincipal: string;
  triagem: Triagem;
  glasgow: Glasgow | null;
  sinaisVitais: SinaisVitais | null;
  medicamentos: MedicamentoAdministrado[];
  procedimentos: string | null;
  desfecho: Desfecho;
  observacoes: string | null;
  origem: Origem;
  sincronizacao: Sincronizacao;
}

/** GET /api/atendimento: o resumo usado nas listas. */
export interface AtendimentoResumo {
  id: Uuid;
  dataHora: DataHoraIso;
  pessoa: PessoaResumo;
  tipoOcorrencia: TipoOcorrencia;
  triagem: Triagem;
  desfecho: Desfecho;
  origem: Origem;
  sincronizacao: Sincronizacao;
}

/** GET /api/atendimento/detalhe/{id}: o atendimento com a pessoa e o prontuário. */
export interface AtendimentoDetalhe extends Atendimento {
  pessoa: Pessoa;
  prontuario: Prontuario;
}

export interface Medicamento {
  id: Uuid;
  nome: string;
  apresentacao: string | null;
  unidadePadrao: Unidade;
  ativo: boolean;
  atualizadoEm: DataHoraIso;
}

export interface Diferenca {
  campo: string;
  tipo: 'CONFLITO' | 'COMPLEMENTO';
  valorMantido: string | null;
  valorDescartado: string | null;
  origemDoValor: 'RECEBIDO' | 'EXISTENTE';
}

export interface Conflito {
  id: Uuid;
  entidade: 'PESSOA' | 'PRONTUARIO';
  motivo: 'CPF_DUPLICADO' | 'PRONTUARIO_DUPLICADO';
  idMantido: Uuid;
  idDescartado: Uuid;
  estrategia: 'MAIS_RECENTE_VENCE' | 'SERVIDOR_VENCE';
  diferencas: Diferenca[];
  detectadoEm: DataHoraIso;
  sincronizadoPorId: Uuid | null;
  dispositivoId: Uuid | null;
  dispositivoNome: string | null;
}

// ---------------------------------------------------------------- ms-docs

export type TipoDestinatario = 'PACIENTE' | 'FAMILIAR' | 'OUTRO';

export interface EnvioEmail {
  id: Uuid;
  atendimentoId: Uuid;
  status: 'ENVIADO' | 'ERRO';
  destinatarioTipo: TipoDestinatario;
  destinatarioEmail: string;
  erro: string | null;
  tentativas: number;
  solicitadoPorId: Uuid;
  dispositivoId: Uuid | null;
  solicitadoEm: DataHoraIso;
  ultimaTentativaEm: DataHoraIso;
  enviadoEm: DataHoraIso | null;
}

// ---------------------------------------------------------------- erros (os três serviços)

export interface DetalheDeErro {
  campo: string;
  mensagem: string;
}

export interface RespostaDeErro {
  erro: string;
  mensagem: string;
  detalhes?: DetalheDeErro[];
  bloqueadoAte?: DataHoraIso;
}

// ---------------------------------------------------------------- cadastros (resposta do POST, docs/06 6.6)

export interface ResultadoDoCadastro<T> {
  resultado: 'CRIADO' | 'JA_EXISTIA' | 'UNIFICADO';
  /** O registro que ficou no servidor (numa unificação, o mantido). */
  id: Uuid;
  /** O ID que foi enviado (numa unificação, o descartado). */
  idEnviado: Uuid;
  conflitoId: Uuid | null;
  dados: T;
}

/** GET /api/sync/pull: o que mudou no servidor desde o cursor (docs/07, seção 7.7). */
export interface RespostaDoPull {
  cursor: DataHoraIso;
  medicamentos: Medicamento[];
  pessoas: Pessoa[];
  prontuarios: Prontuario[];
  atendimentos: Atendimento[];
  unificacoes: { entidade: 'PESSOA' | 'PRONTUARIO'; idDescartado: Uuid; idMantido: Uuid }[];
}
