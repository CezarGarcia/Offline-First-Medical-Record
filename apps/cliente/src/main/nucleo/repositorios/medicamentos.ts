import type { Medicamento, Unidade } from '@compartilhado/tipos';
import type { BancoLocal } from '../banco';
import { sqlDeUpsert } from './comum';

interface Linha {
  id: string;
  nome: string;
  apresentacao: string | null;
  unidade_padrao: string;
  ativo: number;
  atualizado_em: string;
}

const paraMedicamento = (l: Linha): Medicamento => ({
  id: l.id,
  nome: l.nome,
  apresentacao: l.apresentacao,
  unidadePadrao: l.unidade_padrao as Unidade,
  ativo: l.ativo === 1,
  atualizadoEm: l.atualizado_em,
});

const UPSERT = sqlDeUpsert('medicamento', ['id', 'nome', 'apresentacao', 'unidade_padrao', 'ativo', 'atualizado_em']);

/** Catálogo de medicamentos: só vem do servidor (cadastro de apoio, inserido direto no banco central). */
export class RepositorioMedicamentos {
  constructor(private readonly banco: BancoLocal) {}

  gravarDoServidor(medicamento: Medicamento): void {
    this.banco.executar(UPSERT, {
      id: medicamento.id,
      nome: medicamento.nome,
      apresentacao: medicamento.apresentacao,
      unidade_padrao: medicamento.unidadePadrao,
      ativo: medicamento.ativo,
      atualizado_em: medicamento.atualizadoEm,
    });
  }

  /** Só os ativos aparecem para escolher; os inativos continuam nos atendimentos antigos. */
  ativos(): Medicamento[] {
    return this.banco
      .todos<Linha>('SELECT * FROM medicamento WHERE ativo = 1 ORDER BY nome COLLATE NOCASE')
      .map(paraMedicamento);
  }

  buscar(id: string): Medicamento | null {
    const linha = this.banco.um<Linha>('SELECT * FROM medicamento WHERE id = :id', { id });
    return linha ? paraMedicamento(linha) : null;
  }
}
