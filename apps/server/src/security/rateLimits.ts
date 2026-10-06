import {createHash} from 'node:crypto';
import type {Express, Request, RequestHandler} from 'express';
import {ipKeyGenerator, rateLimit, type Store} from 'express-rate-limit';
import {RedisStore, type SendCommandFn} from 'rate-limit-redis';

export interface RateLimitConfig {
  apiLimit: number;
  apiWindowMs: number;
  authIpLimit: number;
  authAccountLimit: number;
  authWindowMs: number;
}
const positive = (
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
): number => {
  if (env[name] === undefined) return fallback;
  const value = Number(env[name]);
  if (!Number.isSafeInteger(value) || value < 1 || value > 1_000_000)
    throw new Error(`Invalid ${name}: expected a positive integer <= 1000000`);
  return value;
};
export function rateLimitConfig(
  env: NodeJS.ProcessEnv = process.env,
): RateLimitConfig {
  return {
    apiLimit: positive(env, 'AMCUI_API_RATE_LIMIT', 600),
    apiWindowMs: 60_000,
    authIpLimit: positive(env, 'AMCUI_AUTH_IP_RATE_LIMIT', 30),
    authAccountLimit: positive(env, 'AMCUI_AUTH_ACCOUNT_RATE_LIMIT', 10),
    authWindowMs: 15 * 60_000,
  };
}

export function configureProxyTrust(app: Express, value?: string): void {
  // Never trust all senders or a hop count: clients could forge their IP.
  if (!value?.trim()) {
    app.set('trust proxy', false);
    return;
  }
  const proxies = value.split(',').map((proxy) => proxy.trim());
  if (proxies.some((proxy) => !proxy || /^(true|false|\d+)$/i.test(proxy)))
    throw new Error('AMCUI_TRUST_PROXY must list trusted proxy IPs or CIDRs');
  app.set('trust proxy', proxies);
}

export function redisRateLimitStores(
  sendCommand: SendCommandFn,
): (prefix: string) => Store {
  return (prefix) =>
    new RedisStore({sendCommand, prefix: `amcui:rate:${prefix}:`});
}

function unavailableSafe(limiter: RequestHandler): RequestHandler {
  return (req, res, next) =>
    limiter(req, res, (error) => {
      if (error) {
        res.setHeader('Retry-After', '30');
        res
          .status(503)
          .json({error: 'Request protection unavailable. Try again later.'});
      } else next();
    });
}

function refundSafely(store: Store): Store {
  const decrement = store.decrement.bind(store);
  // Refunds run after the response. A Redis failure here must not become an
  // unhandled rejection; retain the reserved attempt until its normal expiry.
  store.decrement = async (key) => {
    try {
      await decrement(key);
    } catch {
      console.error('Authentication rate-limit refund failed');
    }
  };
  return store;
}

function account(req: Request): string | undefined {
  const authenticated = (req as Request & {user?: {username: string}}).user
    ?.username;
  const username = authenticated || req.body?.username;
  return typeof username === 'string' &&
    username.length > 0 &&
    username.length <= 200
    ? username.toLowerCase()
    : undefined;
}

export const credentialRoutes = [
  '/register',
  '/login',
  '/changePassword',
  '/profile/addAuthenticator',
  '/profile/removeMFA',
  '/profile/addFido2',
];

export function createRateLimits(
  store: (prefix: string) => Store,
  config: RateLimitConfig = rateLimitConfig(),
) {
  const common = {
    standardHeaders: 'draft-8' as const,
    legacyHeaders: false,
    passOnStoreError: false,
    message: {error: 'Too many requests. Try again later.'},
  };
  const ip = (req: Request) =>
    ipKeyGenerator(req.ip || req.socket.remoteAddress || 'unknown');
  return {
    api: unavailableSafe(
      rateLimit({
        ...common,
        identifier: 'api',
        windowMs: config.apiWindowMs,
        limit: config.apiLimit,
        store: store('api'),
        keyGenerator: ip,
      }),
    ),
    authIp: unavailableSafe(
      rateLimit({
        ...common,
        identifier: 'authentication-ip',
        windowMs: config.authWindowMs,
        limit: config.authIpLimit,
        store: store('auth-ip'),
        keyGenerator: ip,
        skip: (req) => req.method !== 'POST',
      }),
    ),
    authAccount: unavailableSafe(
      rateLimit({
        ...common,
        identifier: 'authentication-account',
        windowMs: config.authWindowMs,
        limit: config.authAccountLimit,
        store: refundSafely(store('auth-account')),
        skip: (req) => req.method !== 'POST' || !account(req),
        keyGenerator: (req) =>
          createHash('sha256').update(account(req)!).digest('hex'),
        // Reserve an attempt before password/MFA work, including concurrent guesses.
        // A 200 MFA challenge is not completed authentication.
        skipSuccessfulRequests: true,
        requestWasSuccessful: (_req, res) =>
          res.statusCode < 400 && res.locals.authenticationComplete === true,
      }),
    ),
  };
}
