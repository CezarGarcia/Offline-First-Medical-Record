import type { Prontuario, TipoSanguineo } from '@compartilhado/tipos';
import type { EstadoSync, ProntuarioLocal } from '../../../comum/contrato';
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
  pessoa_id: string;
  tipo_sanguineo: string | null;
  alergias: string | null;
  comorbidades: string | null;
  medicamentos_uso_continuo: string | null;
  observacoes: string | null;
}

const COLUNAS = [
  'id',
  'pessoa_id',
  'tipo_sanguineo',
  'alergias',
  'comorbidades',
  'medicamentos_uso_continuo',
  'observacoes',
  ...COLUNAS_DA_ORIGEM,
];

const paraProntuario = (l: Linha): ProntuarioLocal => ({
  id: l.id,
  pessoaId: l.pessoa_id,
  tipoSanguineo: l.tipo_sanguineo as TipoSanguineo | null,
  alergias: l.alergias,
  comorbidades: l.comorbidades,
  medicamentosUsoContinuo: l.medicamentos_uso_continuo,
  observacoes: l.observacoes,
  origem: origemDaLinha(l),
  sincronizacao: sincronizacaoDaLinha(l),
  estadoSync: estadoDaLinha(l),
});

function parametros(p: Omit<ProntuarioLocal, 'estadoSync'>, estado: EstadoSync) {
  return {
    id: p.id,
    pessoa_id: p.pessoaId,
    tipo_sanguineo: p.tipoSanguineo,
    alergias: p.alergias,
    comorbidades: p.comorbidades,
    medicamentos_uso_continuo: p.medicamentosUsoContinuo,
    observacoes: p.observacoes,
    ...parametrosDaOrigem(p.origem, p.sincronizacao, estado),
  };
}

const INSERT = sqlDeInsert('prontuario', COLUNAS);
const UPSERT = sqlDeUpsert('prontuario', COLUNAS);

export class RepositorioProntuarios {
  constructor(private readonly banco: BancoLocal) {}

  inserirLocal(prontuario: Omit<ProntuarioLocal, 'estadoSync' | 'sincronizacao'>): void {
    this.banco.executar(INSERT, parametros({ ...prontuario, sincronizacao: null }, 'PENDENTE'));
  }

  gravarDoServidor(prontuario: Prontuario): void {
    this.banco.executar(UPSERT, parametros(prontuario, 'SINCRONIZADO'));
  }

  marcar(id: string, estado: EstadoSync): void {
    this.banco.executar('UPDATE prontuario SET estado_sync = :estado WHERE id = :id', { id, estado });
  }

  buscar(id: string): ProntuarioLocal | null {
    const linha = this.banco.um<Linha>('SELECT * FROM prontuario WHERE id = :id', { id });
    return linha ? paraProntuario(linha) : null;
  }

  /** Normalmente um; dois só enquanto a unificação no servidor não resolve (docs/05, seção 5.3). */
  daPessoa(pessoaId: string): ProntuarioLocal[] {
    return this.banco
      .todos<Linha>(
        // O que já veio do servidor primeiro: é ele que vai ficar numa unificação
        `SELECT * FROM prontuario WHERE pessoa_id = :pessoaId
         ORDER BY CASE estado_sync WHEN 'SINCRONIZADO' THEN 0 ELSE 1 END, criado_em`,
        { pessoaId },
      )
      .map(paraProntuario);
  }

  /** Unificação de prontuários: os atendimentos do descartado passam para o mantido. */
  unificar(idDescartado: string, idMantido: string): void {
    if (idDescartado === idMantido) return;
    this.banco.executar('UPDATE atendimento SET prontuario_id = :mantido WHERE prontuario_id = :descartado', {
      mantido: idMantido,
      descartado: idDescartado,
    });
    this.banco.executar('DELETE FROM prontuario WHERE id = :id', { id: idDescartado });
  }
}
