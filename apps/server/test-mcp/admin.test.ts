import {
  beforeAll,
  beforeEach,
  afterAll,
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {createClient, type RedisClientType} from 'redis';
import {createHash} from 'node:crypto';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {PDFDocument} from 'pdf-lib';
import bcrypt from 'bcrypt';
import nodemailer from 'nodemailer';
import express from 'express';
import request from 'supertest';
import * as Y from 'yjs';
import {createSection, putEntity, readExam} from '@amcui/exam-core';
import {AdminStore, AdminError} from '../src/admin/store.js';
import {AdminMail} from '../src/admin/mail.js';
import {AdminAccounts, registrationSchema} from '../src/admin/accounts.js';
import {AdminJobs} from '../src/admin/jobs.js';
import {ProjectLifecycle} from '../src/admin/lifecycle.js';
import {
  makeResults,
  prepareArchive,
  cleanupArchive,
  verifyArchive,
  measureProject,
} from '../src/admin/disk.js';

const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) await fs.remove(root);
});
async function temporary() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'amcui-admin-'));
  roots.push(root);
  return root;
}
const score = {
  student: 1,
  copy: 0,
  question: 1,
  score: 8,
  max: 10,
  title: 'Q1',
  id: '123',
  why: '',
};
const options = {
  note_min: '1',
  note_max: '6',
  note_grain: '0.1',
  points_max: '10',
  final_grade_formula: 'row.Grade',
};
const csv = 'id,name,Total,Grade,FinalGrade\n123,Alice,8,5,5\n';

it('snapshots displayed grades, imported values, question scores and unmatched copies without evaluation on read', () => {
  const result = makeResults(
    csv.replace('FinalGrade', 'Bonus,FinalGrade').replace('8,5,5', '8,5,1,6'),
    [score, {...score, student: 2, copy: 1, id: null}],
    [],
    {...options, final_grade_formula: 'row.Grade + row.Bonus'},
  );
  expect(result.rows[0]).toMatchObject({
    id: '123',
    Total: 8,
    Grade: 5,
    FinalGrade: 6,
    Bonus: 1,
    questions: {Q1: 8},
  });
  expect(result.rows[1]).toMatchObject({
    _copy: '2:1',
    _unmatched: true,
    Total: 8,
  });
  expect(JSON.parse(JSON.stringify(result))).toEqual(result);
});
it.each([
  ['stale grade', csv.replace('8,5,5', '8,4,4'), [score], options],
  [
    'unsafe formula',
    csv,
    [score],
    {...options, final_grade_formula: 'globalThis.process.exit()'},
  ],
  ['duplicate identifiers', csv + '123,Bob,8,5,5\n', [score], options],
  ['two copies for one student', csv, [score, {...score, copy: 1}], options],
  ['missing score', csv, [], options],
])('rejects %s before archival deletion', (_name, input, scores, settings) => {
  expect(() =>
    makeResults(
      input as string,
      scores as any[],
      [],
      settings as typeof options,
    ),
  ).toThrow();
});
it('validates registration password byte length and normalizes identity fields', () => {
  expect(
    registrationSchema.parse({
      username: 'Alice',
      email: 'Alice@Example.org',
      displayName: ' Alice ',
      password: 'long-password-123',
    }),
  ).toMatchObject({
    username: 'alice',
    email: 'alice@example.org',
    displayName: 'Alice',
  });
  expect(
    registrationSchema.safeParse({
      username: 'alice',
      email: 'a@example.org',
      displayName: 'Alice',
      password: 'é'.repeat(40),
    }).success,
  ).toBe(false);
});
it('preserves leading zero student identifiers in the snapshot', () => {
  expect(
    makeResults(
      csv.replace('123', '00123'),
      [{...score, id: '00123'}],
      [],
      options,
    ).rows[0].id,
  ).toBe('00123');
});

async function archiveFixture() {
  const root = await temporary();
  const folder = path.join(root, 'exam');
  for (const name of [
    'data',
    'scans',
    'out',
    'cr/corrections/pdf',
    'src/graphics',
    '.git',
  ])
    await fs.ensureDir(path.join(folder, name));
  await fs.writeFile(path.join(folder, 'students.csv'), csv);
  await fs.writeFile(
    path.join(folder, 'options.xml'),
    '<project><doc_question>sujet.pdf</doc_question>' +
      Object.entries(options)
        .map(([key, value]) => `<${key}>${value}</${key}>`)
        .join('') +
      '</project>',
  );
  const schemas: Record<string, string> = {
    capture:
      'CREATE TABLE capture_page(student INTEGER,page INTEGER,copy INTEGER,src TEXT,timestamp_auto INTEGER,timestamp_manual INTEGER,timestamp_annotate INTEGER); INSERT INTO capture_page VALUES(1,1,0,"%PROJET/scans/a.png",10,10,20); CREATE TABLE capture_failed(filename TEXT); CREATE TABLE capture_zone(imagedata BLOB); INSERT INTO capture_zone VALUES(zeroblob(2000000));',
    scoring:
      'CREATE TABLE scoring_score(student INTEGER,copy INTEGER,question INTEGER,score REAL,max REAL,why TEXT); INSERT INTO scoring_score VALUES(1,0,1,8,10,""); CREATE TABLE scoring_title(question INTEGER,title TEXT); INSERT INTO scoring_title VALUES(1,"Q1"); CREATE TABLE scoring_question(student INTEGER,question INTEGER,indicative INTEGER); INSERT INTO scoring_question VALUES(1,1,0);',
    association:
      'CREATE TABLE association_association(student INTEGER,copy INTEGER,manual TEXT,auto TEXT); INSERT INTO association_association VALUES(1,0,NULL,"123");',
    layout: 'CREATE TABLE layout_page(student INTEGER);',
    report:
      'CREATE TABLE report_student(student INTEGER,copy INTEGER,file TEXT,type INTEGER); INSERT INTO report_student VALUES(1,0,"alice.pdf",1); CREATE TABLE report_directory(type INTEGER,directory TEXT); INSERT INTO report_directory VALUES(1,"cr/corrections/pdf");',
  };
  for (const [name, sql] of Object.entries(schemas)) {
    const db = new DatabaseSync(path.join(folder, 'data', name + '.sqlite'), {
      enableDoubleQuotedStringLiterals: true,
    });
    db.exec(sql);
    db.close();
  }
  const pdf = await PDFDocument.create();
  pdf.addPage();
  await fs.writeFile(path.join(folder, 'out/sujet.pdf'), await pdf.save());
  await fs.writeFile(
    path.join(folder, 'cr/corrections/pdf/alice.pdf'),
    await pdf.save(),
  );
  await fs.writeFile(path.join(folder, 'scans/a.png'), 'source scan');
  await fs.writeFile(path.join(folder, '.git/history'), 'old versions');
  await fs.writeFile(path.join(folder, 'src/graphics/retained.png'), 'asset');
  await fs.writeFile(
    path.join(folder, 'custom-source.sty'),
    'keep unknown source',
  );
  const doc = new Y.Doc();
  putEntity(doc, 'sections', createSection());
  const exam = readExam(doc);
  doc.destroy();
  return {root, folder, exam};
}
it('publishes independently readable PDFs and grades before deleting scans, Git and BLOB-bearing databases', async () => {
  const {root, folder, exam} = await archiveFixture();
  const manifest = await prepareArchive(root, 'exam', exam, 'admin');
  expect(manifest.copies).toEqual([
    {student: 1, copy: 0, firstPage: 1, pages: 1, id: '123'},
  ]);
  expect(await fs.pathExists(path.join(folder, 'data/capture.sqlite'))).toBe(
    true,
  );
  const result = await cleanupArchive(root, 'exam');
  expect(result.bytesBefore - result.bytesAfter).toBeGreaterThan(1_000_000);
  for (const name of ['data', 'scans', 'cr', '.git', 'out'])
    expect(await fs.pathExists(path.join(folder, name))).toBe(false);
  expect(
    await fs.pathExists(path.join(folder, 'src/graphics/retained.png')),
  ).toBe(true);
  expect(await fs.pathExists(path.join(folder, 'custom-source.sty'))).toBe(
    true,
  );
  expect(
    (await fs.readJson(path.join(folder, '.archive/results.json'))).rows[0]
      .FinalGrade,
  ).toBe(5);
  expect(await verifyArchive(root, 'exam')).toEqual(manifest);
  expect((await measureProject(root, 'exam')).students).toBe(1);
  await cleanupArchive(root, 'exam'); // Restart after partial cleanup is safe.
});
it('leaves source scans and databases intact when final PDFs are incomplete', async () => {
  const {root, folder, exam} = await archiveFixture();
  const pdf = await PDFDocument.create();
  pdf.addPage();
  pdf.addPage();
  await fs.writeFile(
    path.join(folder, 'cr/corrections/pdf/alice.pdf'),
    await pdf.save(),
  );
  await expect(prepareArchive(root, 'exam', exam, 'admin')).rejects.toThrow(
    'every captured page',
  );
  expect(await fs.pathExists(path.join(folder, 'scans/a.png'))).toBe(true);
  expect(await fs.pathExists(path.join(folder, 'data/capture.sqlite'))).toBe(
    true,
  );
  expect(await fs.pathExists(path.join(folder, '.archive/manifest.json'))).toBe(
    false,
  );
});
it('does not delete source files after archive corruption', async () => {
  const {root, folder, exam} = await archiveFixture();
  await prepareArchive(root, 'exam', exam, 'admin');
  await fs.appendFile(path.join(folder, '.archive/results.json'), 'corruption');
  await expect(cleanupArchive(root, 'exam')).rejects.toThrow('checksum');
  expect(await fs.pathExists(path.join(folder, 'scans/a.png'))).toBe(true);
});
it('blocks deletion when unprocessed scans or captured copies without scores need review', async () => {
  const {root, folder, exam} = await archiveFixture();
  await fs.writeFile(path.join(folder, 'scans/orphan.pdf'), 'unprocessed');
  await expect(prepareArchive(root, 'exam', exam, 'admin')).rejects.toThrow(
    'unreferenced scan',
  );
  expect(await fs.pathExists(path.join(folder, 'data/capture.sqlite'))).toBe(
    true,
  );
  await fs.remove(path.join(folder, 'scans/orphan.pdf'));
  const db = new DatabaseSync(path.join(folder, 'data/capture.sqlite'));
  db.exec(
    "INSERT INTO capture_page VALUES(2,1,0,'%PROJET/scans/a.png',10,10,20)",
  );
  db.close();
  await expect(prepareArchive(root, 'exam', exam, 'admin')).rejects.toThrow(
    'scored copies do not match',
  );
});
it('counts quoted multiline CSV rows correctly during disk inventory', async () => {
  const root = await temporary();
  await fs.ensureDir(path.join(root, 'exam'));
  await fs.writeFile(
    path.join(root, 'exam/students.csv'),
    'id,name\n1,"Alice\nExample"\n2,Bob\n',
  );
  expect((await measureProject(root, 'exam')).students).toBe(2);
});
it('retains disk measurements when a legacy Git folder has no usable history', async () => {
  const {root} = await archiveFixture();
  const row = await measureProject(root, 'exam');
  expect(row.bytes).toBeGreaterThan(2000000);
  expect(row.students).toBe(1);
  expect(row.commits).toBeNull();
  expect(row.error).toContain('Git history unavailable');
});

describe.runIf(!!process.env.AMCUI_TEST_REDIS_URL)(
  'persistent account and job integration',
  () => {
    let redis: RedisClientType;
    let store: AdminStore;
    let accounts: AdminAccounts;
    let mail: AdminMail;
    let roles: Map<string, Set<string>>;
    beforeAll(async () => {
      const url = new URL(process.env.AMCUI_TEST_REDIS_URL!);
      url.pathname = '/1';
      redis = (await createClient({
        url: url.toString(),
      }).connect()) as RedisClientType;
    });
    afterAll(async () => {
      await redis.quit();
    });
    beforeEach(async () => {
      await redis.FLUSHDB();
      store = new AdminStore(redis);
      roles = new Map();
      mail = new AdminMail(store, {
        AMCUI_SMTP_HOST: 'localhost',
        AMCUI_MAIL_FROM: 'admin@example.org',
        AMCUI_WEB_URL: 'https://example.org',
        AMCUI_ADMIN_EMAILS: 'admin@example.org',
      });
      accounts = new AdminAccounts(store, mail, {
        userRoles: async (username) => [...(roles.get(username) || [])],
        roleUsers: async (role) =>
          [...roles]
            .filter(([, value]) => value.has(role))
            .map(([name]) => name),
        addUserRoles: async (username, added) => {
          const target = roles.get(username) || new Set();
          for (const role of typeof added === 'string' ? [added] : added)
            target.add(role);
          roles.set(username, target);
        },
        removeUserRoles: async (username, role) => {
          roles.get(username)?.delete(role);
        },
      });
    });
    const seed = async (username: string, memberships: string[] = []) => {
      await redis.SET(
        'user:' + username,
        JSON.stringify({
          username,
          password: await bcrypt.hash('long-password-123', 4),
          authenticators: [
            {label: 'existing', type: 'authenticator', secret: 'private'},
          ],
        }),
      );
      await redis.SADD('amcui:admin:users', username);
      roles.set(username, new Set(memberships));
    };
    const register = () =>
      accounts.register({
        username: 'Alice',
        email: 'alice@example.org',
        displayName: 'Alice',
        password: 'long-password-123',
      });
    async function token() {
      const ids = await redis.ZRANGE('amcui:admin:mailqueue', 0, -1);
      const message = await store.get<any>('mail:' + ids[0]);
      return new URL(
        message.text.match(/https:\/\/[^\s]+/)[0],
      ).searchParams.get('verify')!;
    }
    it('requires verification and approval, keeps existing accounts active, and never overwrites duplicate credentials', async () => {
      await seed('admin', ['admin']);
      expect(await accounts.active('admin', 0)).toBe(true);
      await register();
      const before = await redis.GET('user:alice');
      expect(await accounts.active('alice')).toBe(false);
      await register();
      expect(await redis.GET('user:alice')).toBe(before);
      const verification = await token();
      await accounts.verify(verification);
      await expect(accounts.verify(verification)).rejects.toThrow(
        'Invalid or expired',
      );
      expect((await accounts.meta('alice')).status).toBe('pending');
      await accounts.transition('alice', 'active', 'admin');
      expect(await accounts.active('alice', 1)).toBe(true);
      expect(await accounts.active('alice', 0)).toBe(false);
    });
    it('rejects expired verification and rotates resend links', async () => {
      await register();
      const first = await token();
      await accounts.resend('alice', 'long-password-123');
      await expect(accounts.verify(first)).rejects.toThrow();
      const meta = await accounts.meta('alice');
      await redis.DEL('amcui:admin:verify:' + meta.verificationHash);
      expect(meta.status).toBe('unverified');
    });
    it('revokes sessions and grants on disabling, and protects the last administrator', async () => {
      await seed('admin', ['admin']);
      await seed('alice', ['exam']);
      accounts.revokeGrants = vi.fn(async () => {});
      accounts.disconnect = vi.fn(async () => {});
      await expect(
        accounts.transition('admin', 'disabled', 'admin'),
      ).rejects.toThrow('last active administrator');
      await accounts.transition('alice', 'disabled', 'admin');
      expect(await accounts.active('alice', 0)).toBe(false);
      expect(accounts.revokeGrants).toHaveBeenCalledWith('alice');
      expect(accounts.disconnect).toHaveBeenCalledWith('alice');
    });
    it('merges memberships and activity, preserves target credentials, and resumes after a membership failure', async () => {
      await seed('admin', ['admin']);
      await seed('old', ['a', 'b']);
      await seed('current', ['b', 'c']);
      const credentials = await redis.GET('user:current');
      await accounts.activity('old', 'human');
      await redis.ZADD('user:old:recent', {score: 10, value: 'a'});
      const id = await accounts.prepareMerge('old', 'current');
      const original = accounts.acl.removeUserRoles;
      let failed = false;
      accounts.acl.removeUserRoles = async (name, role) => {
        if (!failed) {
          failed = true;
          throw new Error('Temporary failure');
        }
        return original(name, role);
      };
      await expect(accounts.merge(id)).rejects.toThrow('Temporary failure');
      expect(await accounts.active('old')).toBe(false);
      expect(await accounts.active('current')).toBe(false);
      await accounts.merge(id);
      await accounts.merge(id);
      expect(await accounts.acl.userRoles('current')).toEqual(['b', 'c', 'a']);
      expect(await accounts.acl.userRoles('old')).toEqual([]);
      expect((await accounts.meta('old')).mergedInto).toBe('current');
      expect(await accounts.active('current', 0)).toBe(false);
      expect(await accounts.active('current', 1)).toBe(true);
      expect(await redis.GET('user:current')).toBe(credentials);
      expect(await redis.ZSCORE('user:current:recent', 'a')).toBe(10);
    });
    it('records unknown historical activity instead of flagging an unused account', async () => {
      await seed('legacy');
      const [row] = await accounts.list();
      expect(row.lastHumanActivityAt).toBeNull();
      expect(row.inactive).toBe(false);
    });
    it('resumes merge finalization after source retirement without overwriting newer survivor credentials', async () => {
      await seed('old', ['a']);
      await seed('current', ['b']);
      const id = await accounts.prepareMerge('old', 'current');
      const original = store.set.bind(store);
      let fail = true;
      vi.spyOn(store, 'set').mockImplementation(async (key, value: any) => {
        if (
          fail &&
          value?.username === 'current' &&
          value.status === 'active'
        ) {
          fail = false;
          throw new Error('Interrupted finalization');
        }
        return original(key, value);
      });
      await expect(accounts.merge(id)).rejects.toThrow(
        'Interrupted finalization',
      );
      expect((await accounts.meta('old')).status).toBe('merged');
      expect((await accounts.meta('current')).status).toBe('merging');
      const update = vi.fn(async () => {});
      await expect(
        accounts.updateCredentials('current', 'admin', 'reset', update),
      ).rejects.toThrow('merged');
      expect(update).not.toHaveBeenCalled();
      await accounts.merge(id);
      expect(await accounts.active('current', 1)).toBe(true);
    });
    it('keeps a partially emailed registration non-active', async () => {
      vi.spyOn(mail, 'enqueue').mockRejectedValueOnce(
        new Error('Queue temporarily unavailable'),
      );
      await expect(register()).rejects.toThrow('Queue temporarily unavailable');
      expect((await accounts.meta('alice')).status).toBe('unverified');
      expect(await accounts.active('alice')).toBe(false);
    });
    it('persists failed jobs and resumes queued work after worker replacement', async () => {
      const first = new AdminJobs(store);
      first.register('example', async () => {
        throw new Error('Temporary failure');
      });
      const job = await first.enqueue('example', 'admin', 'exam');
      await first.tick();
      expect((await first.list())[0].state).toBe('failed');
      const next = new AdminJobs(store);
      next.register('example', async (_job, progress) => {
        await progress('Working');
        return {saved: true};
      });
      await next.retry(job.id);
      await next.tick();
      expect((await next.list())[0]).toMatchObject({
        state: 'completed',
        result: {saved: true},
      });
    });
    it('blocks archived mutation and GET regeneration routes while permitting static reads and copying out', async () => {
      const root = await temporary();
      const lifecycle = new ProjectLifecycle(store, root);
      await redis.HSET('project:old:status', 'archived', '123');
      const app = express();
      app.use(express.json());
      app.use('/project/:project', lifecycle.middleware);
      app.all('/project/:project/*', (_req, res) => res.sendStatus(200));
      app.use((error: AdminError, _req: any, res: any, _next: any) =>
        res.status(error.status || 500).json({error: error.message}),
      );
      for (const endpoint of [
        'scores',
        'mark',
        'ods',
        'merged/all',
        'graphics/sync',
      ])
        expect(
          (await request(app).get('/project/old/' + endpoint)).status,
        ).toBe(409);
      expect(
        (await request(app).post('/project/old/print').send({})).status,
      ).toBe(409);
      expect((await request(app).get('/project/old/archive')).status).toBe(200);
      expect(
        (
          await request(app)
            .post('/project/old/copy/content')
            .send({destinationProjectId: 'active'})
        ).status,
      ).toBe(200);
      expect(
        (
          await request(app)
            .post('/project/active/copy/content')
            .send({destinationProjectId: 'old'})
        ).status,
      ).toBe(409);
      await expect(
        lifecycle.operation(['old'], true, async () => {}),
      ).rejects.toThrow('archived');
    });
    it('does not rerun completed work after an audit failure', async () => {
      const jobs = new AdminJobs(store);
      const run = vi.fn(async () => ({saved: true}));
      jobs.register('example', run);
      const job = await jobs.enqueue('example', 'admin', 'exam');
      vi.spyOn(store, 'audit').mockRejectedValueOnce(
        new Error('Audit temporarily unavailable'),
      );
      await expect(jobs.tick()).rejects.toThrow(
        'Audit temporarily unavailable',
      );
      await jobs.tick();
      expect(run).toHaveBeenCalledTimes(1);
      expect((await jobs.list())[0].state).toBe('completed');
      expect(await redis.ZSCORE('amcui:admin:jobqueue', job.id)).toBeNull();
    });
    it('holds archiving until in-flight work drains', async () => {
      const lifecycle = new ProjectLifecycle(store, await temporary());
      const release = lifecycle.begin('exam');
      let drained = false;
      const waiting = lifecycle.drain('exam').then(() => {
        drained = true;
      });
      await new Promise((resolve) => setTimeout(resolve, 25));
      expect(drained).toBe(false);
      release();
      await waiting;
      expect(drained).toBe(true);
    });
    it('permits reading a published archive during cleanup retry and blocks writes', async () => {
      const root = await temporary();
      await fs.ensureDir(path.join(root, 'exam/.archive'));
      await fs.writeJson(path.join(root, 'exam/.archive/manifest.json'), {});
      await redis.HSET('project:exam:status', 'archiving', '1');
      const lifecycle = new ProjectLifecycle(store, root);
      const app = express();
      app.use(express.json());
      app.use('/project/:project', lifecycle.middleware);
      app.all('/project/:project/*', (_req, res) => res.sendStatus(200));
      app.use((error: AdminError, _req: any, res: any, _next: any) =>
        res.status(error.status || 500).end(),
      );
      expect((await request(app).get('/project/exam/archive')).status).toBe(
        200,
      );
      expect(
        (
          await request(app)
            .post('/project/exam/copy/project')
            .send({project: 'copy'})
        ).status,
      ).toBe(409);
      expect(
        (await request(app).get('/project/exam/static/data/capture.sqlite'))
          .status,
      ).toBe(409);
    });
    it('retries failed email without exposing verification links in operational status', async () => {
      const sendMail = vi
        .fn()
        .mockRejectedValueOnce(new Error('SMTP failed'))
        .mockResolvedValue({});
      vi.spyOn(nodemailer, 'createTransport').mockReturnValue({
        sendMail,
      } as any);
      const queue = new AdminMail(store, {
        AMCUI_SMTP_HOST: 'localhost',
        AMCUI_MAIL_FROM: 'admin@example.org',
        AMCUI_WEB_URL: 'https://example.org',
      });
      await queue.enqueue(
        'alice@example.org',
        'Verify',
        'secret-verification-link',
        'dedupe',
      );
      await queue.tick();
      expect((await queue.status()).failures).toHaveLength(1);
      expect(JSON.stringify(await queue.status())).not.toContain('secret');
      const [id] = await redis.ZRANGE('amcui:admin:mailqueue', 0, -1);
      await redis.ZADD('amcui:admin:mailqueue', {
        score: Date.now() - 1,
        value: id,
      });
      await queue.tick();
      expect((await queue.status()).pending).toBe(0);
      expect(await store.get('mail:' + id)).toMatchObject({
        sentAt: expect.any(Number),
      });
    });
    it('does not include password or authenticator secrets in user inventory', async () => {
      await seed('alice');
      const text = JSON.stringify(await accounts.list());
      expect(text).not.toContain('private');
      expect(text).not.toContain('password');
      const key =
        'account:' + createHash('sha256').update('alice').digest('hex');
      await store.set(key, {
        username: 'alice',
        status: 'active',
        sessionVersion: 0,
        verificationHash: 'private-token',
      });
      expect(JSON.stringify(await accounts.list())).not.toContain(
        'private-token',
      );
    });
  },
);
