import type pg from 'pg';
import type { PerfilProfissional, TipoRegistroProfissional } from '../esquemas.js';

export interface LinhaProfissional {
  id: string;
  nome: string;
  tipo_registro: TipoRegistroProfissional;
  registro: string;
  perfil: PerfilProfissional;
  senha_hash: string;
  ativo: boolean;
  tentativas_falhas: number;
  bloqueado_ate: Date | null;
  criado_em: Date;
}

const COLUNAS = `id, nome, tipo_registro, registro, perfil, senha_hash, ativo, tentativas_falhas, bloqueado_ate, criado_em`;

export class RepositorioProfissionais {
  constructor(private readonly pool: pg.Pool) {}

  /** Maiúsculas/minúsculas e espaços nas pontas do registro não importam. */
  async buscarPorRegistro(tipoRegistro: string, registro: string): Promise<LinhaProfissional | null> {
    const { rows } = await this.pool.query<LinhaProfissional>(
      `SELECT ${COLUNAS} FROM auth.profissional
        WHERE tipo_registro = $1 AND upper(btrim(registro)) = upper(btrim($2))`,
      [tipoRegistro, registro],
    );
    return rows[0] ?? null;
  }

  async buscarPorId(id: string): Promise<LinhaProfissional | null> {
    const { rows } = await this.pool.query<LinhaProfissional>(
      `SELECT ${COLUNAS} FROM auth.profissional WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  /**
   * Conta uma senha errada. Ao atingir o limite, bloqueia e zera o contador.
   * Devolve a data do bloqueio quando esta tentativa causou o bloqueio.
   */
  async registrarFalha(id: string, maxTentativas: number, minutosBloqueio: number): Promise<Date | null> {
    const { rows } = await this.pool.query<{ bloqueou: boolean; bloqueado_ate: Date | null }>(
      `UPDATE auth.profissional
          SET tentativas_falhas = CASE WHEN tentativas_falhas + 1 >= $2 THEN 0 ELSE tentativas_falhas + 1 END,
              bloqueado_ate     = CASE WHEN tentativas_falhas + 1 >= $2
                                       THEN now() + make_interval(mins => $3) ELSE bloqueado_ate END
        WHERE id = $1
    RETURNING (tentativas_falhas = 0) AS bloqueou, bloqueado_ate`,
      [id, maxTentativas, minutosBloqueio],
    );
    const linha = rows[0];
    return linha?.bloqueou && linha.bloqueado_ate ? linha.bloqueado_ate : null;
  }

  async registrarSucesso(id: string): Promise<void> {
    await this.pool.query(
      `UPDATE auth.profissional SET tentativas_falhas = 0, bloqueado_ate = NULL WHERE id = $1`,
      [id],
    );
  }

  /** Os ativos, com o hash da senha: a réplica para o login offline nos aparelhos (D-51). */
  async listarAtivos(): Promise<LinhaProfissional[]> {
    const { rows } = await this.pool.query<LinhaProfissional>(
      `SELECT ${COLUNAS} FROM auth.profissional WHERE ativo ORDER BY nome, registro`,
    );
    return rows;
  }

  async listar(): Promise<LinhaProfissional[]> {
    const { rows } = await this.pool.query<LinhaProfissional>(
      `SELECT ${COLUNAS} FROM auth.profissional ORDER BY nome, registro`,
    );
    return rows;
  }
}
