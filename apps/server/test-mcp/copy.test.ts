import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import * as Y from 'yjs';
import {
  applyChanges,
  readExam,
  putEntity,
  type CopyRequest,
} from '@amcui/exam-core';
import {ExamDocuments} from '../src/exam/documents.js';
import {ExamCopy, copyContentHandler} from '../src/exam/copy.js';
import {MemoryPersistence} from './helpers.js';

let root: string,
  documents: ExamDocuments,
  copier: ExamCopy,
  input: CopyRequest;
let persistence: MemoryPersistence;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'amcui-copy-'));
  persistence = new MemoryPersistence();
  documents = new ExamDocuments(persistence, async () => null);
  copier = new ExamCopy(root, documents);
  await documents.withDocument('source', (doc) => {
    const section = readExam(doc).sections[0];
    applyChanges(doc, [
      {
        op: 'question.create',
        sectionId: section.id,
        fields: {content: 'First'},
      },
      {
        op: 'question.create',
        sectionId: section.id,
        fields: {content: 'Second'},
      },
    ]);
    input = {
      destinationProjectId: 'destination',
      requestId: 'copy-1',
      selection: [{sectionId: section.id}],
    };
  });
});
afterEach(async () => {
  vi.restoreAllMocks();
  await documents.close();
  await fs.remove(root);
});

describe('copy service', () => {
  it('persists copies and receipts together, deduplicates concurrent retries and survives restarts', async () => {
    const [first, second] = await Promise.all([
      copier.copy('source', input, 'teacher'),
      copier.copy('source', input, 'teacher'),
    ]);
    expect(first).toEqual(second);
    expect(first).toMatchObject({sections: 1, questions: 2});
    await documents.close();
    documents = new ExamDocuments(persistence, async () => null);
    copier = new ExamCopy(root, documents);
    expect(await copier.copy('source', input, 'teacher')).toEqual(first);
    const exam = await documents.withDocument('destination', readExam);
    expect(exam.sections).toHaveLength(2);
    expect(exam.sections[1].questions.map((q) => q.content)).toEqual([
      'First',
      'Second',
    ]);
    await expect(
      copier.copy(
        'source',
        {
          ...input,
          selection: [
            {sectionId: input.selection[0].sectionId, questionIds: []},
          ],
        },
        'teacher',
      ),
    ).rejects.toThrow('REQUEST_ID_REUSED');
  });

  it('copies to the same project and allows simultaneous transfers in opposite directions', async () => {
    const same = await copier.copy(
      'source',
      {...input, destinationProjectId: 'source'},
      'teacher',
    );
    expect(same.questions).toBe(2);
    const dest = await documents.withDocument('destination', readExam);
    await Promise.all([
      copier.copy('source', input, 'teacher'),
      copier.copy(
        'destination',
        {
          destinationProjectId: 'source',
          requestId: 'reverse',
          selection: [{sectionId: dest.sections[0].id}],
        },
        'teacher',
      ),
    ]);
    expect(
      (await documents.withDocument('source', readExam)).sections,
    ).toHaveLength(3);
  });

  async function graphics() {
    await documents.withDocument('source', (doc) => {
      const graphic = {
        id: 'g1',
        name: 'Drawing.excalidraw',
        border: false,
        width: 0.7,
      };
      putEntity(doc, 'graphics', graphic);
      applyChanges(doc, [
        {
          op: 'section.update',
          id: input.selection[0].sectionId,
          fields: {content: '<img id="g1">'},
        },
      ]);
    });
    for (const name of [
      'g1.excalidraw',
      'g1.svg',
      'g1.pdf',
      'g1_thumb.png',
      'unused.png',
    ])
      await fs.outputFile(path.join(root, 'source/src/graphics', name), name);
  }

  it('copies originals, editable companions and thumbnails with fresh IDs, without overwriting existing assets', async () => {
    await graphics();
    await fs.outputFile(
      path.join(root, 'destination/src/graphics/g1.pdf'),
      'destination',
    );
    await copier.copy('source', input, 'teacher');
    const exam = await documents.withDocument('destination', readExam);
    const id = Object.keys(exam.graphics)[0];
    expect(id).not.toBe('g1');
    expect(exam.sections[1].content).toBe(`<img id="${id}">`);
    for (const suffix of ['.excalidraw', '.svg', '.pdf', '_thumb.png'])
      expect(
        await fs.readFile(
          path.join(root, 'destination/src/graphics', id + suffix),
          'utf8',
        ),
      ).toBe('g1' + suffix);
    expect(
      await fs.readFile(
        path.join(root, 'destination/src/graphics/g1.pdf'),
        'utf8',
      ),
    ).toBe('destination');
    expect(
      await fs.pathExists(
        path.join(root, 'destination/src/graphics/unused.png'),
      ),
    ).toBe(false);
    expect(await fs.readdir(path.join(root, 'destination/src'))).toEqual([
      'graphics',
    ]);
  });

  it('leaves content and receipts untouched on missing files or a partially failed file publication, then permits retry', async () => {
    await graphics();
    const before = await documents.withDocument('destination', readExam);
    await fs.remove(path.join(root, 'source/src/graphics/g1.excalidraw'));
    await expect(copier.copy('source', input, 'teacher')).rejects.toThrow(
      'MISSING_GRAPHIC_FILE',
    );
    expect(await documents.withDocument('destination', readExam)).toEqual(
      before,
    );
    await fs.outputFile(
      path.join(root, 'source/src/graphics/g1.excalidraw'),
      'drawing',
    );
    const move = fs.move.bind(fs);
    let calls = 0;
    vi.spyOn(fs, 'move').mockImplementation((async (
      ...args: Parameters<typeof fs.move>
    ) => {
      if (++calls === 2) throw new Error('disk failure');
      return (move as any)(...args);
    }) as any);
    await expect(copier.copy('source', input, 'teacher')).rejects.toThrow(
      'disk failure',
    );
    expect(await documents.withDocument('destination', readExam)).toEqual(
      before,
    );
    expect(
      await fs.readdir(path.join(root, 'destination/src/graphics')),
    ).toEqual([]);
    expect(
      await documents.withDocument(
        'destination',
        (doc) => doc.getMap('_copyReceipts').size,
      ),
    ).toBe(0);
    vi.restoreAllMocks();
    expect((await copier.copy('source', input, 'teacher')).questions).toBe(2);
  });

  it('rejects source edits that have not reached the server yet', async () => {
    const client = new Y.Doc();
    await documents.withDocument('source', (doc) =>
      Y.applyUpdate(client, Y.encodeStateAsUpdate(doc)),
    );
    client.getText('source').insert(0, 'unsent');
    await expect(
      copier.copy(
        'source',
        {
          ...input,
          sourceSnapshot: Array.from(Y.encodeSnapshot(Y.snapshot(client))),
        },
        'teacher',
      ),
    ).rejects.toThrow('SOURCE_NOT_SYNCED');
    expect(
      (await documents.withDocument('destination', readExam)).sections,
    ).toHaveLength(1);
    client.destroy();
  });

  it('retains published assets when document persistence fails after publication', async () => {
    await graphics();
    let target!: Y.Doc;
    await documents.withDocument('destination', (doc) => {
      target = doc;
    });
    vi.spyOn(persistence, 'storeUpdate').mockRejectedValueOnce(
      new Error('persistence failure'),
    );
    await expect(copier.copy('source', input, 'teacher')).rejects.toThrow(
      'persistence failure',
    );
    const exam = readExam(target);
    expect(exam.sections).toHaveLength(2);
    expect(target.getMap('_copyReceipts').size).toBe(1);
    const id = Object.keys(exam.graphics)[0];
    expect(
      await fs.pathExists(
        path.join(root, 'destination/src/graphics', id + '.pdf'),
      ),
    ).toBe(true);
    // Shutdown also surfaces the deliberately failed persistence queue.
    const failedDocuments = documents;
    documents = new ExamDocuments(persistence, async () => null);
    await expect(failedDocuments.close()).rejects.toThrow(
      'persistence failure',
    );
  });

  it('also detects unsynchronized deletions, which do not advance a state vector', async () => {
    const client = new Y.Doc();
    await documents.withDocument('source', (doc) =>
      Y.applyUpdate(client, Y.encodeStateAsUpdate(doc)),
    );
    const vector = Y.encodeStateVector(client);
    client
      .getMap('questions')
      .delete(readExam(client).sections[0].questions[0].id);
    expect(Y.encodeStateVector(client)).toEqual(vector);
    await expect(
      copier.copy(
        'source',
        {
          ...input,
          sourceSnapshot: Array.from(Y.encodeSnapshot(Y.snapshot(client))),
        },
        'teacher',
      ),
    ).rejects.toThrow('SOURCE_NOT_SYNCED');
    client.destroy();
  });

  it('checks both project permissions and request validation at the HTTP boundary', async () => {
    const allowed = vi.fn(
      async (_user: string, project: string) => project === 'source',
    );
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = {username: 'teacher'};
      next();
    });
    app.post(
      '/project/:project/copy/content',
      copyContentHandler(copier, allowed),
    );
    await request(app)
      .post('/project/source/copy/content')
      .send(input)
      .expect(403);
    expect(allowed.mock.calls.map((c) => c[1])).toEqual([
      'source',
      'destination',
    ]);
    await request(app)
      .post('/project/source/copy/content')
      .send({...input, destinationProjectId: '../escape'})
      .expect(400);
    allowed.mockResolvedValue(true);
    const response = await request(app)
      .post('/project/source/copy/content')
      .send(input)
      .expect(200);
    expect(response.body.questions).toBe(2);
    expect(
      (
        await request(app)
          .post('/project/source/copy/content')
          .send(input)
          .expect(200)
      ).body,
    ).toEqual(response.body);
  });
});
