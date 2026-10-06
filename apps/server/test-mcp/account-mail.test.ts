import {afterEach, expect, it, vi} from 'vitest';
import {createHash} from 'node:crypto';
import bcrypt from 'bcrypt';
import nodemailer from 'nodemailer';
import {AdminAccounts, type AccountMeta} from '../src/admin/accounts.js';
import {AdminMail} from '../src/admin/mail.js';
import {AdminStore} from '../src/admin/store.js';
import {accountEmail} from '../src/admin/emailTemplate.js';

afterEach(() => vi.restoreAllMocks());

function fixture() {
  const values = new Map<string, string>();
  const redis = {
    GET: vi.fn(async (key: string) => values.get(key) || null),
    SET: vi.fn(async (key: string, value: string) => values.set(key, value)),
    EXISTS: vi.fn(async (key: string) => Number(values.has(key))),
    DEL: vi.fn(async (key: string) => values.delete(key)),
    SADD: vi.fn(),
  };
  const store = new AdminStore(redis as any);
  vi.spyOn(store, 'lock').mockImplementation(async (_name, run) => run());
  vi.spyOn(store, 'audit').mockResolvedValue();
  const mail = new AdminMail(store, {
    AMCUI_SMTP_HOST: 'localhost',
    AMCUI_MAIL_FROM: 'AMCUI <hello@example.org>',
    AMCUI_WEB_URL: 'https://example.org/amcui/?old=query#old',
    AMCUI_ADMIN_EMAILS: ' admin@example.org, , second@example.org ',
  });
  const enqueue = vi.spyOn(mail, 'enqueue').mockResolvedValue();
  const accounts = new AdminAccounts(store, mail, {
    userRoles: async () => [],
    roleUsers: async () => [],
    addUserRoles: async () => {},
    removeUserRoles: async () => {},
  });
  const token = 'a'.repeat(43);
  const hash = createHash('sha256').update(token).digest('hex');
  const meta: AccountMeta = {
    username: 'alice',
    displayName: 'Alice & Bob <Example>',
    email: 'alice@example.org',
    status: 'unverified',
    sessionVersion: 0,
    verificationHash: hash,
  };
  async function seed() {
    await store.set(
      'account:' + createHash('sha256').update(meta.username).digest('hex'),
      meta,
    );
    values.set('user:alice', JSON.stringify({password: 'hashed-password'}));
    values.set('amcui:admin:verify:' + hash, 'alice');
  }
  return {store, mail, accounts, enqueue, meta, token, seed};
}

it('notifies all configured admins after verification, without invalid-link or replay notifications', async () => {
  const {accounts, enqueue, meta, token, seed} = fixture();
  await seed();
  await expect(accounts.verify('invalid')).rejects.toThrow();
  expect(enqueue).not.toHaveBeenCalled();
  await accounts.verify(token);
  expect((await accounts.meta('alice')).status).toBe('pending');
  expect(enqueue.mock.calls.map((call) => call[0])).toEqual([
    'admin@example.org',
    'second@example.org',
  ]);
  const [, subject, text, , , html] = enqueue.mock.calls[0]!;
  expect(subject).toContain('awaiting approval');
  expect(text).toContain(meta.displayName);
  expect(text).toContain('Username: alice');
  expect(text).toContain('Email: alice@example.org');
  expect(html).toContain('href="https://example.org/amcui/admin"');
  expect(html).toContain('Alice &amp; Bob &lt;Example&gt;');
  await expect(accounts.verify(token)).rejects.toThrow();
  expect(enqueue).toHaveBeenCalledTimes(2);
});

it('personalizes confirmation mail and preserves expiring links when resent', async () => {
  const {accounts, mail, enqueue, seed} = fixture();
  await seed();
  vi.spyOn(bcrypt, 'compare').mockImplementation(async () => true);
  vi.spyOn(mail, 'cancel').mockResolvedValue();
  await accounts.resend('alice', 'password');
  expect(enqueue).toHaveBeenCalledTimes(1);
  const [to, , text, dedupe, expiresAt, html] = enqueue.mock.calls[0]!;
  expect(to).toBe('alice@example.org');
  expect(text).toContain('Hello Alice & Bob <Example>,');
  expect(text).toContain('24 hours');
  expect(text).toContain('administrator will review');
  expect(text).toContain('The AMCUI team');
  const url = new URL(text.match(/https:\/\/\S+/)![0]);
  expect(url.pathname).toBe('/amcui/login');
  expect(url.searchParams.get('verify')).toMatch(/^[\w-]{43}$/);
  expect(url.searchParams.has('old')).toBe(false);
  expect(url.hash).toBe('');
  expect(dedupe).toMatch(/^verification:/);
  expect(expiresAt).toBeGreaterThan(Date.now());
  expect(html).toContain(`href="${url.toString()}"`);
  expect(html).not.toContain('<Example>');
});

it.each(['pending', 'disabled'] as const)(
  'sends a named activation email with login link from %s',
  async (status) => {
    const {accounts, enqueue, meta, seed} = fixture();
    meta.status = status;
    await seed();
    await accounts.transition('alice', 'active', 'admin');
    const [to, , text, , , html] = enqueue.mock.calls[0]!;
    expect(to).toBe('alice@example.org');
    expect(text).toContain('Hello Alice & Bob <Example>,');
    expect(text).toContain('account is now active');
    expect(text).toContain('username (alice)');
    expect(text).toContain('https://example.org/amcui/login');
    expect(text).toContain('Best regards,\nThe AMCUI team');
    expect(html).toContain('href="https://example.org/amcui/login"');
  },
);

it('falls back to the username for older accounts without a display name', async () => {
  const {accounts, enqueue, meta, seed} = fixture();
  meta.status = 'pending';
  delete meta.displayName;
  await seed();
  await accounts.transition('alice', 'active', 'admin');
  expect(enqueue.mock.calls[0]![2]).toContain('Hello alice,');
});

it('escapes untrusted HTML while retaining readable plain text', () => {
  const message = accountEmail({
    title: '<img src=x>',
    greeting: 'Hello <script>alert("hi")</script>,',
    paragraphs: ['A & B'],
    action: {label: '<Confirm>', url: 'https://example.org/?a=1&b="2"'},
    note: '<Note>',
  });
  expect(message.html).not.toMatch(/<script|<img|<Confirm>|<Note>/);
  expect(message.html).toContain(
    'href="https://example.org/?a=1&amp;b=&quot;2&quot;"',
  );
  expect(message.text).toContain('A & B');
});

it('delivers HTML and plain text from the queue and erases the body afterwards', async () => {
  const sendMail = vi.fn().mockResolvedValue({});
  vi.spyOn(nodemailer, 'createTransport').mockReturnValue({sendMail} as any);
  const {store, mail, enqueue} = fixture();
  enqueue.mockRestore();
  let id = '';
  const transaction = {
    SET: vi.fn((key: string, value: string) => {
      void store.redis.SET(key, value);
      return transaction;
    }),
    ZADD: vi.fn((_key: string, entry: {value: string}) => {
      id = entry.value;
      return transaction;
    }),
    EXEC: vi.fn(),
  };
  Object.assign(store.redis, {
    MULTI: () => transaction,
    ZRANGEBYSCORE: async () => [id],
    EXPIRE: vi.fn(),
    ZREM: vi.fn(),
  });
  await mail.enqueue(
    'alice@example.org',
    'Welcome',
    'Plain text',
    'test',
    undefined,
    '<p>Welcome</p>',
  );
  await mail.tick();
  expect(sendMail).toHaveBeenCalledWith(
    expect.objectContaining({
      text: 'Plain text',
      html: '<p>Welcome</p>',
      to: 'alice@example.org',
    }),
  );
  expect(await store.get('mail:' + id)).toEqual({sentAt: expect.any(Number)});
});
