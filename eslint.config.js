import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores([
    '**/dist/**',
    '**/dist-ssr/**',
    '**/coverage/**',
    'apps/server/projects/**',
    'apps/server/data/**',
    'apps/server/.tmp/**',
    'apps/server/frontend/**'
  ]),
  {
    files: ['apps/server/**/*.{js,mjs,cjs,ts}', 'packages/**/*.{js,mjs,cjs,ts}'],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node }
  },
  {
    files: ['apps/server/**/*.ts', 'packages/**/*.ts'],
    extends: [tseslint.configs.recommended],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }]
    }
  },
  {
    // These declarations describe CommonJS libraries and intentionally extend interfaces.
    files: ['apps/server/src/@types/**/*.d.ts'],
    rules: {
      '@typescript-eslint/no-require-imports': ['error', { allowAsImport: true }],
      '@typescript-eslint/no-empty-object-type': [
        'error',
        { allowInterfaces: 'with-single-extends' }
      ]
    }
  },
  {
    files: ['apps/server/tests/**/*.ts'],
    languageOptions: { globals: globals.jest }
  },
  {
    files: ['apps/server/svg2pdf/*.js'],
    languageOptions: { sourceType: 'commonjs', globals: { document: 'readonly' } }
  },
  prettier
);
