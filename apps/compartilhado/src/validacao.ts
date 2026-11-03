/**
 * Regras dos formulários (docs/09-ficha-e-dominio.md), iguais às do servidor (ms-clinico). O app cliente
 * confere antes de salvar, para não deixar nada inválido parado na fila. Os nomes dos campos são os da API
 * ("cpf", "contato.email", "medicamentos.0.dose"...), como nos erros 400 dos serviços.
 */
import type { CorTriagem, Protocolo, Sexo, TipoDesfecho, TipoOcorrencia, TipoSanguineo, Unidade, Via } from './tipos';

export interface ProblemaDeCampo {
  campo: string;
  mensagem: string;
}

export const SEXOS: Sexo[] = ['MASCULINO', 'FEMININO', 'OUTRO', 'NAO_INFORMADO'];
export const TIPOS_SANGUINEOS: TipoSanguineo[] = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'DESCONHECIDO'];
export const TIPOS_OCORRENCIA: TipoOcorrencia[] = ['CLINICA', 'TRAUMA', 'OBSTETRICA', 'PSIQUIATRICA', 'OUTRO'];
export const DESFECHOS: TipoDesfecho[] = ['ENCAMINHADO_HOSPITAL', 'LIBERADO_NO_LOCAL', 'RECUSOU_ATENDIMENTO', 'OBITO'];
export const UNIDADES: Unidade[] = ['MG', 'MCG', 'G', 'ML', 'UI', 'GOTA', 'COMPRIMIDO', 'AMPOLA', 'OUTRA'];
export const VIAS: Via[] = [
  'INTRAVENOSA',
  'INTRAMUSCULAR',
  'SUBCUTANEA',
  'ORAL',
  'SUBLINGUAL',
  'INALATORIA',
  'INTRAOSSEA',
  'TOPICA',
  'OUTRA',
];

/** As cores dependem do protocolo de triagem. */
export const CORES_POR_PROTOCOLO: Record<Protocolo, CorTriagem[]> = {
  MANCHESTER: ['VERMELHO', 'LARANJA', 'AMARELO', 'VERDE', 'AZUL'],
  START: ['VERMELHO', 'AMARELO', 'VERDE', 'PRETO'],
};

/** Faixas que só barram erro de digitação; não são alertas clínicos (D-20). */
export const FAIXAS_SINAIS_VITAIS = {
  paSistolica: [0, 300],
  paDiastolica: [0, 200],
  frequenciaCardiaca: [0, 300],
  frequenciaRespiratoria: [0, 80],
  spo2: [0, 100],
  temperatura: [25, 45],
  glicemia: [0, 1500],
} as const;

export const FORMATO_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Dígitos verificadores do CPF (só números, 11 dígitos, não todos iguais). */
export function cpfValido(cpf: string): boolean {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const digitos = cpf.split('').map(Number);
  for (const tamanho of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < tamanho; i += 1) soma += (digitos[i] ?? 0) * (tamanho + 1 - i);
    const resto = (soma * 10) % 11;
    if ((resto === 10 ? 0 : resto) !== digitos[tamanho]) return false;
  }
  return true;
}

export interface DadosContato {
  nome?: string | null;
  parentesco?: string | null;
  telefone?: string | null;
  email?: string | null;
}

export interface DadosPessoa {
  nome: string;
  cpf?: string | null;
  dataNascimento?: string | null;
  sexo?: Sexo | null;
  telefone?: string | null;
  email?: string | null;
  contato?: DadosContato | null;
}

export interface DadosProntuario {
  tipoSanguineo?: TipoSanguineo | null;
  alergias?: string | null;
  comorbidades?: string | null;
  medicamentosUsoContinuo?: string | null;
  observacoes?: string | null;
}

export interface DadosMedicamentoAdministrado {
  medicamentoId: string;
  dose: number | null;
  unidade: Unidade;
  via: Via;
  horario: string;
  observacao?: string | null;
}

export interface DadosAtendimento {
  dataHora: string;
  localOcorrencia?: string | null;
  tipoOcorrencia: TipoOcorrencia | null;
  queixaPrincipal: string;
  triagem: { protocolo: Protocolo | null; cor: CorTriagem | null };
  glasgow?: { ocular: number | null; verbal: number | null; motora: number | null } | null;
  sinaisVitais?: Partial<Record<keyof typeof FAIXAS_SINAIS_VITAIS, number | null>> | null;
  medicamentos: DadosMedicamentoAdministrado[];
  procedimentos?: string | null;
  desfecho: { tipo: TipoDesfecho | null; destino?: string | null };
  observacoes?: string | null;
}

/** Um minuto de folga para o relógio do aparelho; o servidor aceita até 1 hora (D-34). */
const FOLGA_DO_RELOGIO_MS = 60_000;

class Problemas {
  readonly lista: ProblemaDeCampo[] = [];

  add(campo: string, mensagem: string): void {
    this.lista.push({ campo, mensagem });
  }

  tamanho(campo: string, valor: string | null | undefined, maximo: number): void {
    if (valor && valor.length > maximo) this.add(campo, `muito longo (máximo ${maximo} caracteres)`);
  }

  email(campo: string, valor: string | null | undefined): void {
    if (valor && !FORMATO_EMAIL.test(valor.trim())) this.add(campo, 'formato inválido (esperado: email)');
  }
}

export function validarPessoa(dados: DadosPessoa, hoje: string): ProblemaDeCampo[] {
  const p = new Problemas();
  if (!dados.nome?.trim()) p.add('nome', 'campo obrigatório');
  p.tamanho('nome', dados.nome, 200);
  if (dados.cpf && !cpfValido(dados.cpf)) p.add('cpf', 'CPF inválido');
  if (dados.dataNascimento && dados.dataNascimento > hoje) p.add('dataNascimento', 'não pode ser no futuro');
  if (dados.sexo && !SEXOS.includes(dados.sexo)) p.add('sexo', 'valor não permitido');
  p.tamanho('telefone', dados.telefone, 30);
  p.email('email', dados.email);
  p.tamanho('email', dados.email, 200);
  const contato = dados.contato ?? {};
  p.tamanho('contato.nome', contato.nome, 200);
  p.tamanho('contato.parentesco', contato.parentesco, 50);
  p.tamanho('contato.telefone', contato.telefone, 30);
  p.email('contato.email', contato.email);
  return p.lista;
}

export function validarProntuario(dados: DadosProntuario): ProblemaDeCampo[] {
  const p = new Problemas();
  if (dados.tipoSanguineo && !TIPOS_SANGUINEOS.includes(dados.tipoSanguineo)) p.add('tipoSanguineo', 'valor não permitido');
  for (const campo of ['alergias', 'comorbidades', 'medicamentosUsoContinuo', 'observacoes'] as const) {
    p.tamanho(campo, dados[campo], 2000);
  }
  return p.lista;
}

export function validarAtendimento(dados: DadosAtendimento, agora: Date): ProblemaDeCampo[] {
  const p = new Problemas();
  const limite = agora.getTime() + FOLGA_DO_RELOGIO_MS;
  const instante = Date.parse(dados.dataHora);
  if (!dados.dataHora || Number.isNaN(instante)) p.add('dataHora', 'campo obrigatório');
  else if (instante > limite) p.add('dataHora', 'não pode estar no futuro');
  p.tamanho('localOcorrencia', dados.localOcorrencia, 300);
  if (!dados.tipoOcorrencia) p.add('tipoOcorrencia', 'campo obrigatório');
  if (!dados.queixaPrincipal?.trim()) p.add('queixaPrincipal', 'campo obrigatório');
  p.tamanho('queixaPrincipal', dados.queixaPrincipal, 2000);

  const { protocolo, cor } = dados.triagem;
  if (!protocolo) p.add('triagem.protocolo', 'campo obrigatório');
  if (!cor) p.add('triagem.cor', 'campo obrigatório');
  else if (protocolo && !CORES_POR_PROTOCOLO[protocolo].includes(cor)) {
    p.add('triagem.cor', `cor não existe no protocolo ${protocolo === 'START' ? 'START' : 'Manchester'}`);
  }

  const glasgow = dados.glasgow;
  if (glasgow) {
    const itens = [glasgow.ocular, glasgow.verbal, glasgow.motora];
    if (itens.some((i) => i !== null) && itens.some((i) => i === null)) {
      p.add('glasgow', 'preencha os três itens da escala, ou nenhum');
    }
  }

  for (const [campo, [minimo, maximo]] of Object.entries(FAIXAS_SINAIS_VITAIS)) {
    const valor = dados.sinaisVitais?.[campo as keyof typeof FAIXAS_SINAIS_VITAIS];
    if (valor === null || valor === undefined) continue;
    if (Number.isNaN(valor) || valor < minimo || valor > maximo) {
      p.add(`sinaisVitais.${campo}`, `fora da faixa aceita (${minimo} a ${maximo})`);
    } else if (campo === 'temperatura' ? Math.round(valor * 10) / 10 !== valor : !Number.isInteger(valor)) {
      // No servidor, a temperatura tem uma casa decimal e os outros sinais são números inteiros
      p.add(`sinaisVitais.${campo}`, campo === 'temperatura' ? 'no máximo 1 casa decimal' : 'precisa ser um número inteiro');
    }
  }

  if (dados.medicamentos.length > 50) p.add('medicamentos', 'no máximo 50 medicamentos por atendimento');
  dados.medicamentos.forEach((m, i) => {
    if (!m.medicamentoId) p.add(`medicamentos.${i}.medicamentoId`, 'campo obrigatório');
    if (m.dose === null || m.dose === undefined || Number.isNaN(m.dose)) p.add(`medicamentos.${i}.dose`, 'campo obrigatório');
    else if (m.dose <= 0) p.add(`medicamentos.${i}.dose`, 'precisa ser maior que zero');
    else if (Math.round(m.dose * 1000) / 1000 !== m.dose) p.add(`medicamentos.${i}.dose`, 'no máximo 3 casas decimais');
    else if (m.dose >= 10_000_000) p.add(`medicamentos.${i}.dose`, 'valor alto demais');
    if (!UNIDADES.includes(m.unidade)) p.add(`medicamentos.${i}.unidade`, 'campo obrigatório');
    if (!VIAS.includes(m.via)) p.add(`medicamentos.${i}.via`, 'campo obrigatório');
    const horario = Date.parse(m.horario);
    if (!m.horario || Number.isNaN(horario)) p.add(`medicamentos.${i}.horario`, 'campo obrigatório');
    else if (horario > limite) p.add(`medicamentos.${i}.horario`, 'não pode estar no futuro');
    p.tamanho(`medicamentos.${i}.observacao`, m.observacao, 500);
  });

  p.tamanho('procedimentos', dados.procedimentos, 2000);
  if (!dados.desfecho.tipo) p.add('desfecho.tipo', 'campo obrigatório');
  if (dados.desfecho.tipo === 'ENCAMINHADO_HOSPITAL' && !dados.desfecho.destino?.trim()) {
    p.add('desfecho.destino', 'informe o hospital de destino');
  }
  p.tamanho('desfecho.destino', dados.desfecho.destino, 200);
  p.tamanho('observacoes', dados.observacoes, 2000);
  return p.lista;
}
