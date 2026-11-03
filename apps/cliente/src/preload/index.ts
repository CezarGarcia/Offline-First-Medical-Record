/**
 * A ponte entre as telas e o núcleo (contextBridge). As telas só enxergam `window.medicalfield`, com duas
 * funções: chamar um método do contrato e ouvir os avisos do núcleo. Nada de Node.js nas telas.
 */
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import {
  CANAL_DE_CHAMADAS,
  CANAL_DE_EVENTOS,
  type EventoDoNucleo,
  type MetodoDoNucleo,
  type PonteDoNucleo,
  type RespostaDoNucleo,
} from '../comum/contrato';

const ponte: PonteDoNucleo = {
  chamar: (metodo: MetodoDoNucleo, argumentos: unknown[]): Promise<RespostaDoNucleo<unknown>> =>
    ipcRenderer.invoke(CANAL_DE_CHAMADAS, metodo, argumentos),
  aoAvisar: (ouvinte: (evento: EventoDoNucleo) => void): (() => void) => {
    const repassar = (_: IpcRendererEvent, evento: EventoDoNucleo) => ouvinte(evento);
    ipcRenderer.on(CANAL_DE_EVENTOS, repassar);
    return () => ipcRenderer.removeListener(CANAL_DE_EVENTOS, repassar);
  },
};

contextBridge.exposeInMainWorld('medicalfield', ponte);
