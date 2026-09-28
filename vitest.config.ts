import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts', 'apps/server/test-mcp/**/*.test.ts'],
    testTimeout: 15000
  }
});
