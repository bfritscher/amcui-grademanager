import {createInterface} from 'node:readline';
import {Writable} from 'node:stream';
import {createHash} from 'node:crypto';
import {createClient, type RedisClientType} from 'redis';
import bcrypt from 'bcrypt';
import ACL from 'acl2';
import {registrationSchema} from './accounts.js';
import {AdminStore, AdminError} from './store.js';

// Explicit operator command for a fresh installation; never runs at startup.
let hidden = false;
const output = new Writable({
  write(chunk, _encoding, done) {
    if (!hidden) process.stdout.write(chunk);
    done();
  },
});
const input = createInterface({
  input: process.stdin,
  output,
  terminal: !!process.stdin.isTTY,
});
const question = (label: string, secret = false) =>
  new Promise<string>((resolve) => {
    process.stdout.write(label);
    hidden = secret;
    input.question('', (answer) => {
      hidden = false;
      if (secret) process.stdout.write('\n');
      resolve(answer);
    });
  });
let redis: RedisClientType | undefined;
try {
  const username = await question('Administrator username: ');
  const password = await question('Password (at least 12 characters): ', true);
  const data = registrationSchema
    .pick({username: true, password: true})
    .parse({username, password});
  input.close();
  redis = (await createClient({
    url: process.env.AMCUI_REDIS_URL || 'redis://redis:6379',
  }).connect()) as RedisClientType;
  const store = new AdminStore(redis);
  const client = redis;
  const acl = new ACL(new ACL.redisBackend({redis: client, prefix: 'acl'}));
  await store.lock('account-administration', async () => {
    if (await client.EXISTS('user:' + data.username))
      throw new AdminError(
        'Account already exists; this command never changes existing credentials',
      );
    for (const admin of await acl.roleUsers('admin'))
      if (await client.EXISTS('user:' + admin))
        throw new AdminError(
          'An administrator already exists; sign in with that account',
        );
    const hash = await bcrypt.hash(data.password, 12);
    const accountKey =
      'amcui:admin:account:' +
      createHash('sha256').update(data.username).digest('hex');
    await client
      .MULTI()
      .SET(
        'user:' + data.username,
        JSON.stringify({username: data.username, password: hash}),
      )
      .SET(
        accountKey,
        JSON.stringify({
          username: data.username,
          status: 'active',
          sessionVersion: 0,
          createdAt: Date.now(),
          approvedBy: 'bootstrap',
        }),
      )
      .SADD('amcui:admin:users', data.username)
      .EXEC();
    await acl.allow('admin', '/admin', 'admin');
    await acl.addUserRoles(data.username, 'admin');
    await store.audit('bootstrap', 'account.bootstrap', data.username);
  });
  process.stdout.write('Administrator created. Sign in and configure MFA.\n');
} catch (error) {
  process.stderr.write(
    (error instanceof AdminError
      ? error.message
      : 'Administrator creation failed; check the configuration and input') +
      '\n',
  );
  process.exitCode = 1;
} finally {
  input.close();
  await redis?.quit();
}
