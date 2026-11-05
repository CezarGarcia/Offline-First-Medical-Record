/**
 * Gera as imagens da pasta apresentacao/diagramas a partir das fontes em fontes/*.mmd (Mermaid):
 * um .svg (escala sem perder qualidade) e um .png em alta resolução (para colar em slides).
 *
 *   cd apresentacao/diagramas && npm ci && npx playwright-core install chromium && npm run gerar
 *
 * As fontes também abrem direto no GitHub (que desenha Mermaid) e em https://mermaid.live.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const AQUI = dirname(fileURLToPath(import.meta.url));
const FONTES = join(AQUI, 'fontes');
const MERMAID = createRequire(import.meta.url).resolve('mermaid/dist/mermaid.min.js');
const so = process.argv.slice(2);

const CONFIG = {
  startOnLoad: false,
  theme: 'base',
  securityLevel: 'loose',
  fontFamily: '"Segoe UI", "DejaVu Sans", Arial, sans-serif',
  themeVariables: {
    fontSize: '16px',
    primaryColor: '#eef4fb',
    primaryBorderColor: '#3b6ea8',
    primaryTextColor: '#13233a',
    lineColor: '#4b5d73',
    secondaryColor: '#f6f8fa',
    tertiaryColor: '#ffffff',
    clusterBkg: '#f7f9fc',
    clusterBorder: '#9fb3c8',
    noteBkgColor: '#fff7d6',
    noteBorderColor: '#d4b106',
    actorBkg: '#eef4fb',
    actorBorder: '#3b6ea8',
    signalColor: '#13233a',
    labelBoxBkgColor: '#eef4fb',
  },
  // useMaxWidth: false = o desenho no tamanho real (senão ele encolhe para caber na página)
  flowchart: { useMaxWidth: false, htmlLabels: true, curve: 'basis', padding: 14, nodeSpacing: 40, rankSpacing: 55, wrappingWidth: 320 },
  sequence: { useMaxWidth: false, actorMargin: 80, messageMargin: 38, mirrorActors: false, noteMargin: 14, wrap: false, width: 230 },
  er: { useMaxWidth: false, fontSize: 14, layoutDirection: 'TB' },
  state: { useMaxWidth: false },
};

const navegador = await chromium.launch();
const pagina = await navegador.newPage({ deviceScaleFactor: 2, viewport: { width: 2400, height: 1600 } });
await pagina.setContent('<!doctype html><html><body style="margin:0;background:#ffffff"><div id="saida"></div></body></html>');
await pagina.addScriptTag({ path: MERMAID });
await pagina.evaluate((config) => window.mermaid.initialize(config), CONFIG);

let falhas = 0;
for (const arquivo of readdirSync(FONTES).filter((a) => a.endsWith('.mmd')).sort()) {
  const nome = basename(arquivo, '.mmd');
  if (so.length && !so.some((s) => nome.includes(s))) continue;
  const fonte = readFileSync(join(FONTES, arquivo), 'utf8');
  try {
    const svg = await pagina.evaluate(async ({ id, fonte }) => {
      const { svg } = await window.mermaid.render(id, fonte);
      const saida = document.getElementById('saida');
      saida.innerHTML = `<div id="moldura" style="display:inline-block;padding:28px;background:#ffffff">${svg}</div>`;
      return svg;
    }, { id: `d${nome.replace(/[^a-z0-9]/gi, '')}`, fonte });
    writeFileSync(join(AQUI, `${nome}.svg`), svg);
    await pagina.locator('#moldura').screenshot({ path: join(AQUI, `${nome}.png`) });
    console.log(`✓ ${nome}`);
  } catch (erro) {
    falhas += 1;
    console.error(`✗ ${nome}: ${erro.message.split('\n')[0]}`);
  }
}
await navegador.close();
process.exitCode = falhas ? 1 : 0;
