import {createHash, randomUUID} from 'node:crypto';
import {AdminError, AdminStore} from './store.js';

export interface AdminJob {
  id: string;
  kind: string;
  actor: string;
  target: string;
  state: 'queued' | 'running' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  progress: string;
  error?: string;
  result?: unknown;
}
type Handler = (
  job: AdminJob,
  progress: (value: string) => Promise<void>,
) => Promise<unknown>;

export class AdminJobs {
  private handlers = new Map<string, Handler>();
  private timer?: ReturnType<typeof setInterval>;
  private working = false;
  constructor(readonly store: AdminStore) {}
  register(kind: string, handler: Handler) {
    this.handlers.set(kind, handler);
  }
  private pendingKey(kind: string, target: string) {
    return (
      'amcui:admin:pendingjob:' +
      createHash('sha256')
        .update(JSON.stringify([kind, target]))
        .digest('hex')
    );
  }
  async enqueue(kind: string, actor: string, target: string) {
    if (!this.handlers.has(kind)) throw new AdminError('Unknown job type');
    return this.store.lock(
      'job-enqueue:' + this.pendingKey(kind, target),
      async () => {
        const pending = await this.store.redis.GET(
          this.pendingKey(kind, target),
        );
        const existing = pending
          ? await this.store.get<AdminJob>('job:' + pending)
          : null;
        if (existing && ['running', 'queued'].includes(existing.state))
          return existing;
        const job: AdminJob = {
          id: randomUUID(),
          kind,
          actor,
          target,
          state: 'queued',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          progress: 'Queued',
        };
        await this.queue(job);
        return job;
      },
    );
  }
  private async queue(job: AdminJob) {
    await this.store.redis
      .MULTI()
      .SET('amcui:admin:job:' + job.id, JSON.stringify(job))
      .ZADD('amcui:admin:jobs', {score: job.createdAt, value: job.id})
      .ZADD('amcui:admin:jobqueue', {score: Date.now(), value: job.id})
      .SET(this.pendingKey(job.kind, job.target), job.id)
      .EXEC();
  }
  private async save(job: AdminJob) {
    job.updatedAt = Date.now();
    await this.store.set('job:' + job.id, job);
    await this.store.redis.ZADD('amcui:admin:jobs', {
      score: job.createdAt,
      value: job.id,
    });
  }
  async list(): Promise<AdminJob[]> {
    const ids = await this.store.redis.ZRANGE('amcui:admin:jobs', 0, 199, {
      REV: true,
    });
    const jobs = await Promise.all(
      ids.map((id) => this.store.get<AdminJob>('job:' + id)),
    );
    return jobs.filter((job): job is AdminJob => !!job);
  }
  async retry(id: string) {
    const job = await this.store.get<AdminJob>('job:' + id);
    if (!job || job.state !== 'failed')
      throw new AdminError('Only failed jobs can be retried', 409);
    return this.store.lock(
      'job-enqueue:' + this.pendingKey(job.kind, job.target),
      async () => {
        if (await this.store.redis.GET(this.pendingKey(job.kind, job.target)))
          throw new AdminError('Another job for this target is queued', 409);
        job.state = 'queued';
        job.updatedAt = Date.now();
        delete job.error;
        await this.queue(job);
        return job;
      },
    );
  }
  start() {
    this.timer = setInterval(() => {
      void this.tick().catch((error) =>
        console.error('Admin job queue unavailable', error.message),
      );
    }, 2000);
    this.timer.unref();
  }
  stop() {
    clearInterval(this.timer);
  }
  async tick() {
    if (this.working) return;
    this.working = true;
    try {
      await this.store.lock('jobworker', async () => {
        const [id] = await this.store.redis.ZRANGE(
          'amcui:admin:jobqueue',
          0,
          0,
        );
        if (!id) return;
        const job = await this.store.get<AdminJob>('job:' + id);
        if (!job) {
          await this.store.redis.ZREM('amcui:admin:jobqueue', id);
          return;
        }
        if (job.state === 'completed' || job.state === 'failed') {
          await this.store.redis.ZREM('amcui:admin:jobqueue', id);
          return;
        }
        const handler = this.handlers.get(job.kind);
        if (!handler) return;
        job.state = 'running';
        job.progress = 'Starting';
        await this.save(job);
        let updates = Promise.resolve();
        const progress = (value: string) => {
          updates = updates.then(async () => {
            job.progress = value;
            await this.save(job);
          });
          return updates;
        };
        try {
          job.result = await handler(job, progress);
          await updates;
          job.state = 'completed';
          job.progress = 'Completed';
        } catch (error) {
          await updates.catch(() => {});
          job.state = 'failed';
          job.error =
            error instanceof Error ? error.message : 'Operation failed';
        }
        job.updatedAt = Date.now();
        await this.store.redis
          .MULTI()
          .SET('amcui:admin:job:' + id, JSON.stringify(job))
          .ZREM('amcui:admin:jobqueue', id)
          .DEL(this.pendingKey(job.kind, job.target))
          .EXEC();
        await this.store.audit(job.actor, job.kind, job.target, job.state);
      });
    } catch (error) {
      if (!(error instanceof AdminError && error.status === 409)) throw error;
    } finally {
      this.working = false;
    }
  }
}
