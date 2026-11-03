import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const fonte = fileURLToPath(new URL('./src', import.meta.url));
const compartilhado = fileURLToPath(new URL('../compartilhado/src', import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@compartilhado': compartilhado, '@': fonte },
  },
  server: {
    port: 5173,
    // No desenvolvimento, a API vem da stack do infra/ (Nginx). Ex.: MEDICALFIELD_API=http://localhost:8088
    proxy: { '/api': process.env.MEDICALFIELD_API ?? 'http://localhost' },
    fs: { allow: ['..'] },
  },
  build: {
    outDir: 'dist',
    // A página da API (Swagger UI) é grande, mas só carrega quando é aberta
    chunkSizeWarningLimit: 2000,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./testes/preparar.ts'],
    include: ['testes/**/*.test.{ts,tsx}'],
  },
});
