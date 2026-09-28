import {it, expect} from 'vitest';
import {LeveldbPersistence} from 'y-leveldb';
import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';
import {readExam, applyChanges} from '@amcui/exam-core';
import {ExamDocuments} from '../src/exam/documents.js';

it('reopens real LevelDB after a headless edit without importing a stale JSON export', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'amcui-leveldb-'));
  let persistence = new LeveldbPersistence(root);
  let documents = new ExamDocuments(persistence, async () => null);
  try {
    await documents.withDocument('exam', (doc) =>
      applyChanges(doc, [
        {
          op: 'question.create',
          sectionId: readExam(doc).sections[0].id,
          fields: {content: '<p>Durable headless question</p>'},
        },
      ]),
    );
    await documents.close();
    await persistence.destroy();
    persistence = new LeveldbPersistence(root);
    documents = new ExamDocuments(persistence, async () => {
      throw new Error('Do not import stale JSON');
    });
    expect(
      await documents.withDocument(
        'exam',
        (doc) => readExam(doc).sections[0].questions[0].content,
      ),
    ).toBe('<p>Durable headless question</p>');
  } finally {
    await documents.close();
    await persistence.destroy();
    await fs.remove(root);
  }
});
