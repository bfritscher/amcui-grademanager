import {it, expect} from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';
import * as Y from 'yjs';
import {
  applyChanges,
  createSection,
  putEntity,
  readExam,
  patchEntity,
} from '@amcui/exam-core';
import {renderExam} from '@amcui/exam-core/render';
import {JSDOM} from 'jsdom';
import {ExamAssets} from '../src/exam/assets.js';
import {ExamDocuments} from '../src/exam/documents.js';
import {ExamPreviews} from '../src/exam/previews.js';
import {MemoryPersistence} from './helpers.js';

it('edits both code representations and renders inline code into the captured output', () => {
  const doc = new Y.Doc();
  const section = createSection();
  putEntity(doc, 'sections', section);
  const assets = new ExamAssets(
    '',
    async () => {},
    async (b) => b,
  );
  const owner = {entityId: section.id, field: 'content' as const};
  const inline = assets.upsertCode(doc, owner, {
    content: 'x < 3\nprint(x)',
    mode: 'py',
    numbers: true,
  })!;
  expect(assets.codeBlocks(doc)[0].content).toBe('x < 3\nprint(x)');
  const dom = new JSDOM();
  const rendered = renderExam(readExam(doc), dom.window.document);
  dom.window.close();
  expect(rendered.codes[inline.id].content).toBe('x < 3\nprint(x)');
  expect(readExam(doc).codes[inline.id]).toBeUndefined();
  assets.deleteCode(doc, owner, inline.id);
  expect(assets.codeBlocks(doc)).toEqual([]);
  putEntity(doc, 'codes', {
    id: 'legacy',
    content: 'old',
    mode: 'text/x-python',
    numbers: false,
    border: true,
  });
  patchEntity(doc, 'sections', section.id, {
    content: '<code id="legacy"></code>',
  });
  assets.upsertCode(doc, owner, {id: 'legacy', content: 'new'});
  expect(readExam(doc).codes.legacy.content).toBe('new');
  doc.destroy();
});
it('uploads graphics with conversion and cleanup; referenced assets cannot be deleted', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'amcui-assets-'));
  const doc = new Y.Doc();
  const section = createSection();
  putEntity(doc, 'sections', section);
  const assets = new ExamAssets(
    root,
    async (folder, _filename, id) => {
      await fs.writeFile(path.join(folder, `${id}_thumb.jpg`), 'thumb');
    },
    async () => Buffer.from('pdf'),
  );
  try {
    for (const svg of [
      '<svg><script>alert(1)</script></svg>',
      '<svg><image href="http://127.0.0.1/private"/></svg>',
      '<svg><style>@import "http://example.com/style";</style></svg>',
    ]) {
      await expect(
        assets.upload('exam', doc, {
          name: 'unsafe.svg',
          mimeType: 'image/svg+xml',
          base64: Buffer.from(svg).toString('base64'),
        }),
      ).rejects.toThrow('UNSAFE_SVG');
    }
    const result = await assets.upload('exam', doc, {
      name: 'diagram.svg',
      mimeType: 'image/svg+xml',
      base64: Buffer.from('<svg/>').toString('base64'),
    });
    expect(
      (await assets.getGraphic('exam', doc, result.graphic.id)).mimeType,
    ).toBe('image/svg+xml');
    patchEntity(doc, 'sections', section.id, {content: result.html});
    await expect(
      assets.deleteGraphic('exam', doc, result.graphic.id),
    ).rejects.toThrow('ASSET_IN_USE');
    patchEntity(doc, 'sections', section.id, {content: ''});
    await assets.deleteGraphic('exam', doc, result.graphic.id);
    expect(
      await fs.readdir(path.join(root, 'exam', 'src', 'graphics')),
    ).toEqual([]);
    const broken = new ExamAssets(
      root,
      async () => {
        throw new Error('conversion failed');
      },
      async (b) => b,
    );
    await expect(
      broken.upload('exam', doc, {
        name: 'image.png',
        mimeType: 'image/png',
        base64: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString(
          'base64',
        ),
      }),
    ).rejects.toThrow('conversion failed');
    expect(
      await fs.readdir(path.join(root, 'exam', 'src', 'graphics')),
    ).toEqual([]);
    expect(doc.getMap('graphics').size).toBe(0);
  } finally {
    doc.destroy();
    await fs.remove(root);
  }
});
it('captures independent preview snapshots and reports compiler failures without replacing successful artifacts', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'amcui-previews-'));
  const documents = new ExamDocuments(
    new MemoryPersistence(),
    async () => null,
  );
  let fail = false;
  const published: string[] = [];
  const previews = new ExamPreviews(
    root,
    documents,
    async (_project, _user, body) => {
      published.push(body.json);
    },
    () => {},
    async (folder, log) => {
      log('compiler output');
      if (fail) throw new Error('bad latex');
      await fs.writeFile(path.join(folder, 'out', 'out.pdf'), '%PDF test');
    },
  );
  try {
    await documents.withDocument('exam', (doc) => {
      doc.getText('source').insert(0, 'template');
    });
    const job = await previews.enqueue('exam', 'teacher');
    await documents.withDocument('exam', (doc) => {
      const s = readExam(doc).sections[0];
      applyChanges(doc, [
        {op: 'section.update', id: s.id, fields: {title: 'Later edit'}},
      ]);
    });
    await expect
      .poll(async () => (await previews.get('exam', job.id)).status)
      .toBe('succeeded');
    expect(JSON.parse(published[0]).sections[0].title).toBe('Section Name');
    expect(
      Buffer.from(await previews.download('exam', job.id), 'base64').toString(),
    ).toContain('%PDF');
    fail = true;
    const second = await previews.enqueue('exam', 'teacher');
    await expect
      .poll(async () => (await previews.get('exam', second.id)).status)
      .toBe('failed');
    expect((await previews.get('exam', second.id)).error).toBe('bad latex');
    expect(published).toHaveLength(1);
  } finally {
    await documents.close();
    await fs.remove(root);
  }
});
