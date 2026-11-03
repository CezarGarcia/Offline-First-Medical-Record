/**
 * Como cada valor das listas fixas aparece nas telas (os mesmos rótulos do PDF, em servicos/ms-docs).
 * Um valor fora da lista aparece como veio: nunca some da tela.
 */
import type {
  CorTriagem,
  Modo,
  Perfil,
  Protocolo,
  Sexo,
  TipoDesfecho,
  TipoDestinatario,
  TipoOcorrencia,
  TipoRegistro,
  Unidade,
  Via,
} from './tipos';

export const SEXO: Record<Sexo, string> = {
  MASCULINO: 'Masculino',
  FEMININO: 'Feminino',
  OUTRO: 'Outro',
  NAO_INFORMADO: 'Não informado',
};

export const TIPO_OCORRENCIA: Record<TipoOcorrencia, string> = {
  CLINICA: 'Clínica',
  TRAUMA: 'Trauma',
  OBSTETRICA: 'Obstétrica',
  PSIQUIATRICA: 'Psiquiátrica',
  OUTRO: 'Outro',
};

export const PROTOCOLO: Record<Protocolo, string> = { MANCHESTER: 'Manchester', START: 'START' };

export const COR: Record<CorTriagem, string> = {
  VERMELHO: 'Vermelho',
  LARANJA: 'Laranja',
  AMARELO: 'Amarelo',
  VERDE: 'Verde',
  AZUL: 'Azul',
  PRETO: 'Preto',
};

/** Fundo e texto da etiqueta da triagem (as mesmas cores do PDF). */
export const COR_HEX: Record<CorTriagem, { fundo: string; texto: string }> = {
  VERMELHO: { fundo: '#c62828', texto: '#ffffff' },
  LARANJA: { fundo: '#ef6c00', texto: '#ffffff' },
  AMARELO: { fundo: '#f9c80e', texto: '#1f2937' },
  VERDE: { fundo: '#2e7d32', texto: '#ffffff' },
  AZUL: { fundo: '#1565c0', texto: '#ffffff' },
  PRETO: { fundo: '#1f2937', texto: '#ffffff' },
};

/** docs/09-ficha-e-dominio.md, seção 9.4 (Triagem). */
export const SIGNIFICADO_DA_COR: Record<Protocolo, Partial<Record<CorTriagem, string>>> = {
  MANCHESTER: {
    VERMELHO: 'Emergência · atendimento imediato',
    LARANJA: 'Muito urgente · até 10 min',
    AMARELO: 'Urgente · até 60 min',
    VERDE: 'Pouco urgente · até 120 min',
    AZUL: 'Não urgente · até 240 min',
  },
  START: {
    VERMELHO: 'Atendimento imediato',
    AMARELO: 'Atendimento pode ser adiado',
    VERDE: 'Ferimentos leves · pode esperar',
    PRETO: 'Óbito ou sem chance de sobrevida',
  },
};

export const GLASGOW_OCULAR: Record<number, string> = { 4: 'Espontânea', 3: 'Ao som', 2: 'À pressão', 1: 'Ausente' };
export const GLASGOW_VERBAL: Record<number, string> = {
  5: 'Orientada',
  4: 'Confusa',
  3: 'Palavras',
  2: 'Sons',
  1: 'Ausente',
};
export const GLASGOW_MOTORA: Record<number, string> = {
  6: 'Obedece a comandos',
  5: 'Localiza',
  4: 'Flexão normal',
  3: 'Flexão anormal',
  2: 'Extensão',
  1: 'Ausente',
};

export const UNIDADE: Record<Unidade, string> = {
  MG: 'mg',
  MCG: 'mcg',
  G: 'g',
  ML: 'mL',
  UI: 'UI',
  GOTA: 'gota(s)',
  COMPRIMIDO: 'comprimido(s)',
  AMPOLA: 'ampola(s)',
  OUTRA: '(outra unidade)',
};

export const VIA: Record<Via, string> = {
  INTRAVENOSA: 'Intravenosa',
  INTRAMUSCULAR: 'Intramuscular',
  SUBCUTANEA: 'Subcutânea',
  ORAL: 'Oral',
  SUBLINGUAL: 'Sublingual',
  INALATORIA: 'Inalatória',
  INTRAOSSEA: 'Intraóssea',
  TOPICA: 'Tópica',
  OUTRA: 'Outra',
};

export const DESFECHO: Record<TipoDesfecho, string> = {
  ENCAMINHADO_HOSPITAL: 'Encaminhado ao hospital',
  LIBERADO_NO_LOCAL: 'Liberado no local',
  RECUSOU_ATENDIMENTO: 'Recusou atendimento',
  OBITO: 'Óbito',
};

export const MODO: Record<Modo, string> = { ONLINE: 'Online', OFFLINE: 'Offline' };

export const TIPO_REGISTRO: Record<TipoRegistro, string> = {
  CRM: 'CRM',
  COREN: 'COREN',
  SOCORRISTA: 'ID de Socorrista',
};

export const PERFIL: Record<Perfil, string> = { ADMIN: 'Administrador', OPERACIONAL: 'Operacional' };

export const DESTINATARIO: Record<TipoDestinatario, string> = {
  PACIENTE: 'Paciente',
  FAMILIAR: 'Familiar',
  OUTRO: 'Outro endereço',
};

export const ENTIDADE_DO_CONFLITO: Record<string, string> = { PESSOA: 'Pessoa', PRONTUARIO: 'Prontuário' };

export const MOTIVO_DO_CONFLITO: Record<string, string> = {
  CPF_DUPLICADO: 'CPF já cadastrado em outra pessoa',
  PRONTUARIO_DUPLICADO: 'Segundo prontuário da mesma pessoa',
};

export const ESTRATEGIA: Record<string, string> = {
  MAIS_RECENTE_VENCE: 'Mais recente vence',
  SERVIDOR_VENCE: 'Servidor vence',
};

export const TIPO_DA_DIFERENCA: Record<string, string> = {
  CONFLITO: 'Conflito (os dois preenchidos)',
  COMPLEMENTO: 'Complemento (só um preenchido)',
};

export const ORIGEM_DO_VALOR: Record<string, string> = {
  RECEBIDO: 'do registro que chegou',
  EXISTENTE: 'do registro que já existia',
};

/** Ações registradas pelo app cliente (docs/08-seguranca-e-auditoria.md, seção 8.10). */
export const ACAO_DO_CLIENTE: Record<string, string> = {
  LOGIN_ONLINE: 'Login online',
  LOGIN_OFFLINE: 'Login offline',
  LOGIN_FALHOU: 'Login falhou',
  LOGOUT: 'Saída',
  CONECTIVIDADE_ALTERADA: 'Chave Online/Offline alterada',
  PESSOA_CRIADA: 'Pessoa cadastrada',
  PRONTUARIO_CRIADO: 'Prontuário cadastrado',
  ATENDIMENTO_CRIADO: 'Atendimento registrado',
  EMAIL_SOLICITADO: 'E-mail da ficha pedido',
  PDF_BAIXADO: 'PDF da ficha baixado',
  SINCRONIZACAO_INICIADA: 'Sincronização iniciada',
  SINCRONIZACAO_CONCLUIDA: 'Sincronização concluída',
  SINCRONIZACAO_FALHOU: 'Sincronização falhou',
  REGISTRO_UNIFICADO: 'Registro unificado pelo servidor',
  ITEM_COM_ERRO: 'Item da fila com erro',
};

/** Nomes dos campos que aparecem nas diferenças de uma unificação. */
export const CAMPO: Record<string, string> = {
  nome: 'Nome',
  cpf: 'CPF',
  dataNascimento: 'Data de nascimento',
  sexo: 'Sexo',
  telefone: 'Telefone',
  email: 'E-mail',
  'contato.nome': 'Nome do contato',
  'contato.parentesco': 'Parentesco do contato',
  'contato.telefone': 'Telefone do contato',
  'contato.email': 'E-mail do contato',
  tipoSanguineo: 'Tipo sanguíneo',
  alergias: 'Alergias',
  comorbidades: 'Comorbidades',
  medicamentosUsoContinuo: 'Medicamentos de uso contínuo',
  observacoes: 'Observações',
};

export function rotulo<T extends string>(tabela: Partial<Record<T, string>>, valor: T | null | undefined): string | null {
  if (valor === null || valor === undefined) return null;
  return tabela[valor] ?? valor;
}
