import {afterEach, expect, it, vi} from 'vitest';
import express from 'express';
import request from 'supertest';
import {MemoryStore, type Store} from 'express-rate-limit';
import {randomUUID} from 'node:crypto';
import {createClient} from 'redis';
import {
  configureProxyTrust,
  createRateLimits,
  credentialRoutes,
  rateLimitConfig,
  redisRateLimitStores,
  type RateLimitConfig,
} from '../src/security/rateLimits.js';
import {validateLogin, validatePasswordChange} from '../src/security/login.js';

const memoryStores: MemoryStore[] = [];
afterEach(() => {
  for (const store of memoryStores.splice(0)) store.shutdown();
});
const memory = () => {
  const store = new MemoryStore();
  memoryStores.push(store);
  return store;
};
const defaults: RateLimitConfig = {
  apiLimit: 100,
  apiWindowMs: 60_000,
  authIpLimit: 100,
  authAccountLimit: 2,
  authWindowMs: 15 * 60_000,
};

function fixture(
  config: Partial<RateLimitConfig> = {},
  store: (prefix: string) => Store = memory,
  trusted?: string,
) {
  const app = express();
  configureProxyTrust(app, trusted);
  const limits = createRateLimits(store, {...defaults, ...config});
  app.use(limits.api);
  app.use(credentialRoutes, limits.authIp);
  app.use(express.json());
  const authenticate = vi.fn((req, res) => {
    if (req.body.password === 'correct') {
      if (req.body.challenge) res.json({authenticator: []});
      else {
        res.locals.authenticationComplete = true;
        res.json({token: 'test-token'});
      }
    } else res.sendStatus(401);
  });
  app.post('/login', validateLogin, limits.authAccount, (req, res) => {
    // A password-only request for an MFA user responds 200 with a challenge.
    if (req.body.username.toLowerCase() === 'mfa')
      res.json({authenticator: []});
    else authenticate(req, res);
  });
  app.post(
    '/changePassword',
    validatePasswordChange,
    limits.authAccount,
    authenticate,
  );
  app.post(
    '/profile/removeMFA',
    (req, _res, next) => {
      req.user = {username: 'alice'};
      next();
    },
    limits.authAccount,
    authenticate,
  );
  app.get('/project/list', (_req, res) => res.json([]));
  return {app, authenticate};
}
const login = (app: express.Express, username = 'alice', password = 'wrong') =>
  request(app).post('/login').send({username, password});

it('limits general API traffic with HTTP 429, rate headers and Retry-After', async () => {
  const {app} = fixture({apiLimit: 2});
  await request(app).get('/project/list').expect(200);
  await request(app).get('/project/list').expect(200);
  const response = await request(app).get('/project/list').expect(429);
  expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
  expect(response.headers.ratelimit).toContain('api');
});

it('blocks password spraying across account names before authentication', async () => {
  const {app, authenticate} = fixture({authIpLimit: 2});
  await login(app, 'alice').expect(401);
  await login(app, 'bob').expect(401);
  await login(app, 'charlie').expect(429);
  expect(authenticate).toHaveBeenCalledTimes(2);
});

it('normalizes usernames and shares an account failure budget across login and password change', async () => {
  const {app, authenticate} = fixture();
  await login(app, 'ALICE').expect(401);
  await request(app)
    .post('/changePassword')
    .send({username: 'alice', password: 'wrong', newPassword: 'changed'})
    .expect(401);
  await login(app, 'AlIcE').expect(429);
  await login(app, 'bob').expect(401);
  expect(authenticate).toHaveBeenCalledTimes(3);
});

it('cannot bypass an account limit by rotating IPs or spoofing a profile username', async () => {
  const {app} = fixture({}, memory, 'loopback');
  await login(app).set('X-Forwarded-For', '192.0.2.1').expect(401);
  await login(app, 'ALICE').set('X-Forwarded-For', '192.0.2.2').expect(401);
  await login(app).set('X-Forwarded-For', '192.0.2.3').expect(429);
  await request(app)
    .post('/profile/removeMFA')
    .send({username: 'bob', password: 'wrong'})
    .expect(429);
});

it('ignores forged forwarding headers from untrusted clients', async () => {
  const {app} = fixture({authIpLimit: 2});
  await login(app, 'alice').set('X-Forwarded-For', '192.0.2.1').expect(401);
  await login(app, 'bob').set('X-Forwarded-For', '192.0.2.2').expect(401);
  await login(app, 'charlie').set('X-Forwarded-For', '192.0.2.3').expect(429);
});

it('groups IPv6 addresses into a subnet to prevent address rotation', async () => {
  const {app} = fixture({authIpLimit: 2}, memory, 'loopback');
  await login(app, 'alice')
    .set('X-Forwarded-For', '2001:db8:1234:5600::1')
    .expect(401);
  await login(app, 'bob')
    .set('X-Forwarded-For', '2001:db8:1234:56ff::2')
    .expect(401);
  await login(app, 'charlie')
    .set('X-Forwarded-For', '2001:db8:1234:5601::3')
    .expect(429);
});

it('refunds only completed authentication without erasing earlier failures', async () => {
  const {app} = fixture();
  await login(app).expect(401);
  for (let i = 0; i < 4; i++) await login(app, 'alice', 'correct').expect(200);
  await login(app).expect(401);
  await login(app).expect(429);
});

it('counts 200 MFA challenges and throttles case-insensitive routes', async () => {
  const {app} = fixture();
  await login(app, 'mfa', 'correct').expect(200);
  await request(app)
    .post('/LOGIN/')
    .send({username: 'MFA', password: 'correct'})
    .expect(200);
  await login(app, 'mfa', 'correct').expect(429);
});

it('counts malformed requests against the IP budget before body validation', async () => {
  const {app, authenticate} = fixture({authIpLimit: 2});
  await request(app).post('/login').send({username: 1}).expect(400);
  await request(app).post('/login').send({}).expect(400);
  await request(app).post('/login').send({}).expect(429);
  expect(authenticate).not.toHaveBeenCalled();
});

it('reserves attempts atomically before concurrent password checks', async () => {
  const {app, authenticate} = fixture({authAccountLimit: 3});
  const responses = await Promise.all(
    Array.from({length: 20}, () => login(app)),
  );
  expect(responses.filter((response) => response.status === 401)).toHaveLength(
    3,
  );
  expect(responses.filter((response) => response.status === 429)).toHaveLength(
    17,
  );
  expect(authenticate).toHaveBeenCalledTimes(3);
});

it.each(['api', 'auth-ip', 'auth-account'])(
  'blocks authentication if the %s counter store is unavailable',
  async (failingPrefix) => {
    const failed = (): Store => ({
      increment: async () => {
        throw new Error('redis unavailable');
      },
      decrement: () => {},
      resetKey: () => {},
    });
    const {app, authenticate} = fixture({}, (prefix) =>
      prefix === failingPrefix ? failed() : memory(),
    );
    await login(app).expect(503);
    expect(authenticate).not.toHaveBeenCalled();
  },
);

it('does not permit disabling rate limits or blanket proxy trust through configuration', () => {
  expect(() => rateLimitConfig({AMCUI_AUTH_ACCOUNT_RATE_LIMIT: '0'})).toThrow(
    'Invalid',
  );
  expect(() => rateLimitConfig({AMCUI_API_RATE_LIMIT: '-1'})).toThrow(
    'Invalid',
  );
  expect(() => rateLimitConfig({AMCUI_AUTH_IP_RATE_LIMIT: 'NaN'})).toThrow(
    'Invalid',
  );
  expect(() => configureProxyTrust(express(), 'true')).toThrow('trusted proxy');
  expect(() => configureProxyTrust(express(), '1')).toThrow('trusted proxy');
});

it('observes refund failures after a successful response and retains the reserved attempt', async () => {
  const report = vi.spyOn(console, 'error').mockImplementation(() => {});
  const factory = (prefix: string) => {
    const store = memory();
    if (prefix === 'auth-account')
      store.decrement = async () => {
        throw new Error('redis offline');
      };
    return store;
  };
  try {
    const {app} = fixture({authAccountLimit: 1}, factory);
    await login(app, 'alice', 'correct').expect(200);
    await login(app).expect(429);
    expect(report).toHaveBeenCalledWith(
      'Authentication rate-limit refund failed',
    );
  } finally {
    report.mockRestore();
  }
});

// Opt in with a disposable loopback Redis, never a shared or production instance.
it.runIf(Boolean(process.env.AMCUI_TEST_REDIS_URL))(
  'shares atomic Redis counters across instances and retains them after recreating the middleware',
  async () => {
    const url = process.env.AMCUI_TEST_REDIS_URL!;
    expect(['localhost', '127.0.0.1', '[::1]']).toContain(
      new URL(url).hostname,
    );
    const redis = createClient({url, disableOfflineQueue: true});
    await redis.connect();
    const namespace = randomUUID();
    const stores = redisRateLimitStores((...args) => redis.sendCommand(args));
    const factory = (prefix: string) => stores(`${namespace}:${prefix}`);
    try {
      const first = fixture({authAccountLimit: 3}, factory);
      const second = fixture({authAccountLimit: 3}, factory);
      const responses = await Promise.all(
        Array.from({length: 20}, (_, i) =>
          login(i % 2 ? first.app : second.app),
        ),
      );
      expect(
        responses.filter((response) => response.status === 401),
      ).toHaveLength(3);
      expect(
        responses.filter((response) => response.status === 429),
      ).toHaveLength(17);
      await login(fixture({authAccountLimit: 3}, factory).app).expect(429);
      const keys = await redis.keys(`amcui:rate:${namespace}:*`);
      for (const key of keys) expect(await redis.pTTL(key)).toBeGreaterThan(0);
      await redis.del(keys);
      const expires = fixture({apiLimit: 1, apiWindowMs: 1000}, factory);
      await request(expires.app).get('/project/list').expect(200);
      await request(expires.app).get('/project/list').expect(429);
      await new Promise((resolve) => setTimeout(resolve, 1100));
      await request(expires.app).get('/project/list').expect(200);
    } finally {
      const keys = await redis.keys(`amcui:rate:${namespace}:*`);
      if (keys.length) await redis.del(keys);
      await redis.quit();
    }
  },
);
