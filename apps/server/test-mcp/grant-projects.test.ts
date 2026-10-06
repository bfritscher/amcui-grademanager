import {afterEach, describe, expect, it, vi} from 'vitest';
import express, {type Response} from 'express';
import request from 'supertest';
import {createHash} from 'node:crypto';
import {ZodError} from 'zod';
import {ExamOAuth} from '../src/mcp/oauth.js';
import {installMcp, type McpDependencies} from '../src/mcp/routes.js';
import {ExamDocuments} from '../src/exam/documents.js';
import {MemoryOAuth, MemoryPersistence} from './helpers.js';

const resource = 'http://localhost/api/mcp';
const client = {
  client_id: 'client',
  client_name: 'ChatGPT',
  redirect_uris: ['http://127.0.0.1/callback'],
  token_endpoint_auth_method: 'none' as const,
};

async function fixture() {
  const store = new MemoryOAuth();
  let projects = ['exam'];
  const oauth = new ExamOAuth(
    store,
    resource,
    'http://localhost',
    async () => projects,
    [client],
  );
  const verifier = 'a'.repeat(50);
  let authorizationUrl = '';
  await oauth.authorize(
    client,
    {
      redirectUri: client.redirect_uris[0],
      codeChallenge: createHash('sha256').update(verifier).digest('base64url'),
      scopes: ['exam:read'],
      resource: new URL(resource),
    },
    {
      redirect: (url: string) => {
        authorizationUrl = url;
      },
    } as Response,
  );
  const ticket = new URL(authorizationUrl).searchParams.get('request')!;
  const code = new URL(
    await oauth.consent(ticket, 'teacher', ['exam'], true),
  ).searchParams.get('code')!;
  const tokens = await oauth.exchangeAuthorizationCode(
    client,
    code,
    verifier,
    client.redirect_uris[0],
    new URL(resource),
  );
  const [grant] = await oauth.grants('teacher');
  return {
    store,
    oauth,
    tokens,
    grant,
    setProjects: (value: string[]) => {
      projects = value;
    },
  };
}

afterEach(() => vi.useRealTimers());

describe('editing connection project access', () => {
  it('changes existing and refreshed token access without extending the grant or storage expiration', async () => {
    vi.useFakeTimers({toFake: ['Date']});
    const {oauth, store, grant, tokens, setProjects} = await fixture();
    const key = `mcp:oauth:grant:${grant.id}`;
    const originalExpiry = store.values.get(key)!.expires;
    vi.setSystemTime(Date.now() + 60_000);
    setProjects(['exam', 'new-exam']);
    expect(
      (await oauth.grantProjects('teacher', grant.id)).availableProjects,
    ).toEqual(['exam', 'new-exam']);
    const updated = await oauth.updateGrantProjects('teacher', grant.id, [
      'exam',
      'new-exam',
      'exam',
    ]);
    expect(updated).toEqual({...grant, projects: ['exam', 'new-exam']});
    expect(store.values.get(key)!.expires).toBe(originalExpiry);
    const auth = await oauth.verifyAccessToken(tokens.access_token);
    expect(auth.extra?.projects).toEqual(['exam', 'new-exam']);
    expect(auth.scopes).toEqual(['exam:read']);
    const renewed = await oauth.exchangeRefreshToken(
      client,
      tokens.refresh_token!,
      undefined,
      new URL(resource),
    );
    expect(
      (await oauth.verifyAccessToken(renewed.access_token)).extra?.projects,
    ).toEqual(['exam', 'new-exam']);
    await oauth.updateGrantProjects('teacher', grant.id, ['new-exam']);
    expect(
      (await oauth.verifyAccessToken(tokens.access_token)).extra?.projects,
    ).toEqual(['new-exam']);
  });

  it('adds a single project without losing existing selections and treats retries as a no-op', async () => {
    const {oauth, grant, setProjects} = await fixture();
    // A previously selected project can have become inaccessible since consent.
    setProjects(['new-exam']);
    const first = await oauth.addGrantProject('teacher', grant.id, 'new-exam');
    expect(first).toEqual({...grant, projects: ['exam', 'new-exam']});
    expect(
      await oauth.addGrantProject('teacher', grant.id, 'new-exam'),
    ).toEqual(first);
  });

  it('rejects other owners, inaccessible projects and empty selections without changing the grant', async () => {
    const {oauth, grant} = await fixture();
    await expect(oauth.grantProjects('other', grant.id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      oauth.updateGrantProjects('other', grant.id, ['exam']),
    ).rejects.toMatchObject({status: 404});
    await expect(
      oauth.addGrantProject('other', grant.id, 'exam'),
    ).rejects.toMatchObject({status: 404});
    await expect(
      oauth.updateGrantProjects('teacher', grant.id, []),
    ).rejects.toMatchObject({status: 400});
    await expect(
      oauth.updateGrantProjects('teacher', grant.id, ['unavailable']),
    ).rejects.toMatchObject({status: 403});
    await expect(
      oauth.addGrantProject('teacher', grant.id, 'unavailable'),
    ).rejects.toMatchObject({status: 403});
    expect(await oauth.grants('teacher')).toEqual([grant]);
  });

  it('cannot resurrect a connection revoked while project access is being saved', async () => {
    const {oauth, store, grant, tokens, setProjects} = await fixture();
    setProjects(['exam', 'new-exam']);
    const replace = store.compareAndSet.bind(store);
    store.compareAndSet = async (...args) => {
      await oauth.revokeGrant('teacher', grant.id);
      return replace(...args);
    };
    await expect(
      oauth.addGrantProject('teacher', grant.id, 'new-exam'),
    ).rejects.toMatchObject({status: 409});
    expect(await oauth.grants('teacher')).toEqual([]);
    await expect(
      oauth.verifyAccessToken(tokens.access_token),
    ).rejects.toThrow();
    await expect(
      oauth.updateGrantProjects('teacher', grant.id, ['exam']),
    ).rejects.toMatchObject({status: 404});
  });

  it('rejects expiration during a save and limits connections to 200 projects', async () => {
    vi.useFakeTimers({toFake: ['Date']});
    const {oauth, store, grant, setProjects} = await fixture();
    const projects = Array.from({length: 201}, (_, index) => `exam-${index}`);
    setProjects(projects);
    await oauth.updateGrantProjects(
      'teacher',
      grant.id,
      projects.slice(0, 200),
    );
    await expect(
      oauth.addGrantProject('teacher', grant.id, projects[200]),
    ).rejects.toMatchObject({status: 400});
    const replace = store.compareAndSet.bind(store);
    store.compareAndSet = async (...args) => {
      vi.setSystemTime((grant.expiresAt + 1) * 1000);
      return replace(...args);
    };
    await expect(
      oauth.updateGrantProjects('teacher', grant.id, [projects[0]]),
    ).rejects.toMatchObject({status: 409});
    await expect(
      oauth.grantProjects('teacher', grant.id),
    ).rejects.toMatchObject({status: 404});
  });

  it('protects browser management routes and applies additions/removals to the next MCP call with the same token', async () => {
    const {oauth, grant, tokens, setProjects} = await fixture();
    const documents = new ExamDocuments(
      new MemoryPersistence(),
      async () => null,
    );
    const deps = {
      oauth,
      documents,
      publicApiUrl: 'http://localhost/api',
      webUrl: 'http://localhost',
      projects: async () => ['exam', 'new-exam'],
      allowed: async () => true,
      audit: async () => {},
      secure: (req, res, next) => {
        const token = req.headers.authorization;
        if (token !== 'Bearer browser' && token !== 'Bearer other-browser') {
          res.status(401).end();
          return;
        }
        req.user = {
          username: token === 'Bearer browser' ? 'teacher' : 'other',
        } as typeof req.user;
        next();
      },
    } as McpDependencies;
    const app = express();
    app.use(express.json());
    installMcp(app, deps);
    app.use(
      (
        error: unknown,
        _req: express.Request,
        res: express.Response,
        _next: express.NextFunction,
      ) => {
        res
          .status(error instanceof ZodError ? 400 : 500)
          .json({error: 'Invalid request'});
      },
    );
    const url = `/profile/mcp/grants/${grant.id}`;
    const call = (name: string, args: Record<string, unknown> = {}) =>
      request(app)
        .post('/mcp')
        .set('Authorization', `Bearer ${tokens.access_token}`)
        .set('Accept', 'application/json, text/event-stream')
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {name, arguments: args},
        });
    try {
      setProjects(['exam', 'new-exam']);
      expect((await request(app).get(url)).status).toBe(401);
      expect(
        (
          await request(app)
            .put(`${url}/projects`)
            .send({projects: ['exam']})
        ).status,
      ).toBe(401);
      expect(
        (await request(app).post(`${url}/projects`).send({projectId: 'exam'}))
          .status,
      ).toBe(401);
      expect(
        (
          await request(app)
            .get(url)
            .set('Authorization', 'Bearer other-browser')
        ).status,
      ).toBe(404);
      expect(
        (
          await request(app)
            .put(`${url}/projects`)
            .set('Authorization', 'Bearer other-browser')
            .send({projects: ['exam']})
        ).status,
      ).toBe(404);
      expect(
        (
          await request(app)
            .post(`${url}/projects`)
            .set('Authorization', 'Bearer other-browser')
            .send({projectId: 'new-exam'})
        ).status,
      ).toBe(404);
      const details = await request(app)
        .get(url)
        .set('Authorization', 'Bearer browser');
      expect(details.headers['cache-control']).toBe('no-store');
      expect(details.body).toMatchObject({
        grant,
        availableProjects: ['exam', 'new-exam'],
      });
      expect(
        (await call('projects_list')).body.result.structuredContent.projects,
      ).toEqual(['exam']);
      expect(
        (await call('exam_get', {projectId: 'new-exam'})).body.result.isError,
      ).toBe(true);
      expect(
        (
          await request(app)
            .post(`${url}/projects`)
            .set('Authorization', 'Bearer browser')
            .send({projectId: 'new-exam'})
        ).status,
      ).toBe(200);
      expect(
        (await call('projects_list')).body.result.structuredContent.projects,
      ).toEqual(['exam', 'new-exam']);
      expect(
        (await call('exam_get', {projectId: 'new-exam'})).body.result.isError,
      ).not.toBe(true);
      for (const body of [
        {projects: []},
        {projects: ['exam'], scopes: ['exam:write']},
        {projects: ['']},
        {projects: Array(201).fill('exam')},
      ]) {
        expect(
          (
            await request(app)
              .put(`${url}/projects`)
              .set('Authorization', 'Bearer browser')
              .send(body)
          ).status,
        ).toBe(400);
      }
      expect(
        (
          await request(app)
            .post(`${url}/projects`)
            .set('Authorization', 'Bearer browser')
            .send({projectId: 'exam', scopes: ['exam:write']})
        ).status,
      ).toBe(400);
      expect(
        (
          await request(app)
            .post(`${url}/projects`)
            .set('Authorization', 'Bearer browser')
            .send({projectId: 'unavailable'})
        ).status,
      ).toBe(403);
      expect(
        (
          await request(app)
            .put(`${url}/projects`)
            .set('Authorization', 'Bearer browser')
            .send({projects: ['new-exam']})
        ).status,
      ).toBe(200);
      expect(
        (await call('projects_list')).body.result.structuredContent.projects,
      ).toEqual(['new-exam']);
      expect(
        (await call('exam_get', {projectId: 'exam'})).body.result.isError,
      ).toBe(true);
      expect(
        (await oauth.verifyAccessToken(tokens.access_token)).scopes,
      ).toEqual(['exam:read']);
    } finally {
      await documents.close();
    }
  });
});
