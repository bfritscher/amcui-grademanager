import { sentryVitePlugin } from "@sentry/vite-plugin";
import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { quasar, transformAssetUrls } from '@quasar/vite-plugin';
import vueDevTools from 'vite-plugin-vue-devtools';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue({
    template: { transformAssetUrls }
  }), quasar(), vueDevTools(), sentryVitePlugin({
    disable: process.env.AMCUI_DISABLE_SENTRY === 'true' || false,
    org: "heg-arc",
    project: "amcui-frontend",
    url: "https://e.bf0.ch/",
    authToken: "07d1d40a0f3e0542ff7ff4c0d9507baab1d4815fff6172360c5cb8f042e5c40a"
  })],

  define: {
    "process.env.IS_PREACT": JSON.stringify("true"),
  },

  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },

  build: {
    sourcemap: true
  }
});
