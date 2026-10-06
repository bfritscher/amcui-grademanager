import {afterEach, describe, expect, it, vi} from 'vitest';
import express, {type Response} from 'express';
import request from 'supertest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {
  ProjectCreator,
  projectCreationHandler,
  projectCopyHandler,
} from '../src/projectCreation.js';
import {applyChanges, readExam} from '@amcui/exam-core';
import {ExamOAuth} from '../src/mcp/oauth.js';
import {installMcp, type McpDependencies} from '../src/mcp/routes.js';
import {ExamDocuments} from '../src/exam/documents.js';
import {MemoryOAuth, MemoryPersistence} from './helpers.js';

const resource = 'http://localhost/api/mcp';
const client = {
  client_id: 'editor',
  client_name: 'Editor',
  redirect_uris: ['http://127.0.0.1/callback'],
  token_endpoint_auth_method: 'none' as const,
};
const assets = fileURLToPath(new URL('../src/assets/', import.meta.url));
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});

async function fixture(
  scopes = ['exam:read', 'exam:write'],
  selected = ['existing'],
) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'amcui-create-'));
  cleanup.push(() => fs.remove(root));
  const available = new Set(selected);
  const store = new MemoryOAuth();
  const oauth = new ExamOAuth(
    store,
    resource,
    'http://localhost/site/',
    async () => [...available],
    [client],
  );
  const documents = new ExamDocuments(
    new MemoryPersistence(),
    async () => null,
  );
  cleanup.push(() => documents.close());
  const addAccess = vi.fn(async (project: string, username: string) => {
    expect(username).toBe('teacher');
    expect(await fs.pathExists(path.join(root, project, 'options.xml'))).toBe(
      true,
    );
    available.add(project);
  });
  const creator = new ProjectCreator(root, assets, addAccess);
  const createProject = vi.fn((name: string, username: string) =>
    creator.create(name, username),
  );
  const audit = vi.fn(async () => {});
  const deps = {
    oauth,
    documents,
    createProject,
    audit,
    projects: async () => [...available],
    allowed: async (username: string, project: string) =>
      username === 'teacher' && available.has(project),
    publicApiUrl: 'http://localhost/api',
    webUrl: 'http://localhost/site/',
    secure: (req, res, next) => {
      if (req.headers.authorization !== 'Bearer browser')
        return void res.sendStatus(401);
      req.user = {username: 'teacher'} as typeof req.user;
      next();
    },
  } as McpDependencies;
  const app = express();
  app.use(express.json());
  installMcp(app, deps);
  app.post('/project/create', deps.secure, projectCreationHandler(creator));
  app.post(
    '/project/:project/copy/project',
    deps.secure,
    projectCopyHandler(creator, documents),
  );
  app.use(
    (
      error: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => res.status(500).json({error: error.message}),
  );

  async function connect(connectionScopes = scopes, projects = selected) {
    const verifier = 'a'.repeat(50);
    let url = '';
    await oauth.authorize(
      client,
      {
        redirectUri: client.redirect_uris[0],
        codeChallenge: createHash('sha256')
          .update(verifier)
          .digest('base64url'),
        scopes: connectionScopes,
        resource: new URL(resource),
      },
      {
        redirect: (value: string) => {
          url = value;
        },
      } as Response,
    );
    const ticket = new URL(url).searchParams.get('request')!;
    const response = await request(app)
      .post(`/profile/mcp/authorize/${ticket}`)
      .set('Authorization', 'Bearer browser')
      .send({projects, allow: true});
    expect(response.status).toBe(200);
    const code = new URL(response.body.redirect).searchParams.get('code')!;
    const tokens = await oauth.exchangeAuthorizationCode(
      client,
      code,
      verifier,
      client.redirect_uris[0],
      new URL(resource),
    );
    const auth = await oauth.verifyAccessToken(tokens.access_token);
    return {tokens, grantId: String(auth.extra?.grantId)};
  }
  const connection = await connect();
  const call = async (
    name: string,
    args: Record<string, unknown> = {},
    token = connection.tokens.access_token,
  ) => {
    const response = await request(app)
      .post('/mcp')
      .set('Authorization', `Bearer ${token}`)
      .set('Accept', 'application/json, text/event-stream')
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {name, arguments: args},
      });
    return response.body.result || {isError: true, ...response.body.error};
  };
  return {
    ...connection,
    root,
    store,
    oauth,
    documents,
    available,
    creator,
    createProject,
    addAccess,
    audit,
    deps,
    app,
    connect,
    call,
  };
}

describe('MCP project creation', () => {
  it('connects without projects and creates, reads and edits using the same bearer token', async () => {
    const f = await fixture(undefined, []);
    expect((await f.call('projects_list')).structuredContent.projects).toEqual(
      [],
    );
    const created = await f.call('projects_create', {name: 'Épreuve de maths'});
    expect(created.isError).not.toBe(true);
    expect(created.structuredContent).toEqual({
      projectId: 'epreuve-de-maths',
      url: 'http://localhost/site/epreuve-de-maths/edit',
      accessGranted: true,
    });
    expect((await f.call('projects_list')).structuredContent.projects).toEqual([
      'epreuve-de-maths',
    ]);
    const exam = (await f.call('exam_get', {projectId: 'epreuve-de-maths'}))
      .structuredContent;
    expect(exam.sections).toHaveLength(1);
    const edited = await f.call('exam_apply_changes', {
      projectId: 'epreuve-de-maths',
      requestId: 'first-edit',
      operations: [
        {
          op: 'question.create',
          sectionId: exam.sections[0].id,
          fields: {content: '<p>First question</p>'},
        },
      ],
    });
    expect(edited.isError).not.toBe(true);
    expect(
      (await f.call('exam_get', {projectId: 'epreuve-de-maths'}))
        .structuredContent.sections[0].questions,
    ).toHaveLength(1);
    expect(f.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        project: 'epreuve-de-maths',
        tool: 'projects_create',
        result: 'success',
      }),
    );
  });

  it('preserves selections and grant expiry and isolates other connections', async () => {
    const f = await fixture();
    const other = await f.connect();
    const before = (await f.oauth.grants('teacher')).find(
      (g) => g.id === f.grantId,
    )!;
    const key = `mcp:oauth:grant:${f.grantId}`;
    const expires = f.store.values.get(key)!.expires;
    expect(
      (await f.call('projects_create', {name: 'New exam'})).isError,
    ).not.toBe(true);
    const after = (await f.oauth.grants('teacher')).find(
      (g) => g.id === f.grantId,
    )!;
    expect(after).toEqual({...before, projects: ['existing', 'new-exam']});
    expect(f.store.values.get(key)!.expires).toBe(expires);
    expect(
      (await f.call('projects_list', {}, other.tokens.access_token))
        .structuredContent.projects,
    ).toEqual(['existing']);
    expect(
      (
        await f.call(
          'exam_get',
          {projectId: 'new-exam'},
          other.tokens.access_token,
        )
      ).isError,
    ).toBe(true);
    expect(
      (await f.oauth.verifyAccessToken(f.tokens.access_token)).scopes,
    ).toEqual(before.scopes);
  });

  it('rejects read-only creation and read-only empty selections', async () => {
    const f = await fixture(['exam:read']);
    expect(
      (await f.call('projects_create', {name: 'No permission'})).isError,
    ).toBe(true);
    expect(f.createProject).not.toHaveBeenCalled();
    await expect(
      f.oauth.updateGrantProjects('teacher', f.grantId, []),
    ).rejects.toMatchObject({status: 400});
    await expect(f.connect(['exam:read'], [])).rejects.toThrow();
    expect(
      (
        await request(f.app)
          .post('/mcp')
          .set('Accept', 'application/json, text/event-stream')
          .send({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: {name: 'projects_create', arguments: {name: 'Anonymous'}},
          })
      ).status,
    ).toBe(401);
  });

  it('lets editors remove all selected projects without losing creation capability', async () => {
    const f = await fixture();
    const response = await request(f.app)
      .put(`/profile/mcp/grants/${f.grantId}/projects`)
      .set('Authorization', 'Bearer browser')
      .send({projects: []});
    expect(response.status).toBe(200);
    expect((await f.call('projects_list')).structuredContent.projects).toEqual(
      [],
    );
    expect((await f.call('exam_get', {projectId: 'existing'})).isError).toBe(
      true,
    );
    expect(
      (await f.call('projects_create', {name: 'First new exam'}))
        .structuredContent.accessGranted,
    ).toBe(true);
  });

  it('rejects invalid names and never authorizes a preexisting project or retries', async () => {
    const f = await fixture();
    for (const name of [
      '',
      ' ',
      '../escape',
      'path\\escape',
      'admin',
      'list',
      'recent',
      'create',
      'login',
      'profile',
      'mcp',
      'con',
      '---',
      'a'.repeat(201),
    ])
      expect((await f.call('projects_create', {name})).isError).toBe(true);
    expect(await fs.readdir(f.root)).toEqual([]);
    await fs.ensureDir(path.join(f.root, 'existing-hidden'));
    await fs.writeFile(
      path.join(f.root, 'existing-hidden', 'marker'),
      'preserve',
    );
    f.available.add('existing-hidden');
    expect(
      (await f.call('projects_create', {name: 'Existing hidden'})).isError,
    ).toBe(true);
    expect((await f.call('projects_list')).structuredContent.projects).toEqual([
      'existing',
    ]);
    expect(
      await fs.readFile(path.join(f.root, 'existing-hidden', 'marker'), 'utf8'),
    ).toBe('preserve');
    await f.call('projects_create', {name: 'New exam'});
    expect((await f.call('projects_create', {name: 'New exam'})).isError).toBe(
      true,
    );
    expect(f.addAccess).toHaveBeenCalledTimes(1);
  });

  it('reserves a name exclusively across simultaneous creation requests', async () => {
    const f = await fixture();
    const results = await Promise.all([
      f.call('projects_create', {name: 'Concurrent exam'}),
      f.call('projects_create', {name: 'Concurrent exam'}),
    ]);
    expect(results.filter((result) => result.isError !== true)).toHaveLength(1);
    expect(results.filter((result) => result.isError === true)).toHaveLength(1);
    expect(f.addAccess).toHaveBeenCalledTimes(1);
    expect((await f.call('projects_list')).structuredContent.projects).toEqual([
      'existing',
      'concurrent-exam',
    ]);
  });

  it('checks the grant limit before creating any files', async () => {
    const f = await fixture(
      undefined,
      Array.from({length: 200}, (_, i) => `exam-${i}`),
    );
    const result = await f.call('projects_create', {name: 'Too many'});
    expect(result.isError).toBe(true);
    expect(result.structuredContent.message).toContain('200 projects');
    expect(f.createProject).not.toHaveBeenCalled();
    expect(await fs.readdir(f.root)).toEqual([]);
  });

  it('retains the created project and cannot resurrect a grant revoked during creation', async () => {
    const f = await fixture();
    f.deps.createProject = async (name, username) => {
      const project = await f.creator.create(name, username);
      await f.oauth.revokeGrant(username, f.grantId);
      return project;
    };
    const result = await f.call('projects_create', {name: 'Retained exam'});
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      projectId: 'retained-exam',
      accessGranted: false,
      message: expect.stringContaining('Options > Add editor access'),
    });
    expect(
      await fs.pathExists(path.join(f.root, 'retained-exam', 'options.xml')),
    ).toBe(true);
    expect(f.available.has('retained-exam')).toBe(true);
    expect(await f.oauth.grants('teacher')).toEqual([]);
    await expect(
      f.oauth.verifyAccessToken(f.tokens.access_token),
    ).rejects.toThrow();
    expect(f.audit).toHaveBeenCalledWith(
      expect.objectContaining({project: 'retained-exam', result: 'partial'}),
    );
  });

  it('reports a failed conditional grant save and supports recovery through the browser shortcut', async () => {
    const f = await fixture();
    const replace = f.store.compareAndSet.bind(f.store);
    f.store.compareAndSet = async () => false;
    const result = await f.call('projects_create', {name: 'Recover exam'});
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      projectId: 'recover-exam',
      accessGranted: false,
    });
    expect((await f.call('projects_list')).structuredContent.projects).toEqual([
      'existing',
    ]);
    expect(
      (await f.call('projects_create', {name: 'Recover exam'})).isError,
    ).toBe(true);
    f.store.compareAndSet = replace;
    const recovered = await request(f.app)
      .post(`/profile/mcp/grants/${f.grantId}/projects`)
      .set('Authorization', 'Bearer browser')
      .send({projectId: 'recover-exam'});
    expect(recovered.status).toBe(200);
    expect(
      (await f.call('exam_get', {projectId: 'recover-exam'})).isError,
    ).not.toBe(true);
  });

  it('preserves browser creation responses and waits for account permissions', async () => {
    const f = await fixture();
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    let permissionsStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      permissionsStarted = resolve;
    });
    f.addAccess.mockImplementationOnce(async (project) => {
      permissionsStarted();
      await blocked;
      f.available.add(project);
    });
    let completed = false;
    const pending = request(f.app)
      .post('/project/create')
      .set('Authorization', 'Bearer browser')
      .send({project: 'Browser exam'})
      .then((response) => {
        completed = true;
        return response;
      });
    await started;
    expect(completed).toBe(false);
    release();
    const response = await pending;
    expect(response.status).toBe(200);
    expect(response.text).toBe('browser-exam');
    expect(
      (
        await request(f.app)
          .post('/project/create')
          .set('Authorization', 'Bearer browser')
          .send({project: 'Browser exam'})
      ).text,
    ).toBe('Project already exists!');
    expect((await f.call('projects_list')).structuredContent.projects).toEqual([
      'existing',
    ]);
  });

  it('preserves browser project copying, its response format and private-option filtering', async () => {
    const f = await fixture();
    await f.creator.create('Source exam', 'teacher');
    await fs.writeFile(
      path.join(f.root, 'source-exam', 'options.xml'),
      '<project><nom_examen>Copied title</nom_examen><email>private-address</email><students>private-students</students></project>',
    );
    await fs.writeFile(
      path.join(f.root, 'source-exam', 'src/graphics', 'graphic.txt'),
      'graphic',
    );
    await f.documents.withDocument('source-exam', (doc) => {
      applyChanges(doc, [
        {
          op: 'question.create',
          sectionId: readExam(doc).sections[0].id,
          fields: {content: '<p>Copied question</p>'},
        },
      ]);
    });
    const response = await request(f.app)
      .post('/project/source-exam/copy/project')
      .set('Authorization', 'Bearer browser')
      .send({project: 'Copied exam'});
    expect(response.status).toBe(200);
    expect(response.text).toBe('OK');
    expect(f.available.has('copied-exam')).toBe(true);
    expect(
      await fs.readFile(
        path.join(f.root, 'copied-exam', 'src/graphics', 'graphic.txt'),
        'utf8',
      ),
    ).toBe('graphic');
    const options = await fs.readFile(
      path.join(f.root, 'copied-exam', 'options.xml'),
      'utf8',
    );
    expect(options).toContain('Copied title');
    expect(options).not.toContain('private-address');
    expect(options).not.toContain('private-students');
    expect(
      (await f.documents.withDocument('copied-exam', readExam)).sections[0]
        .questions[0].content,
    ).toBe('<p>Copied question</p>');
    const duplicate = await request(f.app)
      .post('/project/source-exam/copy/project')
      .set('Authorization', 'Bearer browser')
      .send({project: 'Copied exam'});
    expect(duplicate.status).toBe(403);
    expect(duplicate.text).toBe('Project already exists!');
    expect((await f.call('projects_list')).structuredContent.projects).toEqual([
      'existing',
    ]);
  });

  it('keeps a newly created project recoverable if lifecycle checks block initialization', async () => {
    const f = await fixture();
    f.deps.operation = async (projects, _write, run) => {
      if (projects.includes('archived-during-creation'))
        throw new Error('Project is archived or being archived');
      return run();
    };
    const result = await f.call('projects_create', {
      name: 'Archived during creation',
    });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      projectId: 'archived-during-creation',
      accessGranted: false,
    });
    expect((await f.call('projects_list')).structuredContent.projects).toEqual([
      'existing',
    ]);
    expect(
      await fs.pathExists(
        path.join(f.root, 'archived-during-creation', 'options.xml'),
      ),
    ).toBe(true);
  });
});
