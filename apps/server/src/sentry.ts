import * as Sentry from '@sentry/node';
import {nodeProfilingIntegration} from '@sentry/profiling-node';

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    integrations: [nodeProfilingIntegration()],
    // Performance Monitoring
    tracesSampleRate: 1.0, // Capture 100% of the transactions
    // Profile sampled tracing spans for every profiling session.
    profileSessionSampleRate: 1.0,
    profileLifecycle: 'trace',
  });
}

export default Sentry;
