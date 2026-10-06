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
    disable: process.env.AMCUI_DISABLE_SENTRY === 'true' || !process.env.SENTRY_AUTH_TOKEN,
    org: "heg-arc",
    project: "amcui-frontend",
    url: "https://e.bf0.ch/",
    authToken: process.env.SENTRY_AUTH_TOKEN
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
