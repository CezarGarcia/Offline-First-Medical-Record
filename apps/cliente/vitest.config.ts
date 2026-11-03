import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@compartilhado': fileURLToPath(new URL('../compartilhado/src', import.meta.url)) },
  },
  test: {
    fileParallelism: false,
    testTimeout: 30_000,
    projects: [
      // O núcleo local, no Node.js puro (SQLite, sessão, fila, sincronização) e o formulário do atendimento
      { extends: true, test: { name: 'nucleo', environment: 'node', include: ['testes/*.test.ts'] } },
      // As telas no jsdom, com o núcleo de verdade atrás de uma ponte falsa (no lugar do preload do Electron)
      { extends: true, test: { name: 'telas', environment: './testes/telas/ambiente-jsdom.ts', include: ['testes/telas/**/*.test.tsx'] } },
    ],
  },
});
