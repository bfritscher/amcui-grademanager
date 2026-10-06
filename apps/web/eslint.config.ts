import pluginVue from 'eslint-plugin-vue';
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript';
import pluginVitest from '@vitest/eslint-plugin';
import pluginCypress from 'eslint-plugin-cypress';
import skipFormatting from '@vue/eslint-config-prettier/skip-formatting';

// To allow more languages other than `ts` in `.vue` files, uncomment the following lines:
// import { configureVueProject } from '@vue/eslint-config-typescript'
// configureVueProject({ scriptLangs: ['ts', 'tsx'] })
// More info at https://github.com/vuejs/eslint-config-typescript/#advanced-setup

export default defineConfigWithVueTs(
  {
    name: 'app/files-to-lint',
    files: ['**/*.{ts,mts,tsx,vue}'],
    languageOptions: { parserOptions: { tsconfigRootDir: import.meta.dirname } }
  },

  {
    name: 'app/files-to-ignore',
    ignores: ['**/dist/**', '**/dist-ssr/**', '**/coverage/**']
  },

  pluginVue.configs['flat/recommended'],
  vueTsConfigs.recommended,

  {
    ...pluginVitest.configs.recommended,
    files: ['test/vitest/**/__tests__/**']
  },

  {
    ...pluginCypress.configs.recommended,
    files: [
      'test/cypress/e2e/**/*.{cy,spec}.{js,ts,jsx,tsx}',
      'test/cypress/support/**/*.{js,ts,jsx,tsx}'
    ]
  },
  skipFormatting,
  {
    rules: {
      'no-prototype-builtins': 'off',
      'vue/multi-word-component-names': 'off',
      'vue/valid-template-root': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      'vue/no-mutating-props': 'off'
    }
  }
);
