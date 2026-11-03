import type {
  Atendimento,
  CorTriagem,
  MedicamentoAdministrado,
  Protocolo,
  TipoDesfecho,
  TipoOcorrencia,
  Unidade,
  Via,
} from '@compartilhado/tipos';
import type { AtendimentoLocal, AtendimentoResumoLocal, EstadoSync } from '../../../comum/contrato';
import type { BancoLocal } from '../banco';
import {
  COLUNAS_DA_ORIGEM,
  type LinhaComOrigem,
  estadoDaLinha,
  origemDaLinha,
  parametrosDaOrigem,
  sincronizacaoDaLinha,
  sqlDeInsert,
  sqlDeUpsert,
} from './comum';

interface Linha extends LinhaComOrigem {
  id: string;
  prontuario_id: string;
  data_hora: string;
  local_ocorrencia: string | null;
  tipo_ocorrencia: string;
  queixa_principal: string;
  triagem_protocolo: string;
  triagem_cor: string;
  glasgow_ocular: number | null;
  glasgow_verbal: number | null;
  glasgow_motora: number | null;
  pa_sistolica: number | null;
  pa_diastolica: number | null;
  freq_cardiaca: number | null;
  freq_respiratoria: number | null;
  spo2: number | null;
  temperatura: number | null;
  glicemia: number | null;
  procedimentos: string | null;
  desfecho: string;
  destino: string | null;
  observacoes: string | null;
}

interface LinhaDoItem {
  id: string;
  atendimento_id: string;
  medicamento_id: string;
  nome: string | null;
  nome_do_catalogo: string | null;
  dose: number;
  unidade: string;
  via: string;
  horario: string;
  observacao: string | null;
}

interface LinhaDoResumo extends Linha {
  pessoa_id: string;
  pessoa_nome: string;
  pessoa_cpf: string | null;
}

const COLUNAS = [
  'id',
  'prontuario_id',
  'data_hora',
  'local_ocorrencia',
  'tipo_ocorrencia',
  'queixa_principal',
  'triagem_protocolo',
  'triagem_cor',
  'glasgow_ocular',
  'glasgow_verbal',
  'glasgow_motora',
  'pa_sistolica',
  'pa_diastolica',
  'freq_cardiaca',
  'freq_respiratoria',
  'spo2',
  'temperatura',
  'glicemia',
  'procedimentos',
  'desfecho',
  'destino',
  'observacoes',
  ...COLUNAS_DA_ORIGEM,
];

const COLUNAS_DO_ITEM = ['id', 'atendimento_id', 'medicamento_id', 'nome', 'dose', 'unidade', 'via', 'horario', 'observacao'];

function paraAtendimento(l: Linha, itens: MedicamentoAdministrado[]): AtendimentoLocal {
  const temGlasgow = l.glasgow_ocular !== null && l.glasgow_verbal !== null && l.glasgow_motora !== null;
  const sinais = {
    paSistolica: l.pa_sistolica,
    paDiastolica: l.pa_diastolica,
    frequenciaCardiaca: l.freq_cardiaca,
    frequenciaRespiratoria: l.freq_respiratoria,
    spo2: l.spo2,
    temperatura: l.temperatura,
    glicemia: l.glicemia,
  };
  return {
    id: l.id,
    prontuarioId: l.prontuario_id,
    dataHora: l.data_hora,
    localOcorrencia: l.local_ocorrencia,
    tipoOcorrencia: l.tipo_ocorrencia as TipoOcorrencia,
    queixaPrincipal: l.queixa_principal,
    triagem: { protocolo: l.triagem_protocolo as Protocolo, cor: l.triagem_cor as CorTriagem },
    glasgow: temGlasgow
      ? {
          ocular: l.glasgow_ocular as number,
          verbal: l.glasgow_verbal as number,
          motora: l.glasgow_motora as number,
          total: (l.glasgow_ocular as number) + (l.glasgow_verbal as number) + (l.glasgow_motora as number),
        }
      : null,
    sinaisVitais: Object.values(sinais).some((v) => v !== null) ? sinais : null,
    medicamentos: itens,
    procedimentos: l.procedimentos,
    desfecho: { tipo: l.desfecho as TipoDesfecho, destino: l.destino },
    observacoes: l.observacoes,
    origem: origemDaLinha(l),
    sincronizacao: sincronizacaoDaLinha(l),
    estadoSync: estadoDaLinha(l),
  };
}

const paraItem = (l: LinhaDoItem): MedicamentoAdministrado => ({
  id: l.id,
  medicamentoId: l.medicamento_id,
  nome: l.nome ?? l.nome_do_catalogo ?? '(medicamento)',
  dose: l.dose,
  unidade: l.unidade as Unidade,
  via: l.via as Via,
  horario: l.horario,
  observacao: l.observacao,
});

function parametros(a: Omit<AtendimentoLocal, 'estadoSync'>, estado: EstadoSync) {
  return {
    id: a.id,
    prontuario_id: a.prontuarioId,
    data_hora: a.dataHora,
    local_ocorrencia: a.localOcorrencia,
    tipo_ocorrencia: a.tipoOcorrencia,
    queixa_principal: a.queixaPrincipal,
    triagem_protocolo: a.triagem.protocolo,
    triagem_cor: a.triagem.cor,
    glasgow_ocular: a.glasgow?.ocular ?? null,
    glasgow_verbal: a.glasgow?.verbal ?? null,
    glasgow_motora: a.glasgow?.motora ?? null,
    pa_sistolica: a.sinaisVitais?.paSistolica ?? null,
    pa_diastolica: a.sinaisVitais?.paDiastolica ?? null,
    freq_cardiaca: a.sinaisVitais?.frequenciaCardiaca ?? null,
    freq_respiratoria: a.sinaisVitais?.frequenciaRespiratoria ?? null,
    spo2: a.sinaisVitais?.spo2 ?? null,
    temperatura: a.sinaisVitais?.temperatura ?? null,
    glicemia: a.sinaisVitais?.glicemia ?? null,
    procedimentos: a.procedimentos,
    desfecho: a.desfecho.tipo,
    destino: a.desfecho.destino,
    observacoes: a.observacoes,
    ...parametrosDaOrigem(a.origem, a.sincronizacao, estado),
  };
}

const INSERT = sqlDeInsert('atendimento', COLUNAS);
const UPSERT = sqlDeUpsert('atendimento', COLUNAS);
const INSERT_ITEM = sqlDeInsert('atendimento_medicamento', COLUNAS_DO_ITEM);

const SELECT_DO_RESUMO = `
  SELECT a.*, p.id AS pessoa_id, p.nome AS pessoa_nome, p.cpf AS pessoa_cpf
  FROM atendimento a
  JOIN prontuario pr ON pr.id = a.prontuario_id
  JOIN pessoa p ON p.id = pr.pessoa_id`;

export class RepositorioAtendimentos {
  constructor(private readonly banco: BancoLocal) {}

  inserirLocal(atendimento: Omit<AtendimentoLocal, 'estadoSync' | 'sincronizacao'>): void {
    this.banco.executar(INSERT, parametros({ ...atendimento, sincronizacao: null }, 'PENDENTE'));
    this.gravarItens(atendimento.id, atendimento.medicamentos);
  }

  /** A versão do servidor substitui a local, inclusive a lista de medicamentos administrados. */
  gravarDoServidor(atendimento: Atendimento): void {
    this.banco.executar(UPSERT, parametros(atendimento, 'SINCRONIZADO'));
    this.banco.executar('DELETE FROM atendimento_medicamento WHERE atendimento_id = :id', { id: atendimento.id });
    this.gravarItens(atendimento.id, atendimento.medicamentos);
  }

  marcar(id: string, estado: EstadoSync): void {
    this.banco.executar('UPDATE atendimento SET estado_sync = :estado WHERE id = :id', { id, estado });
  }

  buscar(id: string): AtendimentoLocal | null {
    const linha = this.banco.um<Linha>('SELECT * FROM atendimento WHERE id = :id', { id });
    return linha ? paraAtendimento(linha, this.itens(id)) : null;
  }

  /** Lista do aparelho, do mais recente para o mais antigo. */
  resumos(pessoaId?: string): AtendimentoResumoLocal[] {
    const linhas = pessoaId
      ? this.banco.todos<LinhaDoResumo>(`${SELECT_DO_RESUMO} WHERE p.id = :pessoaId ORDER BY a.data_hora DESC`, { pessoaId })
      : this.banco.todos<LinhaDoResumo>(`${SELECT_DO_RESUMO} ORDER BY a.data_hora DESC`);
    return linhas.map((l) => {
      const completo = paraAtendimento(l, []);
      return {
        id: completo.id,
        dataHora: completo.dataHora,
        pessoa: { id: l.pessoa_id, nome: l.pessoa_nome, cpf: l.pessoa_cpf },
        tipoOcorrencia: completo.tipoOcorrencia,
        triagem: completo.triagem,
        desfecho: completo.desfecho,
        origem: completo.origem,
        sincronizacao: completo.sincronizacao,
        estadoSync: completo.estadoSync,
      };
    });
  }

  private itens(atendimentoId: string): MedicamentoAdministrado[] {
    return this.banco
      .todos<LinhaDoItem>(
        `SELECT i.*, m.nome AS nome_do_catalogo
         FROM atendimento_medicamento i LEFT JOIN medicamento m ON m.id = i.medicamento_id
         WHERE i.atendimento_id = :atendimentoId ORDER BY i.horario`,
        { atendimentoId },
      )
      .map(paraItem);
  }

  private gravarItens(atendimentoId: string, itens: MedicamentoAdministrado[]): void {
    for (const item of itens) {
      this.banco.executar(INSERT_ITEM, {
        id: item.id,
        atendimento_id: atendimentoId,
        medicamento_id: item.medicamentoId,
        nome: item.nome,
        dose: item.dose,
        unidade: item.unidade,
        via: item.via,
        horario: item.horario,
        observacao: item.observacao,
      });
    }
  }
}
