/**
 * Teste de fumaça do app instalado: abre o executável, confere que é o app empacotado (com a versão certa),
 * que a primeira tela aparece e que o perfil (--perfil) tem a própria pasta de dados. Tira uma foto.
 * O GitHub Actions roda no Windows, depois de instalar o MedicalField-Setup (docs/13).
 *
 *   node e2e/fumaca.mjs <caminho do MedicalField.exe> [versão esperada]
 */
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron } from 'playwright-core';

const [executavel, versaoEsperada] = process.argv.slice(2);
if (!executavel) {
  console.error('Uso: node e2e/fumaca.mjs <caminho do executável> [versão esperada]');
  process.exit(2);
}
const SAIDA = process.env.MEDICALFIELD_TELAS ?? join(dirname(fileURLToPath(import.meta.url)), 'telas');
mkdirSync(SAIDA, { recursive: true });
const PERFIL = `fumaca-${Date.now()}`;

const app = await _electron.launch({
  executablePath: executavel,
  args: [...(process.getuid?.() === 0 || process.env.MEDICALFIELD_SEM_SANDBOX ? ['--no-sandbox'] : []), `--perfil=${PERFIL}`],
});
let pastaDoPerfil = null;
try {
  const pagina = await app.firstWindow();
  const erros = [];
  pagina.on('pageerror', (e) => erros.push(e.message));
  const info = await app.evaluate(({ app: electronApp }) => ({
    empacotado: electronApp.isPackaged,
    versao: electronApp.getVersion(),
    dados: electronApp.getPath('userData'),
  }));
  pastaDoPerfil = info.dados;
  console.log('app:', JSON.stringify(info));
  if (!info.empacotado) throw new Error('não é o app empacotado');
  if (versaoEsperada && info.versao !== versaoEsperada) throw new Error(`versão ${info.versao}, esperada ${versaoEsperada}`);
  if (!info.dados.endsWith(PERFIL)) throw new Error(`a pasta de dados não é a do perfil: ${info.dados}`);
  // Primeira abertura: a configuração inicial (endereço do servidor e nome do dispositivo)
  await pagina.getByLabel('Endereço do servidor').waitFor({ timeout: 30_000 });
  await pagina.getByLabel('Nome deste dispositivo').waitFor();
  console.log('título da janela:', await pagina.title());
  await pagina.screenshot({ path: join(SAIDA, 'fumaca-configuracao.png') });
  if (erros.length) throw new Error(`erros nas telas: ${erros.join(' | ')}`);
  console.log('✓ o app instalado abre e mostra a configuração inicial');
} catch (erro) {
  console.error(`FALHOU: ${erro.message}`);
  process.exitCode = 1;
} finally {
  await app.close();
  if (pastaDoPerfil) rmSync(pastaDoPerfil, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
