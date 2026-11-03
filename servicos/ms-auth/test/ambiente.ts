import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exportPKCS8, exportSPKI, generateKeyPair } from 'jose';
import { construirApp } from '../src/app.js';
import { aplicarMigracoes, criarPool } from '../src/banco.js';
import { configBanco } from '../src/config.js';
import type { PerfilProfissional, TipoRegistroProfissional } from '../src/esquemas.js';
import { Tokens } from '../src/seguranca/tokens.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export interface ProfissionalDeTeste {
  id: string;
  nome: string;
  tipoRegistro: TipoRegistroProfissional;
  registro: string;
  senha: string;
  perfil: PerfilProfissional;
}

export async function gerarChavesPem(): Promise<{ privadaPem: string; publicaPem: string }> {
  const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true });
  return { privadaPem: await exportPKCS8(privateKey), publicaPem: await exportSPKI(publicKey) };
}

/**
 * Sobe o app contra o Postgres de desenvolvimento (variáveis DB_*), com chaves JWT
 * geradas na hora. Os profissionais criados aqui são apagados no fim; os logs ficam
 * (são imutáveis por definição).
 */
export async function criarAmbiente() {
  const pool = criarPool(configBanco());
  await aplicarMigracoes(pool, path.join(raiz, 'migrations'));
  const chaves = await gerarChavesPem();
  const tokens = await Tokens.dePem(chaves.privadaPem, chaves.publicaPem);
  const app = await construirApp({ pool, tokens }, { logger: false });
  await app.ready();
  const criados: string[] = [];

  /** Cria o profissional como num cadastro manual: senha gerada pelo crypt() do pgcrypto. */
  async function criarProfissional(
    dados: Partial<{ tipoRegistro: TipoRegistroProfissional; perfil: PerfilProfissional; ativo: boolean; senha: string }> = {},
  ): Promise<ProfissionalDeTeste> {
    const tipoRegistro = dados.tipoRegistro ?? 'CRM';
    const perfil = dados.perfil ?? 'OPERACIONAL';
    const senha = dados.senha ?? 'Senha@Teste1';
    const registro = `TESTE-${randomUUID().slice(0, 8).toUpperCase()}`;
    const nome = `Profissional ${registro}`;
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO auth.profissional (nome, tipo_registro, registro, perfil, senha_hash, ativo)
       VALUES ($1, $2, $3, $4, crypt($5, gen_salt('bf', 4)), $6)
       RETURNING id`,
      [nome, tipoRegistro, registro, perfil, senha, dados.ativo ?? true],
    );
    const id = rows[0]!.id;
    criados.push(id);
    return { id, nome, tipoRegistro, registro, senha, perfil };
  }

  function login(p: ProfissionalDeTeste, extras: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
    return app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers,
      payload: { tipoRegistro: p.tipoRegistro, registro: p.registro, senha: p.senha, ...extras },
    });
  }

  async function sessaoDe(p: ProfissionalDeTeste) {
    const resposta = await login(p);
    if (resposta.statusCode !== 200) throw new Error(`login falhou: ${resposta.body}`);
    return resposta.json() as { tokenDeAcesso: string; refreshToken: string; sessaoExpiraEm: string };
  }

  async function encerrar() {
    await app.close();
    if (criados.length > 0) {
      await pool.query('DELETE FROM auth.sessao WHERE profissional_id = ANY($1::uuid[])', [criados]);
      await pool.query('DELETE FROM auth.profissional WHERE id = ANY($1::uuid[])', [criados]);
    }
    await pool.end();
  }

  return { app, pool, chaves, criarProfissional, login, sessaoDe, encerrar };
}

export type Ambiente = Awaited<ReturnType<typeof criarAmbiente>>;
