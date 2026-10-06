import {randomUUID} from 'node:crypto';
import type {RedisClientType} from 'redis';

export class AdminError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export class AdminStore {
  constructor(readonly redis: RedisClientType) {}
  async get<T>(key: string): Promise<T | null> {
    const value = await this.redis.GET('amcui:admin:' + key);
    return value ? (JSON.parse(value) as T) : null;
  }
  async set(key: string, value: unknown) {
    await this.redis.SET('amcui:admin:' + key, JSON.stringify(value));
  }
  async audit(
    actor: string,
    action: string,
    target: string,
    result = 'success',
  ) {
    const at = Date.now();
    await this.redis.ZADD('amcui:admin:audit', {
      score: at,
      value: JSON.stringify({
        id: randomUUID(),
        at,
        actor,
        action,
        target,
        result,
      }),
    });
    await this.redis.ZREMRANGEBYSCORE(
      'amcui:admin:audit',
      0,
      at - 365 * 86400_000,
    );
  }
  async auditList() {
    return (
      await this.redis.ZRANGE('amcui:admin:audit', 0, 199, {REV: true})
    ).map((value) => JSON.parse(value));
  }
  async lock<T>(name: string, run: () => Promise<T>): Promise<T> {
    const key = 'amcui:admin:lock:' + name;
    const token = randomUUID();
    if (!(await this.redis.SET(key, token, {NX: true, PX: 60_000})))
      throw new AdminError('Operation already running', 409);
    let lost = false;
    const timer = setInterval(() => {
      void this.redis
        .eval(
          "if redis.call('get',KEYS[1]) == ARGV[1] then return redis.call('pexpire',KEYS[1],60000) else return 0 end",
          {keys: [key], arguments: [token]},
        )
        .then((result) => {
          if (!result) lost = true;
        })
        .catch(() => {
          lost = true;
        });
    }, 15_000);
    timer.unref();
    try {
      const result = await run();
      if (lost)
        throw new AdminError(
          'Operation lease lost; inspect job before retrying',
          503,
        );
      return result;
    } finally {
      clearInterval(timer);
      await this.redis
        .eval(
          "if redis.call('get',KEYS[1]) == ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end",
          {keys: [key], arguments: [token]},
        )
        .catch(() => {});
    }
  }
}
