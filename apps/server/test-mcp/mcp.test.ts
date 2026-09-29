import {it, expect} from 'vitest';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createExamMcp, installMcp} from '../src/mcp/routes.js';
import {ExamDocuments} from '../src/exam/documents.js';
import {ExamOAuth} from '../src/mcp/oauth.js';
import {MemoryOAuth, MemoryPersistence} from './helpers.js';
import express from 'express';
import request from 'supertest';
import type {McpDependencies} from '../src/mcp/routes.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {ExamAssets} from '../src/exam/assets.js';
import {renderSnapshot} from '../src/exam/previews.js';
import {readExam} from '@amcui/exam-core';
import {codeExample, examGuideUri, questionExample} from '../src/mcp/guide.js';

function fixture() {
  const documents = new ExamDocuments(
    new MemoryPersistence(),
    async () => null,
  );
  const deps = {
    documents,
    oauth: new ExamOAuth(
      new MemoryOAuth(),
      'http://localhost/api/mcp',
      'http://localhost',
      async () => ['exam'],
    ),
    assets: {},
    previews: {},
    projects: async () => ['exam'],
    allowed: async () => true,
    audit: async () => {},
    secure: (_req: any, _res: any, next: any) => next(),
    publicApiUrl: 'http://localhost/api',
    webUrl: 'http://localhost',
  } as McpDependencies;
  const auth = {
    token: 'test',
    clientId: 'client',
    expiresAt: Math.floor(Date.now() / 1000) + 900,
    scopes: ['exam:read', 'exam:write'],
    extra: {username: 'teacher', projects: ['exam']},
  };
  return {deps, auth};
}
it('exposes interoperable schemas and executes retry-safe edits through an MCP SDK client', async () => {
  const {deps, auth} = fixture();
  const server = createExamMcp(deps, auth);
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({name: 'test', version: '1'});
  await server.connect(a);
  await client.connect(b);
  try {
    const tools = await client.listTools();
    expect(tools.tools.some((tool) => tool.name === 'exam_apply_changes')).toBe(
      true,
    );
    const exam = (
      await client.callTool({name: 'exam_get', arguments: {projectId: 'exam'}})
    ).structuredContent as any;
    const args = {
      projectId: 'exam',
      requestId: 'create-1',
      operations: [
        {
          op: 'question.create',
          sectionId: exam.sections[0].id,
          fields: {content: '<p>What is 2 + 2?</p>'},
          answers: [
            {content: '4', correct: true},
            {content: '5', correct: false},
          ],
        },
      ],
    };
    const first = await client.callTool({
      name: 'exam_apply_changes',
      arguments: args,
    });
    expect(first.isError).not.toBe(true);
    const retry = await client.callTool({
      name: 'exam_apply_changes',
      arguments: args,
    });
    expect(retry.structuredContent).toEqual(first.structuredContent);
    const changed = await client.callTool({
      name: 'exam_apply_changes',
      arguments: {
        ...args,
        operations: [{...args.operations[0], fields: {content: 'Changed'}}],
      },
    });
    expect(changed.isError).toBe(true);
    const final = (
      await client.callTool({name: 'exam_get', arguments: {projectId: 'exam'}})
    ).structuredContent as any;
    expect(final.sections[0].questions).toHaveLength(1);
    deps.allowed = async () => false;
    expect(
      (
        await client.callTool({
          name: 'exam_get',
          arguments: {projectId: 'exam'},
        })
      ).isError,
    ).toBe(true);
  } finally {
    await client.close();
    await server.close();
    await deps.documents.close();
  }
});
it('exposes the editing guide and executes its inline and multiline code examples', async () => {
  const {deps, auth} = fixture();
  deps.assets = new ExamAssets(
    '',
    async () => {},
    async (data) => data,
  );
  const server = createExamMcp(deps, auth);
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({name: 'guide-test', version: '1'});
  await server.connect(a);
  await client.connect(b);
  try {
    expect(client.getInstructions()).toContain('exam_help');
    const help = await client.callTool({name: 'exam_help', arguments: {}});
    expect(help.isError).not.toBe(true);
    const guide = (help.structuredContent as {guide: string}).guide;
    expect(
      (await client.listResources()).resources.some(
        (r) => r.uri === examGuideUri,
      ),
    ).toBe(true);
    const resource = await client.readResource({uri: examGuideUri});
    expect(resource.contents[0].text).toBe(guide);
    const tools = await client.listTools();
    const editSchema = tools.tools.find(
      (t) => t.name === 'exam_apply_changes',
    )!.inputSchema;
    expect(JSON.stringify(editSchema)).toContain('inline monospace');

    // Execute the JSON examples exactly as published, substituting real IDs.
    const examples = [...guide.matchAll(/```json\n([\s\S]*?)\n```/g)].map(
      (match) => JSON.parse(match[1]),
    );
    expect(examples).toEqual([questionExample, codeExample]);
    const exam = (
      await client.callTool({name: 'exam_get', arguments: {projectId: 'exam'}})
    ).structuredContent as any;
    const createArgs = examples[0];
    createArgs.projectId = 'exam';
    createArgs.operations[0].sectionId = exam.sections[0].id;
    const created = await client.callTool({
      name: 'exam_apply_changes',
      arguments: createArgs,
    });
    expect(created.isError).not.toBe(true);
    const question = (created.structuredContent as any).questions[0];
    expect(question.isValid).toBe(true);
    const blockArgs = {
      ...examples[1],
      projectId: 'exam',
      entityId: question.id,
    };
    const block = await client.callTool({
      name: 'code_block_upsert',
      arguments: blockArgs,
    });
    expect(block.isError).not.toBe(true);
    const blockId = (block.structuredContent as any).id;
    const rendered = await deps.documents.withDocument('exam', (doc) =>
      renderSnapshot(readExam(doc)),
    );
    expect(rendered.questions_definition).toContain('\\texttt{x = 2}');
    expect(rendered.questions_definition).toContain(`src/codes/${blockId}`);
    expect(rendered.codes[blockId].content).toBe(codeExample.content);
    expect(rendered.codes[blockId].mode).toBe('text/x-python');
  } finally {
    await client.close();
    await server.close();
    await deps.documents.close();
  }
});
it('provides proxy-correct OAuth metadata and authenticated stateless HTTP transport', async () => {
  const {deps, auth} = fixture();
  const app = express();
  app.use(express.json());
  deps.oauth.verifyAccessToken = async (token) => {
    if (token !== 'test') throw new Error('Invalid token');
    return auth;
  };
  installMcp(app, deps);
  const metadata = await request(app).get(
    '/.well-known/oauth-authorization-server/api',
  );
  expect(metadata.body.token_endpoint).toBe('http://localhost/api/oauth/token');
  const denied = await request(app)
    .post('/mcp')
    .send({jsonrpc: '2.0', id: 1, method: 'tools/list'});
  expect(denied.status).toBe(401);
  expect(denied.headers['www-authenticate']).toContain(
    '/.well-known/oauth-protected-resource/api/mcp',
  );
  const listener = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => listener.on('listening', resolve));
  const port = (listener.address() as {port: number}).port;
  const client = new Client({name: 'http-test', version: '1'});
  try {
    await client.connect(
      new StreamableHTTPClientTransport(
        new URL(`http://127.0.0.1:${port}/mcp`),
        {requestInit: {headers: {Authorization: 'Bearer test'}}},
      ),
    );
    expect((await client.listTools()).tools).toHaveLength(19);
    const raw = await request(app)
      .post('/mcp')
      .set('Authorization', 'Bearer test')
      .set('Accept', 'application/json, text/event-stream')
      .send({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {name: 'projects_list', arguments: {}},
      });
    expect(raw.status).toBe(200);
    expect(raw.body.result.structuredContent.projects).toEqual(['exam']);
  } finally {
    await client.close();
    await new Promise<void>((resolve) => listener.close(() => resolve()));
    await deps.documents.close();
  }
});
