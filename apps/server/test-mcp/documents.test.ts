import {it, expect} from 'vitest';
import * as Y from 'yjs';
import {WebSocketServer, WebSocket} from 'ws';
import {WebsocketProvider} from 'y-websocket';
import {
  applyChanges,
  readExam,
  createSection,
  putEntity,
} from '@amcui/exam-core';
import {ExamDocuments} from '../src/exam/documents.js';
import {MemoryPersistence} from './helpers.js';

it('synchronizes a browser-protocol client with server edits, disconnects and headless restarts', async () => {
  const persistence = new MemoryPersistence();
  const manager = new ExamDocuments(persistence, async () => null, 1000);
  const server = new WebSocketServer({port: 0});
  await new Promise<void>((resolve) => server.on('listening', resolve));
  server.on('connection', (ws) => {
    void manager.connect('exam', ws, async () => true);
  });
  const port = (server.address() as {port: number}).port;
  const browser = new Y.Doc();
  const provider = new WebsocketProvider(
    `ws://127.0.0.1:${port}`,
    'exam',
    browser,
    {WebSocketPolyfill: WebSocket as any, disableBc: true},
  );
  try {
    await new Promise<void>((resolve) =>
      provider.on('sync', (synced: boolean) => {
        if (synced) resolve();
      }),
    );
    const section = readExam(browser).sections[0];
    expect(section).toBeDefined();
    await manager.withDocument('exam', (doc) =>
      applyChanges(doc, [
        {op: 'section.update', id: section.id, fields: {title: 'MCP edit'}},
      ]),
    );
    await expect
      .poll(() => readExam(browser).sections[0].title)
      .toBe('MCP edit');
    applyChanges(browser, [
      {
        op: 'section.update',
        id: section.id,
        fields: {content: '<p>Browser edit</p>'},
      },
    ]);
    await expect
      .poll(() =>
        manager.withDocument(
          'exam',
          (doc) => readExam(doc).sections[0].content,
        ),
      )
      .toBe('<p>Browser edit</p>');
    await manager.withDocument('exam', async (doc) => {
      provider.disconnect();
      await new Promise((resolve) => setTimeout(resolve, 25));
      applyChanges(doc, [
        {op: 'section.update', id: section.id, fields: {title: 'After close'}},
      ]);
    });
    await manager.close();
    const restarted = new ExamDocuments(persistence, async () => {
      throw new Error('Must not reimport existing exam');
    });
    expect(
      await restarted.withDocument(
        'exam',
        (doc) => readExam(doc).sections[0].title,
      ),
    ).toBe('After close');
    await restarted.close();
  } finally {
    provider.destroy();
    browser.destroy();
    await manager.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

it('reports persistence failures instead of claiming durable success', async () => {
  const persistence = new MemoryPersistence();
  const manager = new ExamDocuments(persistence, async () => null);
  const section = await manager.withDocument(
    'exam',
    (doc) => readExam(doc).sections[0],
  );
  persistence.storeUpdate = async () => {
    throw new Error('disk full');
  };
  await expect(
    manager.withDocument('exam', (doc) =>
      applyChanges(doc, [
        {op: 'section.update', id: section.id, fields: {title: 'changed'}},
      ]),
    ),
  ).rejects.toThrow('disk full');
  await manager.close().catch(() => {});
});

it('migrates persisted fields before access and preserves unexported edits across rename', async () => {
  const persistence = new MemoryPersistence();
  const seed = new Y.Doc();
  putEntity(seed, 'sections', {
    ...createSection(),
    level: '1',
    columns: '2',
  } as any);
  seed
    .getText('source')
    .insert(0, '\\documentclass{article}\n\\usepackage{tabularx}');
  await persistence.storeUpdate('ws/old', Y.encodeStateAsUpdate(seed));
  seed.destroy();
  const manager = new ExamDocuments(persistence, async () => {
    throw new Error('Do not reload stale JSON');
  });
  const section = await manager.withDocument('old', (doc) => {
    const exam = readExam(doc);
    expect(exam.source).toContain('\\usepackage{soul}');
    expect(exam.source).toContain('\\usepackage{tabulary}');
    expect(exam.sections[0].columns).toBe(2);
    applyChanges(doc, [
      {
        op: 'section.update',
        id: exam.sections[0].id,
        fields: {title: 'Unexported'},
      },
    ]);
    return exam.sections[0];
  });
  let moved = false;
  await manager.rename('old', 'new', async () => {
    moved = true;
  });
  expect(moved).toBe(true);
  expect(
    await manager.withDocument('new', (doc) => readExam(doc).sections[0]),
  ).toMatchObject({id: section.id, title: 'Unexported'});
  await manager.close();
  const restarted = new ExamDocuments(persistence, async () => {
    throw new Error('Directory deleted');
  });
  await expect(restarted.clear('new')).resolves.toBeUndefined();
  const empty = await persistence.getYDoc('ws/new');
  expect(empty.getMap('sections').size).toBe(0);
  empty.destroy();
  await restarted.close();
});
