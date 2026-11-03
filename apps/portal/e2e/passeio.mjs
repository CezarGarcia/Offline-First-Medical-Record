/**
 * Passeio pelo Portal Admin de verdade (a imagem do Nginx com o build do portal) num navegador (Chromium),
 * contra o servidor de verdade: os passos do portal no roteiro (docs/11, seção 11.3). Recusa do perfil
 * operacional, login do admin, todas as páginas, PDF baixado e e-mail enviado. Uma foto de cada tela.
 *
 *   MEDICALFIELD_URL=http://localhost MEDICALFIELD_SENHA=<DEMO_SENHA> npm run e2e
 *
 * Opcional: MEDICALFIELD_EMAIL_TESTE=<endereço> (padrão: portal@exemplo.com) para o envio da ficha.
 * Precisa dos dados de demonstração (infra/scripts/popular-demo.sh). Manda um e-mail de verdade se o SMTP
 * do servidor for o Gmail: use a pilha local com o Mailpit (infra/docker-compose.teste.yml), não a VM.
 */
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const SERVIDOR = process.env.MEDICALFIELD_URL?.replace(/\/+$/, '');
const SENHA = process.env.MEDICALFIELD_SENHA;
const EMAIL = process.env.MEDICALFIELD_EMAIL_TESTE ?? 'portal@exemplo.com';
const SAIDA = process.env.MEDICALFIELD_TELAS ?? join(dirname(fileURLToPath(import.meta.url)), 'telas');
if (!SERVIDOR || !SENHA) {
  console.error('Defina MEDICALFIELD_URL e MEDICALFIELD_SENHA (veja o comentário no topo deste arquivo).');
  process.exit(2);
}
rmSync(SAIDA, { recursive: true, force: true });
mkdirSync(SAIDA, { recursive: true });

const errosNoConsole = [];
let fotos = 0;
const navegador = await chromium.launch();
const contexto = await navegador.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true, locale: 'pt-BR' });
const pagina = await contexto.newPage();
pagina.on('console', (m) => {
  // O navegador registra como erro as respostas 4xx/5xx que o próprio passeio provoca (ex.: o 403 do perfil operacional)
  if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errosNoConsole.push(m.text());
});
pagina.on('pageerror', (e) => errosNoConsole.push(e.message));

async function foto(nome) {
  fotos += 1;
  await pagina.waitForTimeout(400);
  await pagina.screenshot({ path: join(SAIDA, `${String(fotos).padStart(2, '0')}-${nome}.png`) });
}
const passo = (texto) => console.log(`✓ ${texto}`);
const titulo = (texto) => pagina.getByRole('heading', { level: 1, name: texto });
const menu = (texto) => pagina.getByRole('navigation').getByRole('link', { name: texto, exact: true });

async function entrar(registro) {
  await pagina.goto(`${SERVIDOR}/login`);
  await pagina.getByRole('textbox', { name: /^Registro/ }).fill(registro);
  await pagina.getByLabel(/^Senha/).fill(SENHA);
  await pagina.getByRole('button', { name: 'Entrar' }).click();
}

try {
  // Passo 1: perfil operacional é recusado; o admin entra e cai em Atendimentos
  await entrar('12345-RS');
  await pagina.getByText('Acesso restrito a administradores').waitFor();
  await foto('login-operacional-recusado');
  passo('perfil operacional recusado no portal');

  await entrar('10001-RS');
  await titulo('Atendimentos').waitFor();
  await pagina.getByText('João da Silva').first().waitFor();
  await foto('atendimentos');
  passo('admin entra e vê os atendimentos');

  // Passo 2: cadastros de demonstração
  for (const [pagina_, nome, esperado] of [
    ['Pessoas', 'pessoas', 'Ana Beatriz Costa'],
    ['Profissionais', 'profissionais', 'Dra. Ana Souza'],
    ['Medicamentos', 'medicamentos', 'Dipirona'],
  ]) {
    await menu(pagina_).click();
    await titulo(pagina_).waitFor();
    await pagina.getByText(esperado).first().waitFor();
    await foto(nome);
  }
  passo('pessoas, profissionais e medicamentos');

  // Passo 3: prontuários e o detalhe de um deles
  await menu('Prontuários').click();
  await titulo('Prontuários').waitFor();
  // O filtro da própria página (com muitos registros, a pessoa pode não estar na primeira página da tabela)
  await pagina.getByPlaceholder('Nome ou CPF').fill('João da Silva');
  const linhaDoProntuario = pagina.getByRole('row').filter({ hasText: 'João da Silva' }).first();
  await linhaDoProntuario.waitFor();
  await foto('prontuarios');
  await linhaDoProntuario.click();
  await pagina.getByText(/alergia/i).first().waitFor();
  await foto('prontuario-detalhe');
  passo('prontuários e o detalhe');

  // Passo 4 e 16: um atendimento, a ficha e o PDF
  await menu('Atendimentos').click();
  await titulo('Atendimentos').waitFor();
  // A linha da tabela, pelo filtro (o nome também aparece nos cartões do painel)
  await pagina.getByPlaceholder('Nome ou CPF').fill('João da Silva');
  await pagina.getByRole('row').filter({ hasText: 'João da Silva' }).first().click();
  await pagina.getByRole('heading', { level: 1, name: /^Ficha Nº/ }).waitFor();
  await pagina.getByRole('button', { name: 'Baixar PDF' }).waitFor();
  await foto('ficha');
  const [download] = await Promise.all([
    pagina.waitForEvent('download', { timeout: 30_000 }),
    pagina.getByRole('button', { name: 'Baixar PDF' }).click(),
  ]);
  const nomeDoPdf = download.suggestedFilename();
  const arquivo = join(SAIDA, nomeDoPdf);
  await download.saveAs(arquivo);
  if (!/^ficha-atendimento-[0-9A-F]{8}\.pdf$/.test(nomeDoPdf)) throw new Error(`nome do PDF inesperado: ${nomeDoPdf}`);
  if (readFileSync(arquivo).subarray(0, 5).toString() !== '%PDF-') throw new Error('o arquivo baixado não é um PDF');
  passo(`PDF baixado (${nomeDoPdf})`);

  // Passo 17: e-mail para outro endereço
  await pagina.getByRole('button', { name: 'Enviar por e-mail' }).click();
  const janela = pagina.getByRole('dialog');
  await janela.getByText('Outro endereço').click();
  await janela.getByRole('textbox', { name: /^E-mail/ }).fill(EMAIL);
  await foto('janela-email');
  await janela.getByRole('button', { name: 'Enviar' }).click();
  await pagina.getByText('E-mail enviado').waitFor({ timeout: 30_000 });
  passo(`e-mail enviado para ${EMAIL}`);
  await menu('E-mails enviados').click();
  await titulo('E-mails enviados').waitFor();
  await pagina.getByText(EMAIL).first().waitFor();
  await foto('emails');
  passo('o envio aparece em E-mails enviados');

  // Auditoria e conflitos
  await menu('Logs de acesso').click();
  await titulo('Logs de acesso').waitFor();
  await pagina.getByText('/api/documentos/ficha').first().waitFor();
  await foto('logs-acesso');
  await menu('Logs dos clientes').click();
  await titulo('Logs dos clientes').waitFor();
  await foto('logs-clientes');
  await menu('Conflitos').click();
  await titulo('Conflitos').waitFor();
  await foto('conflitos');
  passo('logs de acesso, logs dos clientes e conflitos');

  // A documentação da API (as três especificações)
  await menu('API (Swagger)').click();
  await titulo('API').waitFor();
  await pagina.locator('.swagger-ui').getByText('/api/auth/login').first().waitFor({ timeout: 30_000 });
  await foto('api');
  passo('API (Swagger) com a especificação do ms-auth');

  // Sair
  await pagina.getByRole('button', { name: /Sair/ }).first().click();
  await pagina.getByRole('button', { name: 'Entrar' }).waitFor();
  passo('sair volta para o login');

  if (errosNoConsole.length) throw new Error(`erros no console do navegador:\n${errosNoConsole.join('\n')}`);
  console.log(`\nPasseio completo: ${fotos} telas em ${SAIDA}`);
} catch (erro) {
  console.error(`\nFALHOU: ${erro.message}`);
  await foto('falha').catch(() => {});
  process.exitCode = 1;
} finally {
  await navegador.close();
}
