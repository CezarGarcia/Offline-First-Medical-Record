/**
 * Passeio pelo app cliente de verdade (Electron, com o preload, o IPC e a CSP do app empacotado) contra um
 * servidor de verdade: configuração, login, ocorrência completa offline, sincronização, e-mail, PDF, telas de
 * apoio e login offline. Tira uma foto de cada tela em e2e/telas/.
 *
 *   npm run build
 *   MEDICALFIELD_URL=http://127.0.0.1:8088 MEDICALFIELD_SENHA=<DEMO_SENHA> npm run e2e
 *
 * No Linux sem tela, rode com xvfb-run. Cria registros de teste no servidor: use a pilha local, não a VM.
 */
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron } from 'playwright-core';

const PASTA_DO_APP = join(dirname(fileURLToPath(import.meta.url)), '..');
const SERVIDOR = process.env.MEDICALFIELD_URL;
const SENHA = process.env.MEDICALFIELD_SENHA;
const SAIDA = process.env.MEDICALFIELD_TELAS ?? join(PASTA_DO_APP, 'e2e', 'telas');
if (!SERVIDOR || !SENHA) {
  console.error('Defina MEDICALFIELD_URL e MEDICALFIELD_SENHA (veja o comentário no topo deste arquivo).');
  process.exit(2);
}
if (!existsSync(join(PASTA_DO_APP, 'out', 'main', 'index.js'))) {
  console.error('Rode "npm run build" antes.');
  process.exit(2);
}
rmSync(SAIDA, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
mkdirSync(SAIDA, { recursive: true });

// Um perfil novo a cada execução: banco vazio, como num aparelho recém-instalado (D-29)
const PERFIL = `e2e-${Date.now()}`;

/** CPF novo a cada execução, com os dígitos verificadores certos. */
function cpfAleatorio() {
  const d = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  for (const tamanho of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < tamanho; i += 1) soma += d[i] * (tamanho + 1 - i);
    const resto = (soma * 10) % 11;
    d[tamanho] = resto === 10 ? 0 : resto;
  }
  return d.join('');
}

const errosNoConsole = [];
let fotos = 0;
let pagina;

async function foto(nome) {
  fotos += 1;
  await pagina.waitForTimeout(300);
  await pagina.screenshot({ path: join(SAIDA, `${String(fotos).padStart(2, '0')}-${nome}.png`) });
}

function passo(texto) {
  console.log(`✓ ${texto}`);
}

const require = createRequire(import.meta.url);
const app = await _electron.launch({
  executablePath: require('electron'),
  // Como root (CI em contêiner), o Chromium exige --no-sandbox; as telas continuam com sandbox: true
  args: [...(process.getuid?.() === 0 || process.env.MEDICALFIELD_SEM_SANDBOX ? ['--no-sandbox'] : []), PASTA_DO_APP, `--perfil=${PERFIL}`],
  cwd: PASTA_DO_APP,
});
let pastaDoPerfil = null;

const chave = () => pagina.locator('[aria-label="Simular conectividade"]').first();
async function mudarChave(modo) {
  await chave().getByText(modo, { exact: true }).click();
  await pagina.waitForTimeout(300);
}
async function escolher(campo, opcao) {
  await campo.click();
  await pagina.getByRole('option', { name: opcao }).first().click();
}
const campoRegistro = () => pagina.getByRole('textbox', { name: /^Registro/ });
const textoDaBarra = async () => (await pagina.locator('header').innerText()).replace(/\s+/g, ' ');
async function esperarPendentes(n) {
  await pagina.waitForFunction(
    (quantos) => new RegExp(`(^|\\s)${quantos} pendentes?`, 'i').test(document.querySelector('header')?.innerText ?? ''),
    n,
    { timeout: 30_000 },
  );
}

try {
  pagina = await app.firstWindow();
  pagina.on('console', (m) => {
    if (m.type() === 'error') errosNoConsole.push(m.text());
  });
  pagina.on('pageerror', (e) => errosNoConsole.push(e.message));
  pastaDoPerfil = await app.evaluate(({ app: electronApp }) => electronApp.getPath('userData'));

  // Configuração inicial (só na primeira vez)
  await pagina.getByLabel('Endereço do servidor').waitFor();
  await foto('configuracao');
  await pagina.getByLabel('Endereço do servidor').fill(SERVIDOR);
  await pagina.getByLabel('Nome deste dispositivo').fill('Ambulância E2E');
  await pagina.getByRole('button', { name: 'Salvar e continuar' }).click();
  passo('configuração inicial');

  // Primeiro acesso com a chave em Offline: precisa de conexão
  await campoRegistro().waitFor();
  await mudarChave('Offline');
  await campoRegistro().fill('12345-RS');
  await pagina.getByLabel('Senha').fill(SENHA);
  await pagina.getByRole('button', { name: 'Entrar' }).click();
  await pagina.getByText('O primeiro acesso neste aparelho precisa de conexão.').waitFor();
  await foto('login-primeiro-acesso-offline');
  passo('primeiro acesso offline recusado');

  // Login online (passo 5 do roteiro) e o "receber dados" (passo 6)
  await mudarChave('Online');
  await pagina.getByLabel('Senha').fill(SENHA);
  await pagina.getByRole('button', { name: 'Entrar' }).click();
  await pagina.getByRole('heading', { name: 'Atendimentos' }).waitFor();
  await pagina.waitForFunction(() => !document.querySelector('header')?.innerText.includes('nunca'), null, { timeout: 30_000 });
  await foto('atendimentos-depois-do-login');
  passo('login online e primeira sincronização');

  // Ocorrência completa com a chave em Offline (passo 12)
  await mudarChave('Offline');
  await pagina.getByText('Modo offline: tudo está sendo salvo neste aparelho.').waitFor();
  await pagina.getByRole('link', { name: 'Nova ocorrência' }).first().click();
  await pagina.getByRole('button', { name: 'Cadastrar nova pessoa' }).click();
  await pagina.getByLabel('Nome').first().fill('Paciente E2E');
  await pagina.getByLabel('CPF').fill(cpfAleatorio());
  await pagina.getByLabel('E-mail').first().fill('paciente.e2e@exemplo.com');
  await pagina.getByLabel('Nome').nth(1).fill('Familiar E2E');
  await pagina.getByLabel('Parentesco').fill('Irmã');
  await pagina.getByLabel('E-mail').nth(1).fill('familiar.e2e@exemplo.com');
  await foto('form-pessoa');
  await pagina.getByRole('button', { name: 'Salvar pessoa e continuar' }).click();
  await escolher(pagina.getByRole('combobox', { name: /Tipo sanguíneo/ }), 'O+');
  await pagina.getByLabel('Alergias').fill('Penicilina');
  await foto('form-prontuario');
  await pagina.getByRole('button', { name: 'Salvar prontuário e continuar' }).click();
  await pagina.getByRole('button', { name: 'Salvar atendimento' }).click();
  await pagina.getByText(/precisam? de atenção/).waitFor();
  await foto('form-atendimento-erros');
  await escolher(pagina.getByRole('combobox', { name: /Tipo de ocorrência/ }), 'Trauma');
  await pagina.getByLabel('Local da ocorrência').fill('BR-386, km 350, Lajeado');
  await pagina.getByLabel('Queixa principal').fill('Colisão de moto, dor no braço esquerdo');
  await pagina.getByRole('radio', { name: 'Amarelo' }).click();
  await escolher(pagina.getByRole('combobox', { name: /Abertura ocular/ }), /^4/);
  await escolher(pagina.getByRole('combobox', { name: /Resposta verbal/ }), /^5/);
  await escolher(pagina.getByRole('combobox', { name: /Resposta motora/ }), /^6/);
  await pagina.getByLabel('PA sistólica').fill('130');
  await pagina.getByLabel('PA diastólica').fill('85');
  await pagina.getByLabel('Temperatura').fill('36,6');
  await pagina.getByRole('button', { name: 'Adicionar medicamento' }).click();
  const medicamento = pagina.locator('fieldset[aria-label="Medicamento 1"]');
  await medicamento.getByRole('combobox', { name: /^Medicamento/ }).click();
  await pagina.getByRole('option').first().click();
  await medicamento.getByLabel('Dose').fill('1');
  await escolher(medicamento.getByRole('combobox', { name: /^Via/ }), 'Intravenosa');
  await escolher(pagina.getByRole('combobox', { name: /^Desfecho/ }), 'Encaminhado ao hospital');
  await pagina.getByLabel('Hospital de destino').fill('Hospital Bruno Born');
  await foto('form-atendimento-preenchido');
  await pagina.getByRole('button', { name: 'Salvar atendimento' }).click();
  await pagina.getByRole('heading', { name: /^Ficha Nº/ }).waitFor();
  await esperarPendentes(3);
  await foto('detalhe-pendente');
  passo('ocorrência offline salva no aparelho (3 pendentes)');

  // E-mail pedido offline: vai para a fila (passo 17, feito antes da conexão voltar)
  await pagina.getByRole('button', { name: 'Enviar por e-mail' }).click();
  await pagina.getByText('Modo offline: o envio vai para a fila').waitFor();
  await foto('janela-email-offline');
  await pagina.getByRole('button', { name: 'Colocar na fila' }).click();
  await esperarPendentes(4);
  await pagina.getByRole('link', { name: 'Fila de sincronização' }).click();
  await pagina.getByText('Envio de e-mail').first().waitFor();
  await foto('fila-offline');
  passo('pedido de e-mail na fila (4 pendentes)');

  // A chave em Online basta: a fila esvazia sozinha (passo 14, Observer)
  await mudarChave('Online');
  await esperarPendentes(0);
  await foto('fila-depois-de-sincronizar');
  passo('chave em Online: fila vazia sem clicar em Sincronizar');

  // Ficha sincronizada: e-mail enviado e o PDF (passo 16)
  await pagina.getByRole('link', { name: 'Atendimentos' }).click();
  await pagina.getByText('Paciente E2E').first().click();
  await pagina.getByText(/^Enviado em /).waitFor({ timeout: 30_000 });
  await foto('detalhe-sincronizado');
  const pdf = join(SAIDA, 'ficha.pdf');
  await app.evaluate(({ dialog, shell }, caminho) => {
    // No lugar da janela "Salvar como" e do leitor de PDF
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: caminho });
    shell.openPath = async () => '';
  }, pdf);
  await pagina.getByRole('button', { name: 'Baixar PDF' }).click();
  await pagina.getByText('PDF salvo').waitFor({ timeout: 30_000 });
  if (readFileSync(pdf).subarray(0, 5).toString() !== '%PDF-') throw new Error('o arquivo salvo não é um PDF');
  passo('e-mail enviado e PDF salvo');

  // Telas de apoio
  await pagina.getByRole('link', { name: 'Pacientes' }).click();
  await pagina.getByText('Paciente E2E').first().waitFor();
  await foto('pacientes');
  await pagina.getByText('Paciente E2E').first().click();
  await pagina.getByRole('link', { name: 'Novo atendimento' }).waitFor();
  await foto('paciente');
  await pagina.getByRole('link', { name: 'Logs locais' }).click();
  await pagina.getByText('Login online').first().waitFor();
  await foto('logs');
  await pagina.getByRole('link', { name: 'Sobre' }).click();
  await pagina.getByText('Arquivo do banco local').waitFor();
  await pagina.getByText(PERFIL, { exact: true }).waitFor();
  await foto('sobre');
  passo('pacientes, logs locais e sobre');

  // Sair e entrar com a chave em Offline (roteiro 11.5, B2)
  await pagina.getByText('Sair', { exact: true }).click();
  await campoRegistro().waitFor();
  await mudarChave('Offline');
  await campoRegistro().fill('12345-rs');
  await pagina.getByLabel('Senha').fill(SENHA);
  await pagina.getByRole('button', { name: 'Entrar' }).click();
  await pagina.getByText('Entrou em modo offline').waitFor();
  await foto('login-offline');
  passo(`login offline (${await textoDaBarra()})`);

  if (errosNoConsole.length) throw new Error(`erros no console das telas:\n${errosNoConsole.join('\n')}`);
  console.log(`\nPasseio completo: ${fotos} telas em ${SAIDA}`);
} catch (erro) {
  console.error(`\nFALHOU: ${erro.message}`);
  if (pagina) await foto('falha').catch(() => {});
  process.exitCode = 1;
} finally {
  await app.close();
  if (pastaDoPerfil) rmSync(pastaDoPerfil, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
