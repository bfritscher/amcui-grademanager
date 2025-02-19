import * as Sentry from '@sentry/vue';
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { Quasar, Dialog, Notify } from 'quasar';
// import quasarIconSet from 'quasar/icon-set/svg-mdi-v7';
import quasarIconSet from 'quasar/icon-set/material-symbols-outlined';

// Import icon libraries
import '@quasar/extras/roboto-font/roboto-font.css';
//import '@quasar/extras/material-icons/material-icons.css'
import '@quasar/extras/material-symbols-outlined/material-symbols-outlined.css';
import '@quasar/extras/mdi-v7/mdi-v7.css';

// Import Quasar css
import 'quasar/dist/quasar.css';
import './assets/fonts/NimbusMono.css';
import './assets/fonts/NimbusSanL.css';
import './assets/css/app.css';

import App from './App.vue';
import router from './router';

const app = createApp(App);

app.use(createPinia());
app.use(router);

if (import.meta.env.PROD && window.SENTRY_DSN && window.SENTRY_DSN.startsWith('http')) {
  Sentry.init({
    app,
    release: import.meta.env.VITE_COMMITHASH,
    dsn: window.SENTRY_DSN,
    integrations: [Sentry.browserTracingIntegration({ router }), Sentry.replayIntegration()],
    // Set tracesSampleRate to 1.0 to capture 100%
    // of transactions for performance monitoring.
    // We recommend adjusting this value in production
    tracesSampleRate: 1.0,
    // @ts-expect-error unknown option
    trackComponents: true,
    replaysOnErrorSampleRate: 1.0
  });
}

app.use(Quasar, {
  plugins: {
    Dialog,
    Notify
  }, // import Quasar plugins and add here
  iconSet: quasarIconSet,
  config: {
    brand: {
      primary: '#01579b',
      secondary: '#EEEEEE',
      accent: '#9C27B0',
      dark: '#1D1D1D',
      positive: '#21BA45',
      negative: '#FF5722',
      info: '#31CCEC',
      warning: '#F2C037'
    }
  }
});

app.mount('#app');
