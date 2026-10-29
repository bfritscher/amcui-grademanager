import {createHash, randomBytes, randomUUID} from 'node:crypto';
import bcrypt from 'bcrypt';
import {z} from 'zod';
import {AdminError, AdminStore} from './store.js';
import {AdminMail} from './mail.js';
import {accountEmail} from './emailTemplate.js';
import {hasControlCharacters} from '../security/paths.js';

export type AccountState =
  | 'unverified'
  | 'pending'
  | 'active'
  | 'rejected'
  | 'disabled'
  | 'merging'
  | 'merged';
export interface AccountMeta {
  username: string;
  status: AccountState;
  sessionVersion: number;
  email?: string;
  displayName?: string;
  createdAt?: number;
  verifiedAt?: number;
  lastLoginAt?: number;
  lastHumanActivityAt?: number;
  lastMcpActivityAt?: number;
  approvedAt?: number;
  approvedBy?: string;
  mergedInto?: string;
  verificationHash?: string;
  mergeOperation?: string;
}
export interface AccountAcl {
  userRoles(username: string): Promise<string[]>;
  roleUsers(role: string): Promise<string[]>;
  addUserRoles(username: string, roles: string | string[]): Promise<unknown>;
  removeUserRoles(username: string, role: string): Promise<unknown>;
}
interface Merge {
  id: string;
  source: string;
  target: string;
  roles: string[];
  sourceMeta: AccountMeta;
  targetMeta: AccountMeta;
  state: 'prepared' | 'running' | 'finalizing' | 'completed';
}
const digest = (value: string) =>
  createHash('sha256').update(value).digest('hex');
export const registrationSchema = z.object({
  username: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[a-z0-9][a-z0-9@._+-]*$/i)
    .transform((value) => value.toLowerCase()),
  email: z
    .email()
    .max(254)
    .transform((value) => value.toLowerCase()),
  password: z
    .string()
    .min(12)
    .max(72)
    .refine(
      (value) => Buffer.byteLength(value) <= 72,
      'Password must be at most 72 UTF-8 bytes',
    ),
  displayName: z
    .string()
    .trim()
    .min(1)
    .max(150)
    .refine((value) => !hasControlCharacters(value)),
});

export class AdminAccounts {
  revokeGrants: (username: string) => Promise<void> = async () => {};
  disconnect: (username: string) => Promise<void> = async () => {};
  constructor(
    readonly store: AdminStore,
    readonly mail: AdminMail,
    readonly acl: AccountAcl,
  ) {}
  private key(username: string) {
    return 'account:' + digest(username);
  }
  async meta(username: string): Promise<AccountMeta> {
    return (
      (await this.store.get<AccountMeta>(this.key(username))) || {
        username,
        status: 'active',
        sessionVersion: 0,
      }
    );
  }
  private async save(meta: AccountMeta) {
    await this.store.set(this.key(meta.username), meta);
    await this.store.redis.SADD('amcui:admin:users', meta.username);
  }
  async active(username: string, sessionVersion?: number): Promise<boolean> {
    if (!username || !(await this.store.redis.EXISTS('user:' + username)))
      return false;
    const meta = await this.meta(username);
    return (
      meta.status === 'active' &&
      (sessionVersion === undefined ||
        (sessionVersion || 0) === meta.sessionVersion)
    );
  }
  async register(input: unknown) {
    const data = registrationSchema.parse(input);
    if (!this.mail.configured)
      throw new AdminError(
        'Registration requires configured email delivery',
        503,
      );
    return this.store.lock('account:' + digest(data.username), async () => {
      if (await this.store.redis.EXISTS('user:' + data.username)) return;
      const emailKey = 'amcui:admin:email:' + digest(data.email);
      const password = await bcrypt.hash(data.password, 12);
      const meta: AccountMeta = {
        username: data.username,
        email: data.email,
        displayName: data.displayName,
        status: 'unverified',
        sessionVersion: 0,
        createdAt: Date.now(),
      };
      // Credentials and non-active metadata must appear together. A partial
      // registration must never resemble a grandfathered legacy account.
      const created = await this.store.redis.eval(
        "if redis.call('exists',KEYS[1]) == 1 or redis.call('exists',KEYS[2]) == 1 then return 0 end redis.call('set',KEYS[1],ARGV[1]); redis.call('set',KEYS[2],ARGV[2]); redis.call('set',KEYS[3],ARGV[3]); redis.call('sadd',KEYS[4],ARGV[2]); return 1",
        {
          keys: [
            'user:' + data.username,
            emailKey,
            'amcui:admin:' + this.key(data.username),
            'amcui:admin:users',
          ],
          arguments: [
            JSON.stringify({username: data.username, password}),
            data.username,
            JSON.stringify(meta),
          ],
        },
      );
      if (!created) return;
      await this.sendVerification(meta);
      await this.store.audit(data.username, 'account.request', data.username);
    });
  }
  async updateDisplayName(username: string, input: unknown, actor: string) {
    const displayName = registrationSchema.shape.displayName.parse(input);
    return this.store.lock('account-administration', () =>
      this.store.lock('account:' + digest(username), async () => {
        if (!(await this.store.redis.EXISTS('user:' + username)))
          throw new AdminError('Account not found', 404);
        const meta = await this.meta(username);
        if (meta.status === 'merging' || meta.status === 'merged')
          throw new AdminError(
            'Account is being merged or has been retired',
            409,
          );
        if (meta.displayName !== displayName) {
          meta.displayName = displayName;
          await this.save(meta);
          await this.store.audit(actor, 'account.name', username);
        }
        return {username, displayName};
      }),
    );
  }
  async updateEmail(username: string, input: unknown, actor: string) {
    const email = z
      .string()
      .trim()
      .pipe(registrationSchema.shape.email)
      .parse(input);
    return this.store.lock('account-administration', () =>
      this.store.lock('account:' + digest(username), async () => {
        if (!(await this.store.redis.EXISTS('user:' + username)))
          throw new AdminError('Account not found', 404);
        const meta = await this.meta(username);
        if (meta.status === 'merging' || meta.status === 'merged')
          throw new AdminError(
            'Account is being merged or has been retired',
            409,
          );
        if (meta.email === email) return {username, email};
        const previousEmail = meta.email;
        const verificationHash = meta.verificationHash;
        meta.email = email;
        delete meta.verifiedAt;
        delete meta.verificationHash;
        // Claim the address and release its previous reservation atomically with
        // metadata, including when public registration races with this update.
        const changed = await this.store.redis.eval(
          `local owner = redis.call('get', KEYS[1])
          if owner and owner ~= ARGV[1] then return 0 end
          redis.call('set', KEYS[1], ARGV[1])
          if KEYS[1] ~= KEYS[2] and redis.call('get', KEYS[2]) == ARGV[1] then
            redis.call('del', KEYS[2])
          end
          redis.call('set', KEYS[3], ARGV[2])
          redis.call('sadd', KEYS[4], ARGV[1])
          if ARGV[3] ~= '' then
            redis.call('del', KEYS[5], KEYS[6])
            redis.call('zrem', KEYS[7], ARGV[3])
          end
          return 1`,
          {
            keys: [
              'amcui:admin:email:' + digest(email),
              'amcui:admin:email:' + digest(previousEmail || email),
              'amcui:admin:' + this.key(username),
              'amcui:admin:users',
              'amcui:admin:verify:' + (verificationHash || ''),
              'amcui:admin:mail:' +
                (verificationHash
                  ? digest('verification:' + verificationHash)
                  : ''),
              'amcui:admin:mailqueue',
            ],
            arguments: [
              username,
              JSON.stringify(meta),
              verificationHash
                ? digest('verification:' + verificationHash)
                : '',
            ],
          },
        );
        if (!changed)
          throw new AdminError(
            'Email address is already associated with another account',
            409,
          );
        await this.store.audit(actor, 'account.email', username);
        return {username, email};
      }),
    );
  }
  private async sendVerification(meta: AccountMeta) {
    const token = randomBytes(32).toString('base64url');
    const hash = digest(token);
    await this.store.redis.SET('amcui:admin:verify:' + hash, meta.username, {
      EX: 86400,
    });
    const old = meta.verificationHash;
    meta.verificationHash = hash;
    await this.save(meta);
    const message = accountEmail({
      title: 'Confirm your email address',
      greeting: `Hello ${meta.displayName || meta.username},`,
      paragraphs: [
        'Thank you for requesting an AMCUI account. Please confirm your email address to continue.',
        'After confirmation, an administrator will review your request. We will email you when your account is activated.',
      ],
      action: {
        label: 'Confirm my email address',
        url: this.mail.webLink(token),
      },
      note: 'This link is valid for 24 hours. If you did not request an AMCUI account, you can ignore this email.',
    });
    await this.mail.enqueue(
      meta.email!,
      'Verify your AMCUI account request',
      message.text,
      'verification:' + hash,
      Date.now() + 86400_000,
      message.html,
    );
    if (old) {
      await this.store.redis.DEL('amcui:admin:verify:' + old);
      await this.mail.cancel('verification:' + old);
    }
  }
  async resend(username: string, password: string) {
    const value = await this.store.redis.GET('user:' + username);
    if (!value || !(await bcrypt.compare(password, JSON.parse(value).password)))
      return;
    await this.store.lock('account:' + digest(username), async () => {
      const meta = await this.meta(username);
      if (meta.status === 'unverified') await this.sendVerification(meta);
    });
  }
  async verify(token: string) {
    if (!/^[\w-]{43}$/.test(token))
      throw new AdminError('Invalid or expired verification link');
    const hash = digest(token);
    const username = await this.store.redis.GET('amcui:admin:verify:' + hash);
    if (!username) throw new AdminError('Invalid or expired verification link');
    await this.store.lock('account:' + digest(username), async () => {
      const meta = await this.meta(username);
      if (
        meta.status !== 'unverified' ||
        meta.verificationHash !== hash ||
        !(await this.store.redis.EXISTS('amcui:admin:verify:' + hash))
      )
        throw new AdminError('Invalid or expired verification link');
      meta.status = 'pending';
      meta.verifiedAt = Date.now();
      delete meta.verificationHash;
      await this.save(meta);
      await this.store.redis.DEL('amcui:admin:verify:' + hash);
      const message = accountEmail({
        title: 'Account request awaiting approval',
        greeting: 'Hello administrator,',
        paragraphs: [
          `${meta.displayName || username} has confirmed their email address and their AMCUI account request is ready for review.`,
          `Name: ${meta.displayName || username}`,
          `Username: ${username}`,
          `Email: ${meta.email}`,
          'Open the administration page and select Approvals to approve or reject this request.',
        ],
        action: {
          label: 'Review account requests',
          url: this.mail.pageLink('admin'),
        },
      });
      await this.mail.notifyAdmins(
        'AMCUI account awaiting approval',
        message.text,
        message.html,
      );
      await this.store.audit(username, 'account.verify', username);
    });
  }
  private async protectLastAdmin(username: string) {
    const roles = await this.acl.userRoles(username);
    if (!roles.includes('admin')) return;
    const admins = await this.acl.roleUsers('admin');
    for (const admin of admins)
      if (admin !== username && (await this.active(admin))) return;
    throw new AdminError(
      'The last active administrator cannot be disabled or merged',
      409,
    );
  }
  async transition(
    username: string,
    status: 'active' | 'rejected' | 'disabled',
    actor: string,
  ) {
    await this.store.lock('account-administration', async () => {
      if (!(await this.store.redis.EXISTS('user:' + username)))
        throw new AdminError('Account not found', 404);
      const meta = await this.meta(username);
      const valid =
        status === 'active'
          ? ['pending', 'disabled']
          : status === 'rejected'
            ? ['pending']
            : ['active'];
      if (!valid.includes(meta.status))
        throw new AdminError('Invalid account state change', 409);
      if (status !== 'active') await this.protectLastAdmin(username);
      meta.status = status;
      meta.sessionVersion++;
      if (status === 'active') {
        meta.approvedAt = Date.now();
        meta.approvedBy = actor;
      }
      await this.save(meta);
      await this.revokeGrants(username);
      await this.disconnect(username);
      if (meta.email) {
        const message = accountEmail({
          title:
            status === 'active'
              ? 'Your AMCUI account is ready'
              : 'Your AMCUI account update',
          greeting: `Hello ${meta.displayName || username},`,
          paragraphs:
            status === 'active'
              ? [
                  'Your AMCUI account is now active. You can sign in and start using AMCUI.',
                  `Sign in with your username (${username}) and the password you chose for your account.`,
                ]
              : [
                  status === 'rejected'
                    ? `Your AMCUI account request (${username}) has been declined by an administrator.`
                    : `Your AMCUI account (${username}) has been disabled by an administrator.`,
                ],
          action:
            status === 'active'
              ? {label: 'Sign in to AMCUI', url: this.mail.pageLink('login')}
              : undefined,
        });
        await this.mail.enqueue(
          meta.email,
          'AMCUI account ' + status,
          message.text,
          `account:${username}:${meta.sessionVersion}`,
          undefined,
          message.html,
        );
      }
      await this.store.audit(actor, 'account.' + status, username);
    });
  }
  async revoke(username: string, actor: string, reason: string) {
    return this.updateCredentials(username, actor, reason, async () => {});
  }
  async updateCredentials(
    username: string,
    actor: string,
    reason: string,
    update: () => Promise<void>,
  ) {
    await this.store.lock('account-administration', async () => {
      if (!(await this.store.redis.EXISTS('user:' + username)))
        throw new AdminError('Account not found', 404);
      const meta = await this.meta(username);
      if (meta.status === 'merging' || meta.status === 'merged')
        throw new AdminError(
          'Account is being merged or has been retired',
          409,
        );
      // Serialize credential writes with merges and state transitions.
      meta.sessionVersion++;
      await this.save(meta);
      await update();
      await this.revokeGrants(username);
      await this.disconnect(username);
      await this.store.audit(actor, reason, username);
    });
  }
  async activity(username: string, kind: 'login' | 'human' | 'mcp') {
    // Separate timestamp keys avoid overwriting status/session changes during activity.
    await this.store.redis.ZADD('amcui:admin:activity:' + kind, {
      score: Date.now(),
      value: username,
    });
    await this.store.redis.SADD('amcui:admin:users', username);
  }
  async list() {
    const users = await this.store.redis.SMEMBERS('amcui:admin:users');
    const rows = [];
    for (const username of users) {
      if (!(await this.store.redis.EXISTS('user:' + username))) continue;
      const meta = await this.meta(username);
      const projects = (await this.acl.userRoles(username))
        .filter((role) => role !== 'admin')
        .sort();
      const [login, human, mcp] = await Promise.all(
        ['login', 'human', 'mcp'].map((kind) =>
          this.store.redis.ZSCORE('amcui:admin:activity:' + kind, username),
        ),
      );
      const lastHumanActivityAt =
        Math.max(login || 0, human || 0, meta.lastHumanActivityAt || 0) || null;
      rows.push({
        ...meta,
        verificationHash: undefined,
        projects,
        lastLoginAt: login || meta.lastLoginAt || null,
        lastHumanActivityAt,
        lastMcpActivityAt: mcp || meta.lastMcpActivityAt || null,
        inactive: lastHumanActivityAt
          ? Date.now() - lastHumanActivityAt > 730 * 86400_000
          : false,
      });
    }
    return rows;
  }
  async mergePreview(source: string, target: string) {
    if (source === target)
      throw new AdminError('Select two different accounts');
    if (!(await this.active(source)) || !(await this.active(target)))
      throw new AdminError('Both accounts must be active', 409);
    await this.protectLastAdmin(source);
    const roles = (await this.acl.userRoles(source)).filter(
      (role) => role !== 'admin',
    );
    const targetRoles = await this.acl.userRoles(target);
    return {
      source,
      target,
      projects: [
        ...new Set([
          ...roles,
          ...targetRoles.filter((role) => role !== 'admin'),
        ]),
      ].sort(),
      addedProjects: roles.filter((role) => !targetRoles.includes(role)),
      sourceAdministrator: (await this.acl.userRoles(source)).includes('admin'),
    };
  }
  async prepareMerge(source: string, target: string) {
    return this.store.lock('account-administration', async () => {
      await this.mergePreview(source, target);
      const merge: Merge = {
        id: randomUUID(),
        source,
        target,
        roles: (await this.acl.userRoles(source)).filter(
          (role) => role !== 'admin',
        ),
        sourceMeta: await this.meta(source),
        targetMeta: await this.meta(target),
        state: 'prepared',
      };
      await this.store.set('merge:' + merge.id, merge);
      return merge.id;
    });
  }
  async merge(id: string) {
    return this.store.lock('account-administration', async () => {
      const merge = await this.store.get<Merge>('merge:' + id);
      if (!merge) throw new AdminError('Merge not found', 404);
      if (merge.state === 'completed')
        return {source: merge.source, target: merge.target};
      if (merge.state === 'prepared') {
        await this.mergePreview(merge.source, merge.target);
        merge.sourceMeta = await this.meta(merge.source);
        merge.targetMeta = await this.meta(merge.target);
        merge.roles = (await this.acl.userRoles(merge.source)).filter(
          (role) => role !== 'admin',
        );
        merge.state = 'running';
        await this.store.set('merge:' + id, merge);
      }
      if (merge.state === 'running') {
        for (const original of [merge.sourceMeta, merge.targetMeta]) {
          const current = await this.meta(original.username);
          if (current.status === 'merging' && current.mergeOperation !== id)
            throw new AdminError(
              'Account belongs to another merge operation',
              409,
            );
          if (!['active', 'merging'].includes(current.status))
            throw new AdminError('Account state changed during merge', 409);
          await this.save({
            ...original,
            status: 'merging',
            sessionVersion: original.sessionVersion + 1,
            mergeOperation: id,
          });
          await this.revokeGrants(original.username);
          await this.disconnect(original.username);
        }
        if (merge.roles.length)
          await this.acl.addUserRoles(merge.target, merge.roles);
        for (const role of await this.acl.userRoles(merge.source))
          await this.acl.removeUserRoles(merge.source, role);
        for (const kind of ['login', 'human', 'mcp']) {
          const key = 'amcui:admin:activity:' + kind;
          const score = Math.max(
            (await this.store.redis.ZSCORE(key, merge.source)) || 0,
            (await this.store.redis.ZSCORE(key, merge.target)) || 0,
          );
          if (score)
            await this.store.redis.ZADD(key, {score, value: merge.target});
        }
        const recent = await this.store.redis.ZRANGE_WITHSCORES(
          'user:' + merge.source + ':recent',
          0,
          -1,
        );
        for (const row of recent)
          await this.store.redis.ZADD('user:' + merge.target + ':recent', row, {
            GT: true,
          });
        await this.store.redis.ZREMRANGEBYRANK(
          'user:' + merge.target + ':recent',
          0,
          -11,
        );
        // Journal finalization before either account becomes accessible again.
        merge.state = 'finalizing';
        await this.store.set('merge:' + id, merge);
      }
      const source = await this.meta(merge.source);
      const target = await this.meta(merge.target);
      if (source.status === 'merging' && source.mergeOperation === id)
        await this.save({
          ...source,
          status: 'merged',
          mergedInto: merge.target,
        });
      else if (
        source.status !== 'merged' ||
        source.mergedInto !== merge.target ||
        source.mergeOperation !== id
      )
        throw new AdminError(
          'Source account changed during merge finalization',
          409,
        );
      if (target.status === 'merging' && target.mergeOperation === id)
        await this.save({...target, status: 'active'});
      else if (
        target.mergeOperation !== id ||
        target.sessionVersion < merge.targetMeta.sessionVersion + 1
      )
        throw new AdminError(
          'Target account changed during merge finalization',
          409,
        );
      merge.state = 'completed';
      await this.store.set('merge:' + id, merge);
      return {
        source: merge.source,
        target: merge.target,
        projects: merge.roles.length,
      };
    });
  }
}
