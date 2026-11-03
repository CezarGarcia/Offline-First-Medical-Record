import type pg from 'pg';

export interface NovoLogAcesso {
  dataHora: Date;
  servico: string;
  ipCliente: string;
  profissionalId: string | null;
  metodo: string;
  rota: string;
  statusCode: number;
  tempoMs: number;
  dispositivoId: string | null;
  userAgent: string | null;
}

export interface LogDoCliente {
  id: string;
  profissionalId?: string | null;
  dispositivoId: string;
  dispositivoNome?: string | null;
  dataHora: string;
  acao: string;
  modo: 'ONLINE' | 'OFFLINE';
  detalhes?: Record<string, unknown> | null;
}

export interface FiltroLogAcesso {
  servico?: string;
  profissionalId?: string;
  metodo?: string;
  status?: number;
  rota?: string;
  de?: string;
  ate?: string;
}

export interface FiltroLogCliente {
  profissionalId?: string;
  dispositivoId?: string;
  acao?: string;
  modo?: string;
  de?: string;
  ate?: string;
}

export interface Pagina<T> {
  itens: T[];
  pagina: number;
  tamanho: number;
  total: number;
}

type Condicao = [sql: string, valor: unknown] | null;

/** Monta um WHERE parametrizado: cada "?" vira o próximo $n. */
function montarFiltro(condicoes: Condicao[]): { where: string; params: unknown[] } {
  const params: unknown[] = [];
  const partes: string[] = [];
  for (const condicao of condicoes) {
    if (!condicao) continue;
    params.push(condicao[1]);
    partes.push(condicao[0].replace('?', `$${params.length}`));
  }
  return { where: partes.length ? `WHERE ${partes.join(' AND ')}` : '', params };
}

const trechoLike = (texto: string) => `%${texto.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export class RepositorioLogs {
  constructor(private readonly pool: pg.Pool) {}

  /** Usado pelo middleware de log. Sem RETURNING (os outros serviços só têm INSERT). */
  async inserirAcesso(log: NovoLogAcesso): Promise<void> {
    await this.pool.query(
      `INSERT INTO auditoria.log_acesso
         (data_hora, servico, ip_cliente, profissional_id, metodo, rota, status_code, tempo_ms, dispositivo_id, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        log.dataHora,
        log.servico,
        log.ipCliente,
        log.profissionalId,
        log.metodo,
        log.rota,
        log.statusCode,
        log.tempoMs,
        log.dispositivoId,
        log.userAgent,
      ],
    );
  }

  /** Insere o lote; IDs já recebidos são ignorados (idempotência). Devolve quantos eram novos. */
  async inserirLogsDoCliente(logs: LogDoCliente[], enviadoPorId: string): Promise<number> {
    if (logs.length === 0) return 0;
    const entrada = logs.map((log) => ({
      id: log.id,
      profissional_id: log.profissionalId ?? null,
      dispositivo_id: log.dispositivoId,
      dispositivo_nome: log.dispositivoNome ?? null,
      data_hora: log.dataHora,
      acao: log.acao,
      modo: log.modo,
      detalhes: log.detalhes ?? null,
    }));
    const { rows } = await this.pool.query<{ novos: number }>(
      `WITH entrada AS (
         SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(
           id uuid, profissional_id uuid, dispositivo_id uuid, dispositivo_nome text,
           data_hora timestamptz, acao text, modo text, detalhes jsonb)
       ), inseridos AS (
         INSERT INTO auditoria.log_cliente
           (id, profissional_id, dispositivo_id, dispositivo_nome, data_hora, acao, modo, detalhes, enviado_por_id)
         SELECT id, profissional_id, dispositivo_id, dispositivo_nome, data_hora, acao, modo, detalhes, $2
           FROM entrada
         ON CONFLICT (id) DO NOTHING
         RETURNING 1
       )
       SELECT count(*)::int AS novos FROM inseridos`,
      [JSON.stringify(entrada), enviadoPorId],
    );
    return rows[0]?.novos ?? 0;
  }

  async listarAcesso(filtro: FiltroLogAcesso, pagina: number, tamanho: number): Promise<Pagina<Record<string, unknown>>> {
    const { where, params } = montarFiltro([
      filtro.servico ? ['servico = ?', filtro.servico] : null,
      filtro.profissionalId ? ['profissional_id = ?', filtro.profissionalId] : null,
      filtro.metodo ? ['metodo = ?', filtro.metodo.toUpperCase()] : null,
      filtro.status !== undefined ? ['status_code = ?', filtro.status] : null,
      filtro.rota ? [`rota ILIKE ? ESCAPE '\\'`, trechoLike(filtro.rota)] : null,
      filtro.de ? ['data_hora >= ?', filtro.de] : null,
      filtro.ate ? ['data_hora <= ?', filtro.ate] : null,
    ]);
    return this.paginar(
      `SELECT id, data_hora, servico, ip_cliente, profissional_id, metodo, rota, status_code, tempo_ms,
              dispositivo_id, user_agent
         FROM auditoria.log_acesso ${where}`,
      `SELECT count(*)::int AS total FROM auditoria.log_acesso ${where}`,
      params,
      pagina,
      tamanho,
    );
  }

  async listarDoCliente(filtro: FiltroLogCliente, pagina: number, tamanho: number): Promise<Pagina<Record<string, unknown>>> {
    const { where, params } = montarFiltro([
      filtro.profissionalId ? ['profissional_id = ?', filtro.profissionalId] : null,
      filtro.dispositivoId ? ['dispositivo_id = ?', filtro.dispositivoId] : null,
      filtro.acao ? ['acao = ?', filtro.acao] : null,
      filtro.modo ? ['modo = ?', filtro.modo] : null,
      filtro.de ? ['data_hora >= ?', filtro.de] : null,
      filtro.ate ? ['data_hora <= ?', filtro.ate] : null,
    ]);
    return this.paginar(
      `SELECT id, profissional_id, dispositivo_id, dispositivo_nome, data_hora, acao, modo, detalhes,
              enviado_por_id, recebido_em
         FROM auditoria.log_cliente ${where}`,
      `SELECT count(*)::int AS total FROM auditoria.log_cliente ${where}`,
      params,
      pagina,
      tamanho,
    );
  }

  private async paginar(
    consulta: string,
    contagem: string,
    params: unknown[],
    pagina: number,
    tamanho: number,
  ): Promise<Pagina<Record<string, unknown>>> {
    const limite = params.length + 1;
    const deslocamento = params.length + 2;
    const [linhas, total] = await Promise.all([
      this.pool.query(`${consulta} ORDER BY data_hora DESC, id DESC LIMIT $${limite} OFFSET $${deslocamento}`, [
        ...params,
        tamanho,
        (pagina - 1) * tamanho,
      ]),
      this.pool.query<{ total: number }>(contagem, params),
    ]);
    return { itens: linhas.rows, pagina, tamanho, total: total.rows[0]?.total ?? 0 };
  }
}
