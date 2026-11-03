import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import type { ConfigBanco } from './config.js';

export function criarPool(c: ConfigBanco): pg.Pool {
  return new pg.Pool({
    host: c.host,
    port: c.porta,
    database: c.nome,
    user: c.usuario,
    password: c.senha,
    max: 10,
    application_name: 'ms-auth',
  });
}

/** Espera o banco aceitar conexões (o container do Postgres pode demorar a subir). */
export async function aguardarBanco(pool: pg.Pool, tentativas = 30, intervaloMs = 2000): Promise<void> {
  for (let tentativa = 1; ; tentativa++) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (erro) {
      if (tentativa >= tentativas) throw erro;
      console.warn(`Banco indisponível (tentativa ${tentativa}/${tentativas}). Tentando de novo...`);
      await new Promise((resolver) => setTimeout(resolver, intervaloMs));
    }
  }
}

/**
 * Aplica, em ordem, os arquivos .sql da pasta que ainda não foram aplicados.
 * Cada arquivo roda numa transação. Um lock consultivo impede duas instâncias
 * de migrarem ao mesmo tempo.
 */
export async function aplicarMigracoes(pool: pg.Pool, pasta: string): Promise<string[]> {
  const arquivos = (await readdir(pasta)).filter((nome) => nome.endsWith('.sql')).sort();
  const aplicadasAgora: string[] = [];
  const cliente = await pool.connect();
  try {
    await cliente.query(`SELECT pg_advisory_lock(hashtext('ms-auth:migracoes'))`);
    await cliente.query(
      `CREATE TABLE IF NOT EXISTS auth.migracao (
         versao      text        PRIMARY KEY,
         aplicada_em timestamptz NOT NULL DEFAULT now()
       )`,
    );
    const { rows } = await cliente.query<{ versao: string }>('SELECT versao FROM auth.migracao');
    const jaAplicadas = new Set(rows.map((linha) => linha.versao));

    for (const arquivo of arquivos) {
      if (jaAplicadas.has(arquivo)) continue;
      const sql = await readFile(path.join(pasta, arquivo), 'utf8');
      try {
        await cliente.query('BEGIN');
        await cliente.query(sql);
        await cliente.query('INSERT INTO auth.migracao (versao) VALUES ($1)', [arquivo]);
        await cliente.query('COMMIT');
        aplicadasAgora.push(arquivo);
      } catch (erro) {
        await cliente.query('ROLLBACK');
        throw new Error(`Falha na migration ${arquivo}: ${(erro as Error).message}`);
      }
    }
  } finally {
    await cliente.query(`SELECT pg_advisory_unlock(hashtext('ms-auth:migracoes'))`).catch(() => undefined);
    cliente.release();
  }
  return aplicadasAgora;
}
