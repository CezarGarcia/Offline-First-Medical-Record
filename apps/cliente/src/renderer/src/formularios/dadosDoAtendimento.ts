/**
 * Os dados do formulário do atendimento, separados da tela: o estado do formulário (o que cada campo guarda,
 * com datas no horário de Brasília) e a conversão para o pedido do núcleo, no formato da API. Testado em
 * testes/formulario.test.ts.
 */
import { doCampoDeDataHora, paraCampoDeDataHora } from '@compartilhado/formatos';
import type { CorTriagem, Protocolo, TipoDesfecho, TipoOcorrencia, Unidade, Via } from '@compartilhado/tipos';
import type { DadosAtendimento, FAIXAS_SINAIS_VITAIS } from '@compartilhado/validacao';

export type SinalVital = keyof typeof FAIXAS_SINAIS_VITAIS;

export const SINAIS: { campo: SinalVital; rotulo: string; unidade: string; decimal?: boolean }[] = [
  { campo: 'paSistolica', rotulo: 'PA sistólica', unidade: 'mmHg' },
  { campo: 'paDiastolica', rotulo: 'PA diastólica', unidade: 'mmHg' },
  { campo: 'frequenciaCardiaca', rotulo: 'Frequência cardíaca', unidade: 'bpm' },
  { campo: 'frequenciaRespiratoria', rotulo: 'Frequência respiratória', unidade: 'irpm' },
  { campo: 'spo2', rotulo: 'Saturação de O₂ (SpO₂)', unidade: '%' },
  { campo: 'temperatura', rotulo: 'Temperatura', unidade: '°C', decimal: true },
  { campo: 'glicemia', rotulo: 'Glicemia capilar', unidade: 'mg/dL' },
];

export interface LinhaDeMedicamento {
  chave: number;
  medicamentoId: string | null;
  dose: number | string;
  unidade: Unidade | null;
  via: Via | null;
  /** "AAAA-MM-DD HH:mm:ss" em Brasília */
  horario: string | null;
  observacao: string;
}

export interface FormularioDoAtendimento {
  dataHora: string | null;
  localOcorrencia: string;
  tipoOcorrencia: TipoOcorrencia | null;
  queixaPrincipal: string;
  protocolo: Protocolo | null;
  cor: CorTriagem | null;
  glasgow: { ocular: string | null; verbal: string | null; motora: string | null };
  sinais: Record<SinalVital, number | string>;
  medicamentos: LinhaDeMedicamento[];
  procedimentos: string;
  desfecho: TipoDesfecho | null;
  destino: string;
  observacoes: string;
}

export const agoraEmBrasilia = () => paraCampoDeDataHora(new Date().toISOString());

export function formularioVazio(): FormularioDoAtendimento {
  return {
    dataHora: agoraEmBrasilia(),
    localOcorrencia: '',
    tipoOcorrencia: null,
    queixaPrincipal: '',
    protocolo: 'MANCHESTER',
    cor: null,
    glasgow: { ocular: null, verbal: null, motora: null },
    sinais: Object.fromEntries(SINAIS.map((s) => [s.campo, ''])) as Record<SinalVital, string>,
    medicamentos: [],
    procedimentos: '',
    desfecho: null,
    destino: '',
    observacoes: '',
  };
}

const numeroOuNulo = (valor: number | string): number | null => (typeof valor === 'number' && Number.isFinite(valor) ? valor : null);
const inteiroOuNulo = (valor: string | null): number | null => (valor ? Number(valor) : null);

/** O formulário da tela vira o pedido do núcleo (o mesmo formato da API). */
export function paraDados(f: FormularioDoAtendimento): DadosAtendimento {
  const glasgowPreenchido = Boolean(f.glasgow.ocular || f.glasgow.verbal || f.glasgow.motora);
  return {
    dataHora: doCampoDeDataHora(f.dataHora) ?? '',
    localOcorrencia: f.localOcorrencia,
    tipoOcorrencia: f.tipoOcorrencia,
    queixaPrincipal: f.queixaPrincipal,
    triagem: { protocolo: f.protocolo, cor: f.cor },
    glasgow: glasgowPreenchido
      ? { ocular: inteiroOuNulo(f.glasgow.ocular), verbal: inteiroOuNulo(f.glasgow.verbal), motora: inteiroOuNulo(f.glasgow.motora) }
      : null,
    sinaisVitais: Object.fromEntries(SINAIS.map((s) => [s.campo, numeroOuNulo(f.sinais[s.campo])])),
    medicamentos: f.medicamentos.map((m) => ({
      medicamentoId: m.medicamentoId ?? '',
      dose: numeroOuNulo(m.dose),
      unidade: m.unidade as Unidade,
      via: m.via as Via,
      horario: doCampoDeDataHora(m.horario) ?? '',
      observacao: m.observacao,
    })),
    procedimentos: f.procedimentos,
    desfecho: { tipo: f.desfecho, destino: f.desfecho === 'ENCAMINHADO_HOSPITAL' ? f.destino : null },
    observacoes: f.observacoes,
  };
}
