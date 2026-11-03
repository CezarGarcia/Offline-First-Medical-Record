/**
 * Processo principal do Electron: abre a janela, cria o núcleo local e liga as telas a ele pelo IPC.
 * As telas rodam isoladas (contextIsolation + sandbox): não acessam o Node.js, o banco nem a rede.
 */
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BrowserWindow, Menu, app, dialog, ipcMain, safeStorage, shell } from 'electron';
import {
  CANAL_DE_CHAMADAS,
  CANAL_DE_EVENTOS,
  type EventoDoNucleo,
  METODOS_DO_NUCLEO,
  type MetodoDoNucleo,
  type RespostaDoNucleo,
} from '../comum/contrato';
import { serializarErro } from './nucleo/erros';
import { Nucleo } from './nucleo/nucleo';
import { perfilDaLinhaDeComando } from './perfil';

const perfil = perfilDaLinhaDeComando(process.argv);
// Uma pasta por perfil (D-29): %APPDATA%\MedicalField\<perfil>
app.setPath('userData', join(app.getPath('appData'), 'MedicalField', perfil));

let janela: BrowserWindow | null = null;
let nucleo: Nucleo | null = null;

function avisarTelas(evento: EventoDoNucleo): void {
  if (janela && !janela.isDestroyed()) janela.webContents.send(CANAL_DE_EVENTOS, evento);
}

function criarJanela(): void {
  janela = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    title: `MedicalField${perfil === 'padrao' ? '' : ` (${perfil})`}`,
    backgroundColor: '#f8f9fa',
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  janela.once('ready-to-show', () => janela?.show());
  // A janela só mostra o próprio app: nada de abrir links ou navegar para fora
  janela.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  janela.webContents.on('will-navigate', (evento, url) => {
    if (!url.startsWith('file:') && !url.startsWith(process.env.ELECTRON_RENDERER_URL ?? '\u0000')) evento.preventDefault();
  });
  if (process.env.ELECTRON_RENDERER_URL) void janela.loadURL(process.env.ELECTRON_RENDERER_URL);
  else void janela.loadFile(join(import.meta.dirname, '../renderer/index.html'));
}

async function salvarPdf(nomeSugerido: string, conteudo: Uint8Array): Promise<string | null> {
  const opcoes = {
    title: 'Salvar a ficha de atendimento',
    defaultPath: join(app.getPath('downloads'), nomeSugerido),
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  };
  const escolha = janela ? await dialog.showSaveDialog(janela, opcoes) : await dialog.showSaveDialog(opcoes);
  if (escolha.canceled || !escolha.filePath) return null;
  await writeFile(escolha.filePath, conteudo);
  void shell.openPath(escolha.filePath);
  return escolha.filePath;
}

function registrarIpc(n: Nucleo): void {
  const permitidos = new Set<string>(METODOS_DO_NUCLEO);
  ipcMain.handle(CANAL_DE_CHAMADAS, async (evento, metodo: string, argumentos: unknown[]): Promise<RespostaDoNucleo<unknown>> => {
    // Só a janela do próprio app pode chamar o núcleo, e só os métodos do contrato
    if (!janela || evento.sender !== janela.webContents || !permitidos.has(metodo)) {
      return { ok: false, erro: { codigo: 'PROIBIDO', mensagem: 'Chamada não permitida.' } };
    }
    try {
      const funcao = n[metodo as MetodoDoNucleo] as (...a: unknown[]) => Promise<unknown>;
      return { ok: true, valor: await funcao.apply(n, Array.isArray(argumentos) ? argumentos : []) };
    } catch (erro) {
      return { ok: false, erro: serializarErro(erro) };
    }
  });
}

if (!app.requestSingleInstanceLock()) {
  // Este perfil já está aberto: a outra janela vem para a frente
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!janela) return;
    if (janela.isMinimized()) janela.restore();
    janela.focus();
  });

  void app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    // No Windows, o DPAPI; sem cofre no sistema, o refresh token não vai para o disco (docs/08, seção 8.5)
    const cofreDisponivel = await safeStorage.isAsyncEncryptionAvailable().catch(() => false);
    nucleo = new Nucleo({
      caminhoDoBanco: join(app.getPath('userData'), 'medicalfield.db'),
      perfil,
      versao: app.getVersion(),
      cofre: {
        disponivel: () => cofreDisponivel,
        cifrar: (texto) => safeStorage.encryptStringAsync(texto),
        decifrar: async (dados) => (await safeStorage.decryptStringAsync(Buffer.from(dados))).result,
      },
      salvarArquivo: salvarPdf,
      aoAvisar: avisarTelas,
    });
    registrarIpc(nucleo);
    nucleo.iniciar();
    criarJanela();
  });

  app.on('window-all-closed', () => app.quit());

  let encerrando = false;
  app.on('before-quit', (evento) => {
    if (encerrando || !nucleo) return;
    // Fecha com calma: o que estava saindo volta para a fila, e o banco é fechado direito
    evento.preventDefault();
    encerrando = true;
    void nucleo.encerrar().finally(() => app.quit());
  });
}
