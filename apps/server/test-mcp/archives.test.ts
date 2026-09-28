import {it, expect} from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';
import AdmZip from 'adm-zip';
import * as Y from 'yjs';
import {
  createSection,
  putEntity,
  readExam,
  replaceExam,
} from '@amcui/exam-core';
import {archivePath, importArchive} from '../src/exam/archives.js';

it('rejects traversal and ambiguous paths on either platform', () => {
  for (const name of [
    '../data.json',
    '/data.json',
    'C:/data.json',
    'exam/../../outside',
    'exam\\data.json',
    'exam//data.json',
    'exam/./data.json',
    'exam./data.json',
  ])
    expect(() => archivePath(name)).toThrow('UNSAFE_ARCHIVE_PATH');
  expect(archivePath('exam/src/graphics/image.png')).toBe(
    'exam/src/graphics/image.png',
  );
});

it('validates staged model before copying files and replaces the live document on import', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'amcui-archive-test-'));
  const doc = new Y.Doc();
  putEntity(doc, 'sections', createSection());
  const project = path.join(root, 'project'),
    file = path.join(root, 'import.zip');
  await fs.ensureDir(project);
  await fs.writeFile(path.join(project, 'keep.txt'), 'original');
  try {
    const invalid = new AdmZip();
    invalid.addFile('exam/data.json', Buffer.from('{}'));
    invalid.addFile('exam/keep.txt', Buffer.from('replacement'));
    invalid.writeZip(file);
    await expect(
      importArchive(file, project, (exam) => replaceExam(doc, exam)),
    ).rejects.toThrow('INVALID_EXAM');
    expect(await fs.readFile(path.join(project, 'keep.txt'), 'utf8')).toBe(
      'original',
    );
    const snapshot = readExam(doc);
    snapshot.sections[0].title = 'Imported';
    const valid = new AdmZip();
    valid.addFile('exam/data.json', Buffer.from(JSON.stringify(snapshot)));
    valid.addFile('exam/src/graphics/g.png', Buffer.from('asset'));
    valid.addFile('exam/.git/config', Buffer.from('do not import'));
    valid.writeZip(file);
    await importArchive(file, project, (exam) => replaceExam(doc, exam));
    expect(readExam(doc).sections[0].title).toBe('Imported');
    expect(
      await fs.readFile(path.join(project, 'src/graphics/g.png'), 'utf8'),
    ).toBe('asset');
    expect(await fs.pathExists(path.join(project, '.git/config'))).toBe(false);
  } finally {
    doc.destroy();
    await fs.remove(root);
  }
});
