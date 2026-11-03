import type { Modo } from '@compartilhado/tipos';
import type { LogLocal } from '../../../comum/contrato';
import type { BancoLocal } from '../banco';

interface Linha {
  id: string;
  profissional_id: string | null;
  data_hora: string;
  acao: string;
  modo: string;
  detalhes: string | null;
  enviado_em: string | null;
  profissional_nome?: string | null;
}

const paraLog = (l: Linha): LogLocal => ({
  id: l.id,
  profissionalId: l.profissional_id,
  profissionalNome: l.profissional_nome ?? null,
  dataHora: l.data_hora,
  acao: l.acao,
  modo: l.modo === 'OFFLINE' ? 'OFFLINE' : 'ONLINE',
  detalhes: l.detalhes ? (JSON.parse(l.detalhes) as Record<string, unknown>) : null,
  enviadoEm: l.enviado_em,
});

export interface NovoLog {
  id: string;
  profissionalId: string | null;
  dataHora: string;
  acao: string;
  modo: Modo;
  detalhes?: Record<string, unknown> | null;
}

/** As ações feitas no aparelho (docs/08, seção 8.10). Sobem em lote no fim de cada sincronização. */
export class RepositorioLogs {
  constructor(private readonly banco: BancoLocal) {}

  registrar(log: NovoLog): void {
    this.banco.executar(
      `INSERT INTO log_local (id, profissional_id, data_hora, acao, modo, detalhes)
       VALUES (:id, :profissional_id, :data_hora, :acao, :modo, :detalhes)`,
      {
        id: log.id,
        profissional_id: log.profissionalId,
        data_hora: log.dataHora,
        acao: log.acao,
        modo: log.modo,
        detalhes: log.detalhes ? JSON.stringify(log.detalhes) : null,
      },
    );
  }

  naoEnviados(limite: number): LogLocal[] {
    return this.banco
      .todos<Linha>('SELECT * FROM log_local WHERE enviado_em IS NULL ORDER BY data_hora LIMIT :limite', { limite })
      .map(paraLog);
  }

  marcarEnviados(ids: string[], agora: string): void {
    for (const id of ids) {
      this.banco.executar('UPDATE log_local SET enviado_em = :agora WHERE id = :id', { id, agora });
    }
  }

  listar(limite = 500): LogLocal[] {
    return this.banco
      .todos<Linha>(
        `SELECT l.*, c.nome AS profissional_nome
           FROM log_local l
           LEFT JOIN credencial_offline c ON c.profissional_id = l.profissional_id
          ORDER BY l.data_hora DESC, l.rowid DESC
          LIMIT :limite`,
        { limite },
      )
      .map(paraLog);
  }
}
