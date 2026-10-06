import {createHash, randomUUID} from 'node:crypto';
import nodemailer from 'nodemailer';
import {AdminStore, AdminError} from './store.js';

interface Message {
  id: string;
  to: string;
  subject: string;
  text: string;
  attempts: number;
  nextAt: number;
  error?: string;
  sentAt?: number;
  expiresAt?: number;
}
export class AdminMail {
  private timer?: ReturnType<typeof setInterval>;
  private working = false;
  readonly configured: boolean;
  private transport;
  constructor(
    private store: AdminStore,
    private env: NodeJS.ProcessEnv = process.env,
  ) {
    this.configured = !!(
      env.AMCUI_SMTP_HOST &&
      env.AMCUI_MAIL_FROM &&
      env.AMCUI_WEB_URL
    );
    this.transport = this.configured
      ? nodemailer.createTransport({
          host: env.AMCUI_SMTP_HOST,
          port: Number(env.AMCUI_SMTP_PORT || 587),
          secure: env.AMCUI_SMTP_SECURE === 'true',
          requireTLS:
            env.AMCUI_SMTP_SECURE !== 'true' &&
            env.AMCUI_SMTP_REQUIRE_TLS !== 'false',
          auth: env.AMCUI_SMTP_USER
            ? {user: env.AMCUI_SMTP_USER, pass: env.AMCUI_SMTP_PASSWORD}
            : undefined,
          connectionTimeout: 10_000,
          socketTimeout: 30_000,
        })
      : null;
  }
  webLink(token: string) {
    const url = new URL(this.env.AMCUI_WEB_URL!);
    url.pathname = url.pathname.replace(/\/$/, '') + '/login';
    url.search = new URLSearchParams({verify: token}).toString();
    return url.toString();
  }
  async enqueue(
    to: string,
    subject: string,
    text: string,
    dedupe?: string,
    expiresAt?: number,
  ) {
    if (!this.configured)
      throw new AdminError('Email delivery is not configured', 503);
    const id = dedupe
      ? createHash('sha256').update(dedupe).digest('hex')
      : randomUUID();
    const key = 'mail:' + id;
    if (await this.store.get(key)) return;
    const message: Message = {
      id,
      to,
      subject,
      text,
      attempts: 0,
      nextAt: Date.now(),
      expiresAt,
    };
    await this.store.redis
      .MULTI()
      .SET('amcui:admin:' + key, JSON.stringify(message))
      .ZADD('amcui:admin:mailqueue', {score: message.nextAt, value: id})
      .EXEC();
  }
  async cancel(dedupe: string) {
    const id = createHash('sha256').update(dedupe).digest('hex');
    await this.store.redis
      .MULTI()
      .DEL('amcui:admin:mail:' + id)
      .ZREM('amcui:admin:mailqueue', id)
      .EXEC();
  }
  async notifyAdmins(subject: string, text: string) {
    for (const address of (this.env.AMCUI_ADMIN_EMAILS || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean))
      await this.enqueue(address, subject, text);
  }
  async status() {
    const ids = await this.store.redis.ZRANGE('amcui:admin:mailqueue', 0, 99);
    return {
      configured: this.configured,
      pending: await this.store.redis.ZCARD('amcui:admin:mailqueue'),
      failures: (
        await Promise.all(
          ids.map((id) => this.store.get<Message>('mail:' + id)),
        )
      )
        .filter((message) => message?.error)
        .map((message) => ({
          id: message!.id,
          attempts: message!.attempts,
          nextAt: message!.nextAt,
          error: message!.error,
        })),
    };
  }
  start() {
    this.timer = setInterval(() => {
      void this.tick().catch(() => console.error('Email queue unavailable'));
    }, 5000);
    this.timer.unref();
  }
  stop() {
    clearInterval(this.timer);
  }
  async tick() {
    if (this.working || !this.transport) return;
    this.working = true;
    try {
      await this.store.lock('mailworker', async () => {
        const [id] = await this.store.redis.ZRANGEBYSCORE(
          'amcui:admin:mailqueue',
          0,
          Date.now(),
          {LIMIT: {offset: 0, count: 1}},
        );
        if (!id) return;
        const message = await this.store.get<Message>('mail:' + id);
        if (
          !message ||
          message.sentAt ||
          (message.expiresAt && message.expiresAt <= Date.now())
        ) {
          await this.store.redis
            .MULTI()
            .DEL('amcui:admin:mail:' + id)
            .ZREM('amcui:admin:mailqueue', id)
            .EXEC();
          return;
        }
        try {
          await this.transport!.sendMail({
            from: this.env.AMCUI_MAIL_FROM,
            to: message.to,
            subject: message.subject,
            text: message.text,
          });
          // Erase addresses and verification links once delivery has completed.
          await this.store.set('mail:' + id, {sentAt: Date.now()});
          await this.store.redis.EXPIRE('amcui:admin:mail:' + id, 30 * 86400);
          await this.store.redis.ZREM('amcui:admin:mailqueue', id);
        } catch {
          message.attempts++;
          message.error = 'Email delivery failed';
          message.nextAt =
            Date.now() +
            Math.min(3600_000, 30_000 * 2 ** Math.min(message.attempts, 7));
          await this.store.set('mail:' + id, message);
          await this.store.redis.ZADD('amcui:admin:mailqueue', {
            score: message.nextAt,
            value: id,
          });
        }
      });
    } catch (error) {
      if (!(error instanceof AdminError && error.status === 409)) throw error;
    } finally {
      this.working = false;
    }
  }
}
