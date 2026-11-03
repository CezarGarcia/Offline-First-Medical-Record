import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Os testes usam um Postgres de verdade; um arquivo por vez evita disputa entre eles
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
