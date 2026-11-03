import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { construirApp } from './app.js';
import { aguardarBanco, aplicarMigracoes, criarPool } from './banco.js';
import { carregarConfig } from './config.js';
import { Tokens } from './seguranca/tokens.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function iniciar(): Promise<void> {
  const config = await carregarConfig();
  const pool = criarPool(config.banco);
  await aguardarBanco(pool);
  const aplicadas = await aplicarMigracoes(pool, path.join(raiz, 'migrations'));
  const tokens = await Tokens.dePem(config.chavePrivadaPem, config.chavePublicaPem);

  const app = await construirApp({ pool, tokens });
  if (aplicadas.length > 0) app.log.info({ aplicadas }, 'migrations aplicadas');

  let encerrando = false;
  const encerrar = async (sinal: string) => {
    if (encerrando) return;
    encerrando = true;
    app.log.info(`${sinal} recebido: encerrando o ms-auth`);
    await app.close();
    await pool.end();
    process.exit(0);
  };
  process.once('SIGTERM', () => void encerrar('SIGTERM'));
  process.once('SIGINT', () => void encerrar('SIGINT'));

  await app.listen({ port: config.porta, host: '0.0.0.0' });
}

iniciar().catch((erro: unknown) => {
  console.error('Falha ao iniciar o ms-auth:', erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
