/**
 * Gera as imagens da apresentação (PNG 16:9, 3840x2160) a partir das páginas em fontes/*.html.
 * Cada página é um "slide" de 1920x1080 com caixas posicionadas e setas desenhadas por fontes/base/base.js.
 *
 *   cd apresentacao/diagramas && npm ci && npx playwright-core install chromium && npm run gerar
 *
 * `npm run gerar -- 01` gera só as que têm 01 no nome. Para editar, abra o .html no navegador.
 */
import { readdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const AQUI = dirname(fileURLToPath(import.meta.url));
const FONTES = join(AQUI, 'fontes');
const so = process.argv.slice(2);

const navegador = await chromium.launch();
const pagina = await navegador.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
const erros = [];
pagina.on('pageerror', (e) => erros.push(e.message));
let falhas = 0;
for (const arquivo of readdirSync(FONTES).filter((a) => a.endsWith('.html')).sort()) {
  const nome = basename(arquivo, '.html');
  if (so.length && !so.some((s) => nome.includes(s))) continue;
  erros.length = 0;
  await pagina.goto(pathToFileURL(join(FONTES, arquivo)).href);
  await pagina.evaluate(() => document.fonts.ready);
  await pagina.waitForSelector('body[data-pronto="1"]', { timeout: 10_000 }).catch(() => {});
  if (erros.length) {
    falhas += 1;
    console.error(`✗ ${nome}: ${erros.join(' | ')}`);
    continue;
  }
  await pagina.screenshot({ path: join(AQUI, `${nome}.png`) });
  console.log(`✓ ${nome}`);
}
await navegador.close();
process.exitCode = falhas ? 1 : 0;
