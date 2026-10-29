import fs from 'fs-extra';
import {createHash} from 'node:crypto';
import express, {type Express, type RequestHandler} from 'express';
import {z} from 'zod';
import {readExam} from '@amcui/exam-core';
import {simpleGit} from 'simple-git';
import {AdminStore, AdminError} from './store.js';
import {AdminAccounts} from './accounts.js';
import {AdminJobs} from './jobs.js';
import {ProjectLifecycle} from './lifecycle.js';
import {diskWork} from './worker.js';
import type {ArchiveManifest, DiskProject} from './disk.js';
import {ExamDocuments} from '../exam/documents.js';
import {asyncHandler, validateLogin} from '../security/login.js';
import {hasControlCharacters, projectPath} from '../security/paths.js';

const username = z
  .string()
  .min(1)
  .max(200)
  .refine((value) => !hasControlCharacters(value));
const mergeSchema = z.object({source: username, target: username});
const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex');
export class AdminService {
  readonly jobs: AdminJobs;
  private daily?: ReturnType<typeof setInterval>;
  metrics = {
    requests: 0,
    errors: 0,
    throttled: 0,
    latencyMs: 0,
    maxLatencyMs: 0,
  };
  constructor(
    readonly store: AdminStore,
    readonly accounts: AdminAccounts,
    readonly lifecycle: ProjectLifecycle,
    readonly documents: ExamDocuments,
    private waitGit: (project: string) => Promise<void>,
    private runGit: <T>(
      project: string,
      run: () => Promise<T>,
    ) => Promise<T> = (_project, run) => run(),
  ) {
    this.jobs = new AdminJobs(store);
    this.jobs.register('inventory', (job, progress) =>
      this.inventory(job.target || undefined, progress),
    );
    this.jobs.register('gitgc', async (job) =>
      this.lifecycle.operation([job.target], true, async () => {
        await this.waitGit(job.target);
        await this.runGit(job.target, () =>
          simpleGit(projectPath(this.lifecycle.root, job.target)).raw(['gc']),
        );
        return this.measure(job.target);
      }),
    );
    this.jobs.register('merge', (job) => this.accounts.merge(job.target));
    this.jobs.register('archive', async (job, progress) =>
      this.store
        .lock('project:' + job.target, async () => {
          const project = job.target;
          projectPath(this.lifecycle.root, project);
          await this.store.redis.HSET(
            'project:' + project + ':status',
            'archiving',
            '1',
          );
          await progress('Waiting for project operations to finish');
          await this.documents.disconnectProject(project);
          await this.lifecycle.drain(project);
          await this.waitGit(project);
          const status = await this.store.redis.HGETALL(
            'project:' + project + ':status',
          );
          if (status.locked === '1')
            throw new AdminError(
              'AMC project is locked; resolve the running operation before archiving',
              409,
            );
          if (
            Number(status.scanned || 0) > Number(status.marked || 0) ||
            Number(status.marked || 0) > Number(status.annotated || 0)
          )
            throw new AdminError(
              'Grading or final annotations are stale; finalize the project before archiving',
              409,
            );
          const exam = await this.documents.withDocument(project, (doc) =>
            readExam(doc),
          );
          const manifest = await diskWork<ArchiveManifest>(
            {
              kind: 'prepare',
              root: this.lifecycle.root,
              project,
              exam,
              actor: job.actor,
            },
            (value) => {
              void progress(value).catch(() => {});
            },
          );
          await progress('Final archive verified; removing working data');
          await this.store.redis.HSET(
            'project:' + project + ':status',
            'archived',
            String(manifest.archivedAt),
          );
          await this.documents.clear(project);
          const sizes = await diskWork<{
            bytesBefore: number;
            bytesAfter: number;
          }>({kind: 'cleanup', root: this.lifecycle.root, project});
          await this.store.redis.DEL('project:' + project + ':gradefiles');
          await this.store.redis.DEL('exam:' + project);
          await this.store.redis.HSET('project:' + project + ':status', {
            archived: String(manifest.archivedAt),
            archiving: '0',
            locked: '0',
          });
          await this.measure(project);
          return {
            ...sizes,
            reclaimedBytes: Math.max(0, sizes.bytesBefore - sizes.bytesAfter),
          };
        })
        .catch(async (error) => {
          // Validation failures leave the original project usable for corrections.
          // Published archives remain frozen if cleanup needs to be retried.
          if (
            !(await fs.pathExists(
              projectPath(
                this.lifecycle.root,
                job.target,
                '.archive/manifest.json',
              ),
            ))
          ) {
            await fs.remove(
              projectPath(this.lifecycle.root, job.target, '.archive-staging'),
            );
            await this.store.redis.HSET(
              'project:' + job.target + ':status',
              'archiving',
              '0',
            );
          }
          throw error;
        }),
    );
  }
  async measure(project: string) {
    try {
      const row = await diskWork<DiskProject>({
        kind: 'measure',
        root: this.lifecycle.root,
        project,
      });
      await this.store.set('project:' + hash(project), row);
      if (row.archivedAt)
        await this.store.redis.HSET(
          'project:' + project + ':status',
          'archived',
          String(row.archivedAt),
        );
      await this.store.redis.SADD('amcui:admin:projects', project);
      return row;
    } catch (error) {
      const row = {
        name: project,
        bytes: null,
        students: null,
        commits: null,
        measuredAt: Date.now(),
        error: error instanceof Error ? error.message : 'Measurement failed',
      };
      await this.store.set('project:' + hash(project), row);
      await this.store.redis.SADD('amcui:admin:projects', project);
      return row;
    }
  }
  async inventory(
    project?: string,
    progress: (value: string) => Promise<void> = async () => {},
  ) {
    if (project) return this.measure(project);
    const projects = new Set<string>();
    const roles = await this.store.redis.SMEMBERS('acl_meta@roles');
    roles
      .filter((role) => role !== 'admin')
      .forEach((role) => projects.add(role));
    // SCAN yields between batches and avoids blocking Redis with KEYS.
    for await (const key of this.store.redis.scanIterator({
      MATCH: 'user:*',
      COUNT: 100,
    })) {
      if ((await this.store.redis.TYPE(key)) !== 'string') continue;
      const value = await this.store.redis.GET(key);
      try {
        const user = value && JSON.parse(value);
        if (user?.username && key === 'user:' + user.username)
          await this.store.redis.SADD('amcui:admin:users', user.username);
      } catch {
        /* Malformed legacy records remain outside the public inventory. */
      }
    }
    for await (const key of this.store.redis.scanIterator({
      MATCH: 'project:*',
      COUNT: 100,
    })) {
      const name = key.split(':')[1];
      if (name !== 'admin') projects.add(name);
    }
    for await (const key of this.store.redis.scanIterator({
      MATCH: 'exam:*',
      COUNT: 100,
    }))
      projects.add(key.slice(5));
    for (const entry of await fs.readdir(this.lifecycle.root, {
      withFileTypes: true,
    }))
      if (
        entry.isDirectory() &&
        /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,199}$/.test(entry.name) &&
        entry.name !== 'admin'
      )
        projects.add(entry.name);
    await this.store.redis.DEL('amcui:admin:projects');
    if (projects.size)
      await this.store.redis.SADD('amcui:admin:projects', [...projects]);
    let count = 0;
    for (const name of projects) {
      await progress(`Measuring ${++count}/${projects.size}: ${name}`);
      await this.measure(name);
    }
    await this.store.set('inventoryAt', Date.now());
    return {projects: projects.size};
  }
  async projectRows() {
    const names = await this.store.redis.SMEMBERS('amcui:admin:projects');
    const rows = [];
    for (const name of names) {
      const cached = await this.store.get<DiskProject>('project:' + hash(name));
      const status = await this.store.redis.HGETALL(
        'project:' + name + ':status',
      );
      const activity =
        Number(status.lastHumanActivityAt || status.lastModifiedAt || 0) ||
        null;
      rows.push({
        name,
        ...cached,
        users: await this.accounts.acl.roleUsers(name),
        status:
          status.archiving === '1'
            ? 'archiving'
            : status.archived
              ? 'archived'
              : 'active',
        lastHumanActivityAt: activity,
        inactive: activity ? Date.now() - activity > 730 * 86400_000 : false,
      });
    }
    return rows;
  }
  start() {
    this.jobs.start();
    this.accounts.mail.start();
    void this.jobs
      .enqueue('inventory', 'system', '')
      .catch(() => console.error('Initial inventory could not be queued'));
    this.daily = setInterval(() => {
      void this.jobs.enqueue('inventory', 'system', '').catch(() => {});
    }, 86400_000);
    this.daily.unref();
  }
  install(
    app: Express,
    admin: RequestHandler,
    project: RequestHandler,
    accountLimit: RequestHandler,
  ) {
    const registration = express.Router();
    registration.post(
      '/',
      accountLimit,
      asyncHandler(async (req, res) => {
        await this.accounts.register(req.body);
        res.status(202).json({
          message:
            'If this request is eligible, check your email to verify it. An administrator will then review your account.',
        });
      }),
    );
    registration.post(
      '/verify',
      asyncHandler(async (req, res) => {
        const token = z.string().parse(req.body?.token);
        await this.accounts.verify(token);
        res.json({
          message:
            'Email verified. Your account is awaiting administrator approval.',
        });
      }),
    );
    registration.post(
      '/resend',
      validateLogin,
      accountLimit,
      asyncHandler(async (req, res) => {
        await this.accounts.resend(
          req.body.username.toLowerCase(),
          req.body.password,
        );
        res
          .status(202)
          .json({message: 'If eligible, a verification email will be sent.'});
      }),
    );
    app.use('/register', registration);
    app.get('/registration/status', (_req, res) =>
      res.json({available: this.accounts.mail.configured}),
    );

    const router = express.Router();
    router.use(admin);
    const paginate = (rows: any[], query: express.Request['query']) => {
      const search = String(query.search || '').toLowerCase();
      const filtered = rows.filter(
        (row) =>
          (!query.status || row.status === query.status) &&
          (!query.inactive || query.inactive === 'false' || row.inactive) &&
          (!search ||
            String(row.name || row.username)
              .toLowerCase()
              .includes(search)),
      );
      const sort = [
        'name',
        'username',
        'bytes',
        'students',
        'commits',
        'lastHumanActivityAt',
        'status',
      ].includes(String(query.sort))
        ? String(query.sort)
        : rows[0]?.username
          ? 'username'
          : 'name';
      filtered.sort((a, b) =>
        typeof a[sort] === 'number' && typeof b[sort] === 'number'
          ? a[sort] - b[sort]
          : String(a[sort] ?? '').localeCompare(String(b[sort] ?? '')),
      );
      if (query.desc === 'true') filtered.reverse();
      const limit = Math.max(
        1,
        Math.min(100, Math.floor(Number(query.limit) || 50)),
      );
      const requestedOffset = Number(query.offset);
      const offset = Number.isFinite(requestedOffset)
        ? Math.max(0, Math.floor(requestedOffset))
        : 0;
      return {
        items: filtered.slice(offset, offset + limit),
        total: filtered.length,
      };
    };
    router.get(
      '/projects',
      asyncHandler(async (req, res) =>
        res.json(paginate(await this.projectRows(), req.query)),
      ),
    );
    router.get(
      '/users',
      asyncHandler(async (req, res) =>
        res.json(paginate(await this.accounts.list(), req.query)),
      ),
    );
    router.get(
      '/jobs',
      asyncHandler(async (_req, res) => res.json(await this.jobs.list())),
    );
    router.get(
      '/activity',
      asyncHandler(async (_req, res) => res.json(await this.store.auditList())),
    );
    router.get(
      '/metrics',
      asyncHandler(async (_req, res) => {
        const users = await this.accounts.list();
        res.json({
          ...this.metrics,
          averageLatencyMs: this.metrics.requests
            ? this.metrics.latencyMs / this.metrics.requests
            : 0,
          inventoryAt: await this.store.get('inventoryAt'),
          pendingApprovals: users.filter((user) => user.status === 'pending')
            .length,
          mail: await this.accounts.mail.status(),
        });
      }),
    );
    router.post(
      '/inventory',
      asyncHandler(async (req, res) =>
        res
          .status(202)
          .json(
            await this.jobs.enqueue(
              'inventory',
              req.user!.username,
              req.body?.project ? projectName(req.body.project) : '',
            ),
          ),
      ),
    );
    router.post(
      '/jobs/:id/retry',
      asyncHandler(async (req, res) =>
        res.status(202).json(await this.jobs.retry(req.params.id)),
      ),
    );
    router.post(
      '/user/:username/name',
      asyncHandler(async (req, res) =>
        res.json(
          await this.accounts.updateDisplayName(
            req.params.username,
            req.body?.displayName,
            req.user!.username,
          ),
        ),
      ),
    );
    router.post(
      '/user/:username/email',
      asyncHandler(async (req, res) =>
        res.json(
          await this.accounts.updateEmail(
            req.params.username,
            req.body?.email,
            req.user!.username,
          ),
        ),
      ),
    );
    router.post(
      '/user/:username/state',
      asyncHandler(async (req, res) => {
        const status = z
          .enum(['active', 'rejected', 'disabled'])
          .parse(req.body?.status);
        await this.accounts.transition(
          req.params.username,
          status,
          req.user!.username,
        );
        res.sendStatus(200);
      }),
    );
    router.post(
      '/merge/preview',
      asyncHandler(async (req, res) => {
        const input = mergeSchema.parse(req.body);
        res.json(await this.accounts.mergePreview(input.source, input.target));
      }),
    );
    router.post(
      '/merge',
      asyncHandler(async (req, res) => {
        const input = mergeSchema.parse(req.body);
        const id = await this.accounts.prepareMerge(input.source, input.target);
        res
          .status(202)
          .json(await this.jobs.enqueue('merge', req.user!.username, id));
      }),
    );
    router.post(
      '/project/:project/archive/preview',
      asyncHandler(async (req, res) => {
        const name = projectName(req.params.project);
        const cached = await this.store.get<DiskProject>(
          'project:' + hash(name),
        );
        res.json({
          project: name,
          bytes: cached?.bytes ?? null,
          folders: cached?.folders ?? {},
          measuredAt: cached?.measuredAt ?? null,
          keep: [
            'Questions and source assets',
            'Final documents and corrected papers',
            'Static grades, associations and per-question scores',
          ],
          remove: [
            'Original scans and intermediate images',
            'AMC grading databases',
            'Git history',
            'Build and preview files',
          ],
          irreversible: true,
        });
      }),
    );
    router.post(
      '/project/:project/archive',
      asyncHandler(async (req, res) =>
        res
          .status(202)
          .json(
            await this.jobs.enqueue(
              'archive',
              req.user!.username,
              projectName(req.params.project),
            ),
          ),
      ),
    );
    app.use('/admin', router);

    app.get(
      '/project/:project/archive',
      project,
      asyncHandler(async (req, res) => {
        const base = projectPath(
          this.lifecycle.root,
          req.params.project,
          '.archive',
        );
        const manifest = await fs.readJson(base + '/manifest.json');
        const results = await fs.readJson(base + '/results.json');
        const exam = await fs.readJson(base + '/exam.json');
        await this.accounts.activity(req.user!.username, 'human');
        res.json({
          manifest,
          results,
          exam,
          cleanupPending:
            (await this.store.redis.HGET(
              'project:' + req.params.project + ':status',
              'archiving',
            )) === '1',
        });
      }),
    );
    app.get(
      '/project/:project/archive/files/:id',
      project,
      asyncHandler(async (req, res) => {
        const manifest = (await fs.readJson(
          projectPath(
            this.lifecycle.root,
            req.params.project,
            '.archive/manifest.json',
          ),
        )) as ArchiveManifest;
        const file = manifest.files.find((file) => file.id === req.params.id);
        if (!file) return res.sendStatus(404);
        res.download(
          projectPath(
            this.lifecycle.root,
            req.params.project,
            '.archive',
            file.filename,
          ),
          file.filename,
        );
      }),
    );
  }
}
function projectName(value: unknown): string {
  return z
    .string()
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,199}$/)
    .parse(value);
}
