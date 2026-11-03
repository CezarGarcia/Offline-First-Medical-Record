import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';

const compartilhado = fileURLToPath(new URL('../compartilhado/src', import.meta.url));
const atalhos = { '@compartilhado': compartilhado };

export default defineConfig({
  // Processo principal (núcleo local): só usa o que já vem no Node.js do Electron, inclusive o SQLite
  main: {
    resolve: { alias: atalhos },
  },
  // Ponte entre as telas e o núcleo: precisa ser um arquivo só, em CommonJS, para rodar com sandbox
  preload: {
    resolve: { alias: atalhos },
    build: { rollupOptions: { output: { format: 'cjs', entryFileNames: '[name].cjs' } } },
  },
  renderer: {
    plugins: [react()],
    resolve: { alias: atalhos },
  },
});
