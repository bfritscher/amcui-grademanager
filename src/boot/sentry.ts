import { boot } from 'quasar/wrappers';
import * as Sentry from '@sentry/vue';
import { Integrations } from '@sentry/tracing';

// "async" is optional;
// more info on params: https://v2.quasar.dev/quasar-cli/boot-files
export default boot(({ app, router }) => {
  if (process.env.PROD && process.env.SENTRY_DSN && process.env.SENTRY_DSN.startsWith('http')) {
    Sentry.init({
      app,
      release: process.env.COMMITHASH,
      dsn: process.env.SENTRY_DSN,
      integrations: [
        new Integrations.BrowserTracing({
          routingInstrumentation: Sentry.vueRouterInstrumentation(router),
          // tracingOrigins: ['localhost', 'my-site-url.com', /^\//],
        }),
      ],
      // Set tracesSampleRate to 1.0 to capture 100%
      // of transactions for performance monitoring.
      // We recommend adjusting this value in production
      tracesSampleRate: 1.0,
      trackComponents: true,
    });
  }
});
