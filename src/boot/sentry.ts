import { boot } from 'quasar/wrappers';
import * as Sentry from '@sentry/vue';

// "async" is optional;
// more info on params: https://v2.quasar.dev/quasar-cli/boot-files
export default boot(({ app, router }) => {
  if (process.env.PROD && process.env.SENTRY_DSN && process.env.SENTRY_DSN.startsWith('http')) {
    Sentry.init({
      app,
      release: process.env.COMMITHASH,
      dsn: process.env.SENTRY_DSN,
      integrations: [
        Sentry.browserTracingIntegration({router}),
        Sentry.replayIntegration()
      ],
      // Set tracesSampleRate to 1.0 to capture 100%
      // of transactions for performance monitoring.
      // We recommend adjusting this value in production
      tracesSampleRate: 1.0,
      trackComponents: true,
      replaysOnErrorSampleRate: 1.0,
    });
  }
});
