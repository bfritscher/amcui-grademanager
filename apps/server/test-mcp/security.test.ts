import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import express, {type ErrorRequestHandler} from 'express';
import request from 'supertest';
import multer from 'multer';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import {installProjectFileRoutes} from '../src/exam/fileRoutes.js';
import {saveSourceFilesSync} from '../src/exam/sourceFiles.js';
import {projectPath} from '../src/security/paths.js';
import {asyncHandler, validateLogin} from '../src/security/login.js';
import type {RenderedExam} from '../src/exam/previews.js';

let root: string;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'amcui-security-'));
  for (const project of ['allowed', 'victim']) {
    await fs.ensureDir(path.join(root, project, 'src', 'graphics'));
    await fs.ensureDir(path.join(root, project, 'src', 'codes'));
    await fs.ensureDir(path.join(root, project, 'out'));
    await fs.writeFile(
      path.join(root, project, 'source.tex'),
      'confidential exam',
    );
    await fs.writeFile(
      path.join(root, project, 'src', 'graphics', 'exam.pdf'),
      'private graphic',
    );
  }
});
afterEach(async () => {
  await fs.remove(root);
});
const errors: ErrorRequestHandler = (error, _req, res, _next) => {
  res.status(error.status || 500).end();
};
function filesApp() {
  const app = express();
  app.use(express.json());
  installProjectFileRoutes(
    app,
    root,
    path.join(root, 'missing.jpg'),
    (req, res, next) => {
      if (req.params.project !== 'allowed') res.sendStatus(403);
      else next();
    },
    multer({dest: path.join(root, 'uploads')}).single('file'),
    async () => {},
    async () => Buffer.from('%PDF converted'),
  );
  app.use(errors);
  return app;
}

it.each([
  '../../../victim/source',
  '..\\..\\..\\victim\\source',
  '/victim/source',
  'C:\\victim\\source',
  '..',
  '',
])('rejects cross-project graphic writes and deletes for ID %j', async (id) => {
  const app = filesApp();
  await request(app)
    .post('/project/allowed/upload/graphics')
    .field('id', id)
    .attach('file', Buffer.from('malicious'), 'exam.pdf')
    .expect(400);
  await request(app)
    .post('/project/allowed/graphics/delete')
    .send({id, filename: 'exam.pdf'})
    .expect(400);
  expect(
    await fs.readFile(path.join(root, 'victim', 'source.tex'), 'utf8'),
  ).toBe('confidential exam');
  expect(
    await fs.readFile(
      path.join(root, 'victim', 'src', 'graphics', 'exam.pdf'),
      'utf8',
    ),
  ).toBe('private graphic');
  expect(await fs.readdir(path.join(root, 'uploads'))).toEqual([]);
});

it('rejects traversal through filename extensions and encoded static paths', async () => {
  const app = filesApp();
  await request(app)
    .post('/project/allowed/graphics/delete')
    .send({id: 'exam', filename: 'exam.pdf/../../../victim/source.tex'})
    .expect(400);
  await request(app)
    .get('/project/allowed/static/%2e%2e%2fvictim%2fsource.tex')
    .expect(400);
  await request(app)
    .get('/project/allowed/static/..%5cvictim%5csource.tex')
    .expect(400);
  await request(app)
    .get('/project/allowed/static/C%3a%5cvictim%5csource.tex')
    .expect(400);
});

it('preserves authorized upload, static access and deletion while denying other projects', async () => {
  const app = filesApp();
  await request(app).get('/project/victim/static/source.tex').expect(403);
  await request(app)
    .post('/project/allowed/upload/graphics')
    .field('id', 'new')
    .attach('file', Buffer.from('new graphic'), 'exam.pdf')
    .expect(200);
  expect(
    (
      await request(app)
        .get('/project/allowed/static/src/graphics/new.pdf')
        .expect(200)
    ).body.toString(),
  ).toBe('new graphic');
  await request(app)
    .post('/project/allowed/graphics/delete')
    .send({id: 'new', filename: 'exam.pdf'})
    .expect(200);
  expect(
    await fs.pathExists(
      path.join(root, 'allowed', 'src', 'graphics', 'new.pdf'),
    ),
  ).toBe(false);
});

it('rejects directory junctions and symlinks for reads, writes and deletes', async () => {
  await fs.symlink(
    path.join(root, 'victim', 'src', 'graphics'),
    path.join(root, 'allowed', 'linked'),
    'junction',
  );
  expect(() => projectPath(root, 'allowed', 'linked/exam.pdf')).toThrow(
    'Invalid project file path',
  );
  await request(filesApp())
    .get('/project/allowed/static/linked/exam.pdf')
    .expect(400);
  await fs.rename(
    path.join(root, 'allowed', 'src', 'graphics'),
    path.join(root, 'allowed', 'graphics-original'),
  );
  await fs.symlink(
    path.join(root, 'victim', 'src', 'graphics'),
    path.join(root, 'allowed', 'src', 'graphics'),
    'junction',
  );
  await request(filesApp())
    .post('/project/allowed/upload/graphics')
    .field('id', 'exam')
    .attach('file', Buffer.from('overwrite'), 'exam.pdf')
    .expect(400);
  await request(filesApp())
    .post('/project/allowed/graphics/delete')
    .send({id: 'exam', filename: 'exam.pdf'})
    .expect(400);
  expect(
    await fs.readFile(
      path.join(root, 'victim', 'src', 'graphics', 'exam.pdf'),
      'utf8',
    ),
  ).toBe('private graphic');
});

it('rejects malicious code IDs before changing any source or removing output', async () => {
  const out = path.join(root, 'allowed', 'out', 'previous.pdf');
  await fs.writeFile(out, 'previous output');
  const body = {
    json: '{}',
    source: 'changed',
    questions_definition: '',
    questions_layout: '',
    codes: {'../../../victim/source.tex': {content: 'overwrite'}},
  } as RenderedExam;
  expect(() => saveSourceFilesSync(root, 'allowed', body)).toThrow(
    'Invalid project file path',
  );
  expect(await fs.readFile(out, 'utf8')).toBe('previous output');
  expect(
    await fs.readFile(path.join(root, 'allowed', 'source.tex'), 'utf8'),
  ).toBe('confidential exam');
  expect(
    await fs.readFile(path.join(root, 'victim', 'source.tex'), 'utf8'),
  ).toBe('confidential exam');
});

it.each([
  undefined,
  {},
  {username: 42, password: 'pass'},
  {username: {}, password: 'pass'},
  {username: 'Alice'},
  {username: 'Alice', password: []},
  {username: '', password: 'pass'},
  {username: 'Alice', password: 'pass', authenticator: {type: 'fido2'}},
  {
    username: 'Alice',
    password: 'pass',
    authenticator: {type: 'authenticator', token: {}},
  },
])(
  'rejects malformed login %j before invoking authentication',
  async (body) => {
    const authenticate = vi.fn((_req, res) => {
      res.sendStatus(200);
    });
    const app = express();
    app.use(express.json());
    app.post('/login', validateLogin, asyncHandler(authenticate));
    app.use(errors);
    const response = request(app).post('/login');
    if (body !== undefined) response.send(body);
    await response.expect(400);
    expect(authenticate).not.toHaveBeenCalled();
    await request(app)
      .post('/login')
      .send({username: 'Alice', password: 'password'})
      .expect(200);
  },
);

it('forwards asynchronous authentication failures to Express without an unhandled rejection', async () => {
  const app = express();
  app.use(express.json());
  app.post(
    '/login',
    validateLogin,
    asyncHandler(async () => {
      throw new Error('storage unavailable');
    }),
  );
  app.use(errors);
  await request(app)
    .post('/login')
    .send({username: 'Alice', password: 'password'})
    .expect(500);
});
