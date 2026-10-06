// Run against disposable local infrastructure; never against production.
import assert from 'node:assert/strict';
import {randomUUID, createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {WebsocketProvider} from 'y-websocket';
import {WebSocket} from 'ws';
import * as Y from 'yjs';
import AdmZip from 'adm-zip';
import {readExam} from '@amcui/exam-core';
import bcrypt from 'bcrypt';
import {createClient} from 'redis';

const base = process.env.MCP_SMOKE_URL || 'http://127.0.0.1:9001';
assert(
  ['localhost', '127.0.0.1'].includes(new URL(base).hostname),
  'Use isolated loopback infrastructure',
);
const project = `mcp-smoke-${randomUUID()}`;
const copiedProject = `${project}-copy`;
const username = project;
let jwt, client, provider, grantId;
const browser = new Y.Doc();
async function http(
  route,
  body,
  token = jwt,
  method = body === undefined ? 'GET' : 'POST',
) {
  const response = await fetch(base + route, {
    method,
    headers: {
      ...(token ? {Authorization: `Bearer ${token}`} : {}),
      ...(body === undefined ? {} : {'Content-Type': 'application/json'}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual',
  });
  const text = await response.text();
  assert(response.ok, `${route}: ${response.status} ${text.slice(0, 300)}`);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
async function until(check, milliseconds = 120_000) {
  const end = Date.now() + milliseconds;
  while (!(await check())) {
    assert(Date.now() < end, 'Timed out');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
async function call(name, args) {
  const response = await client.callTool({name, arguments: args});
  assert(!response.isError, `${name}: ${JSON.stringify(response.content)}`);
  return response.structuredContent;
}
try {
  // Seed a grandfathered credential only in disposable test infrastructure.
  // Login no longer implicitly creates accounts.
  const password = randomUUID();
  const fixtureRedis = await createClient({
    url: process.env.MCP_SMOKE_REDIS_URL || 'redis://redis:6379',
  }).connect();
  try {
    assert(
      await fixtureRedis.SET(
        'user:' + username,
        JSON.stringify({username, password: await bcrypt.hash(password, 4)}),
        {NX: true},
      ),
    );
  } finally {
    await fixtureRedis.quit();
  }
  jwt = (await http('/login', {username, password}, null)).token;
  await http('/project/create', {project});
  const metadata = await http(
    '/.well-known/oauth-authorization-server',
    undefined,
    null,
  );
  const resourceMetadata = await http(
    new URL(base).pathname.replace(/\/$/, '') +
      '/.well-known/oauth-protected-resource/mcp',
    undefined,
    null,
  ).catch(() => null);
  const resource = resourceMetadata?.resource || `${base}/mcp`;
  const registration = await http(
    '/oauth/register',
    {
      client_name: 'AMCUI smoke test',
      redirect_uris: ['http://127.0.0.1/callback'],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    },
    null,
  );
  const verifier = randomUUID() + randomUUID();
  const authorization = new URL(metadata.authorization_endpoint);
  authorization.search = new URLSearchParams({
    client_id: registration.client_id,
    redirect_uri: registration.redirect_uris[0],
    response_type: 'code',
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
    scope: 'exam:read exam:write',
    state: 'smoke',
    resource,
  }).toString();
  const start = await fetch(authorization, {redirect: 'manual'});
  assert.equal(start.status, 302);
  const ticket = new URL(start.headers.get('location')).searchParams.get(
    'request',
  );
  const consent = await http(`/profile/mcp/authorize/${ticket}`);
  assert(consent.projects.includes(project));
  const redirect = new URL(
    (
      await http(`/profile/mcp/authorize/${ticket}`, {
        allow: true,
        projects: [project],
      })
    ).redirect,
  );
  assert.equal(redirect.searchParams.get('state'), 'smoke');
  const tokenResponse = await fetch(metadata.token_endpoint, {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: registration.client_id,
      code: redirect.searchParams.get('code'),
      code_verifier: verifier,
      redirect_uri: registration.redirect_uris[0],
      resource,
    }),
  });
  const tokens = await tokenResponse.json();
  assert.equal(tokenResponse.status, 200, JSON.stringify(tokens));
  grantId = (await http('/profile/mcp/grants'))[0].id;
  client = new Client({name: 'amcui-smoke', version: '1'});
  await client.connect(
    new StreamableHTTPClientTransport(new URL(resource), {
      requestInit: {headers: {Authorization: `Bearer ${tokens.access_token}`}},
    }),
  );
  assert(
    (await client.listTools()).tools.some(
      (tool) => tool.name === 'exam_copy_content',
    ),
  );
  provider = new WebsocketProvider(
    base.replace(/^http/, 'ws') + '/ws',
    project,
    browser,
    {
      params: {access_token: jwt},
      WebSocketPolyfill: WebSocket,
      disableBc: true,
    },
  );
  await until(() => provider.synced, 10_000);
  const section = readExam(browser).sections[0];
  browser.getText('source').insert(
    0,
    String.raw`\documentclass[a4paper]{article}
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage{automultiplechoice}
\usepackage{graphicx}
\usepackage{listings}
\usepackage{multicol}
\usepackage{enumitem}
\usepackage{color}
\usepackage{soul}
\begin{document}
\input{questions_definition.tex}
\begin{examcopy}[1]
\input{questions_layout.tex}
\end{examcopy}
\end{document}`,
  );
  const edit = {
    projectId: project,
    requestId: randomUUID(),
    operations: [
      {
        op: 'question.create',
        sectionId: section.id,
        fields: {content: '<p>What is 2 + 2?</p>'},
        answers: [
          {content: '4', correct: true},
          {content: '5', correct: false},
        ],
      },
    ],
  };
  const result = await call('exam_apply_changes', edit);
  assert.deepEqual(await call('exam_apply_changes', edit), result);
  const question = result.questions[0];
  await until(
    () => readExam(browser).sections[0].questions[0]?.id === question.id,
    10_000,
  );
  browser
    .getMap('questions')
    .get(question.id)
    .set('content', '<p>Browser and MCP are connected.</p>');
  await until(
    async () =>
      (
        await call('question_get', {
          projectId: project,
          questionId: question.id,
        })
      ).question.content.includes('Browser and MCP'),
    10_000,
  );
  const image = await readFile(
    new URL('../tests/e2e/fixtures/test.jpg', import.meta.url),
  );
  const graphic = await call('graphics_upload', {
    projectId: project,
    // The historical test.jpg fixture contains PNG bytes.
    name: 'test.png',
    mimeType: 'image/png',
    base64: image.toString('base64'),
  });
  await call('exam_apply_changes', {
    projectId: project,
    requestId: randomUUID(),
    operations: [
      {
        op: 'question.update',
        id: question.id,
        fields: {content: '<p>What is 2 + 2?</p>' + graphic.html},
      },
    ],
  });
  await call('code_block_upsert', {
    projectId: project,
    entityId: section.id,
    field: 'content',
    content: 'print(2 + 2)',
    mode: 'python',
  });
  const preview = await call('exam_preview', {projectId: project});
  let job;
  await until(async () => {
    job = await call('preview_get', {projectId: project, jobId: preview.id});
    return ['succeeded', 'failed'].includes(job.status);
  });
  assert.equal(job.status, 'succeeded', JSON.stringify(job));
  const download = await call('preview_download', {
    projectId: project,
    jobId: job.id,
  });
  const pdf = await client.readResource({uri: download.uri});
  assert(
    Buffer.from(pdf.contents[0].blob, 'base64')
      .subarray(0, 4)
      .equals(Buffer.from('%PDF')),
  );
  const thumb = await call('graphics_get', {
    projectId: project,
    id: graphic.graphic.id,
    thumbnail: true,
  });
  assert.equal(
    (await client.readResource({uri: thumb.uri})).contents[0].mimeType,
    'image/png',
  );
  await call('exam_apply_changes', {
    projectId: project,
    requestId: randomUUID(),
    operations: [
      {
        op: 'section.update',
        id: section.id,
        fields: {title: 'Newer than the last preview'},
      },
    ],
  });
  const zipResponse = await fetch(`${base}/project/${project}/zip`, {
    headers: {Authorization: `Bearer ${jwt}`},
  });
  assert.equal(zipResponse.status, 200);
  const zipBytes = Buffer.from(await zipResponse.arrayBuffer());
  const exported = new AdmZip(zipBytes);
  assert.equal(
    JSON.parse(exported.readAsText('data.json')).sections[0].title,
    'Newer than the last preview',
  );
  assert(
    exported
      .readAsText('questions_layout.tex')
      .includes('Newer than the last preview'),
  );
  await http(`/project/${project}/copy/project`, {project: copiedProject});
  const copiedZip = await fetch(`${base}/project/${copiedProject}/zip`, {
    headers: {Authorization: `Bearer ${jwt}`},
  });
  assert.equal(copiedZip.status, 200);
  assert.equal(
    JSON.parse(
      new AdmZip(Buffer.from(await copiedZip.arrayBuffer())).readAsText(
        'data.json',
      ),
    ).sections[0].title,
    'Newer than the last preview',
  );
  await call('exam_apply_changes', {
    projectId: project,
    requestId: randomUUID(),
    operations: [
      {
        op: 'section.update',
        id: section.id,
        fields: {title: 'Changed after export'},
      },
    ],
  });
  const form = new FormData();
  form.append(
    'file',
    new Blob([zipBytes], {type: 'application/zip'}),
    'exam.zip',
  );
  const imported = await fetch(`${base}/project/${project}/zip`, {
    method: 'POST',
    headers: {Authorization: `Bearer ${jwt}`},
    body: form,
  });
  assert.equal(imported.status, 200, await imported.text());
  await until(
    () => readExam(browser).sections[0].title === 'Newer than the last preview',
    10_000,
  );
  provider.destroy();
  provider = undefined;
  await http(`/profile/mcp/grants/${grantId}`, undefined, jwt, 'DELETE');
  grantId = undefined;
  const revoked = await fetch(resource, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokens.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({jsonrpc: '2.0', id: 1, method: 'tools/list'}),
  });
  assert.equal(revoked.status, 401);
  console.log(
    'PASS: browser JWT → OAuth/PKCE consent → MCP edits/retry → live WebSocket → graphics/code → real AMC PDF → live ZIP/copy/import → grant revocation',
  );
} finally {
  provider?.destroy();
  browser.destroy();
  await client?.close();
  if (grantId)
    await http(
      `/profile/mcp/grants/${grantId}`,
      undefined,
      jwt,
      'DELETE',
    ).catch(() => {});
  if (jwt) await http(`/project/${project}/delete`, {}).catch(() => {});
  if (jwt) await http(`/project/${copiedProject}/delete`, {}).catch(() => {});
}
