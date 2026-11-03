import type pg from 'pg';
import { VALIDADE_SESSAO_DIAS } from '../config.js';
import type { LinhaProfissional } from './profissionais.js';

export interface SessaoComProfissional {
  sessao_id: string;
  sessao_expira_em: Date;
  profissional: LinhaProfissional;
}

export interface DispositivoDaSessao {
  id?: string | undefined;
  nome?: string | undefined;
}

export class RepositorioSessoes {
  constructor(private readonly pool: pg.Pool) {}

  /** A sessão vale 7 dias a partir do login e não é prorrogada. */
  async criar(
    profissionalId: string,
    refreshTokenHash: string,
    dispositivo: DispositivoDaSessao | undefined,
  ): Promise<{ id: string; expira_em: Date }> {
    const { rows } = await this.pool.query<{ id: string; expira_em: Date }>(
      `INSERT INTO auth.sessao (profissional_id, refresh_token_hash, dispositivo_id, dispositivo_nome, expira_em)
       VALUES ($1, $2, $3, $4, now() + make_interval(days => $5))
       RETURNING id, expira_em`,
      [profissionalId, refreshTokenHash, dispositivo?.id ?? null, dispositivo?.nome ?? null, VALIDADE_SESSAO_DIAS],
    );
    const sessao = rows[0];
    if (!sessao) throw new Error('Falha ao criar a sessão.');
    return sessao;
  }

  /** Só devolve a sessão se ela não foi revogada e ainda está na validade. */
  async buscarAtivaPorHash(refreshTokenHash: string): Promise<SessaoComProfissional | null> {
    const { rows } = await this.pool.query<LinhaProfissional & { sessao_id: string; sessao_expira_em: Date }>(
      `SELECT s.id AS sessao_id, s.expira_em AS sessao_expira_em,
              p.id, p.nome, p.tipo_registro, p.registro, p.perfil, p.senha_hash, p.ativo,
              p.tentativas_falhas, p.bloqueado_ate, p.criado_em
         FROM auth.sessao s
         JOIN auth.profissional p ON p.id = s.profissional_id
        WHERE s.refresh_token_hash = $1
          AND s.revogada_em IS NULL
          AND s.expira_em > now()`,
      [refreshTokenHash],
    );
    const linha = rows[0];
    if (!linha) return null;
    const { sessao_id, sessao_expira_em, ...profissional } = linha;
    return { sessao_id, sessao_expira_em, profissional };
  }

  async registrarUso(sessaoId: string): Promise<void> {
    await this.pool.query(`UPDATE auth.sessao SET ultimo_uso_em = now() WHERE id = $1`, [sessaoId]);
  }

  async revogar(sessaoId: string, profissionalId: string): Promise<void> {
    await this.pool.query(
      `UPDATE auth.sessao SET revogada_em = now()
        WHERE id = $1 AND profissional_id = $2 AND revogada_em IS NULL`,
      [sessaoId, profissionalId],
    );
  }
}
