import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import {
  applyChanges,
  createAnswer,
  createQuestion,
  createSection,
  putEntity,
  readExam,
  replaceExam,
  normalizeExam,
  validateExam,
  referencesTo
} from '../src/index.js';
const fixture = () => {
  const doc = new Y.Doc();
  const section = createSection();
  putEntity(doc, 'sections', section);
  return { doc, section };
};
describe('shared exam operations', () => {
  it('creates questions and choices with finite order and warns about incomplete SINGLE drafts', () => {
    const { doc, section } = fixture();
    const result = applyChanges(doc, [{ op: 'question.create', sectionId: section.id }]);
    expect(result.exam.sections[0].questions[0].answers.map((a) => a.order)).toEqual([0, 1]);
    expect(createAnswer(createQuestion()).order).toBe(0);
    expect(result.warnings[0].code).toBe('INCOMPLETE_QUESTION');
    doc.destroy();
  });
  it('validates the whole batch before writing', () => {
    const { doc, section } = fixture();
    const before = readExam(doc);
    expect(() =>
      applyChanges(doc, [
        { op: 'section.update', id: section.id, fields: { title: 'Must not save' } },
        { op: 'question.delete', id: 'missing' }
      ])
    ).toThrow('NOT_FOUND');
    expect(readExam(doc)).toEqual(before);
    doc.destroy();
  });
  it('rejects executable HTML and arbitrary model fields', () => {
    const { doc, section } = fixture();
    for (const content of [
      '<img id="g1" onerror="alert(1)">',
      '<script>alert(1)</script>',
      '<p style="background:url(https://x)">x</p>',
      '<iframe src="x"></iframe>'
    ])
      expect(() =>
        applyChanges(doc, [{ op: 'section.update', id: section.id, fields: { content } }])
      ).toThrow();
    expect(() =>
      applyChanges(doc, [{ op: 'section.update', id: section.id, fields: { id: 'replace-id' } }])
    ).toThrow();
    doc.destroy();
  });
  it('duplicates every supported field, moves and cascades deletion', () => {
    const { doc, section } = fixture();
    let result = applyChanges(doc, [
      {
        op: 'question.create',
        sectionId: section.id,
        fields: { type: 'OPEN', lineup: true, answer: '<p>Solution</p>', points: 7, scoring: 'b=2' }
      }
    ]);
    const q = result.exam.sections[0].questions[0];
    result = applyChanges(doc, [{ op: 'question.duplicate', id: q.id }]);
    const copy = result.exam.sections[0].questions[1];
    expect(copy.id).not.toBe(q.id);
    expect(copy.lineup).toBe(true);
    expect(copy.answer).toBe(q.answer);
    expect(copy.points).toBe(7);
    result = applyChanges(doc, [{ op: 'section.create', fields: { title: 'Second' } }]);
    const second = result.exam.sections[1];
    applyChanges(doc, [
      { op: 'question.move', id: copy.id, sectionId: second.id, afterId: null },
      { op: 'section.delete', id: section.id }
    ]);
    expect(readExam(doc).sections[0].questions[0].id).toBe(copy.id);
    applyChanges(doc, [{ op: 'section.delete', id: second.id }]);
    expect(readExam(doc).sections).toHaveLength(1);
    expect(doc.getMap('questions').size).toBe(0);
    doc.destroy();
  });
  it('permits MULTIPLE with no correct choice and preserves solutions when switching types', () => {
    const { doc, section } = fixture();
    const result = applyChanges(doc, [
      { op: 'question.create', sectionId: section.id, fields: { type: 'MULTIPLE' } }
    ]);
    expect(validateExam(result.exam)).toEqual([]);
    const q = result.exam.sections[0].questions[0];
    applyChanges(doc, [
      { op: 'question.update', id: q.id, fields: { type: 'OPEN', answer: 'Expected answer' } }
    ]);
    expect(readExam(doc).sections[0].questions[0].answers).toHaveLength(2);
    doc.destroy();
  });
  it('normalizes snapshots without mutating the input; invalid imports leave all maps untouched', () => {
    const { doc, section } = fixture();
    applyChanges(doc, [{ op: 'question.create', sectionId: section.id }]);
    const input = readExam(doc),
      original = structuredClone(input);
    replaceExam(doc, input);
    expect(input).toEqual(original);
    const invalid = structuredClone(input);
    invalid.sections[0].questions[0].id = section.id;
    expect(() => replaceExam(doc, invalid)).toThrow('DUPLICATE');
    expect(readExam(doc)).toEqual(original);
    expect(normalizeExam(input).sections[0].questions[0].section).toBe(section.id);
    doc.destroy();
  });
  it('converges for independent edits and concurrent whole-field writes', () => {
    const { doc: a, section } = fixture();
    const b = new Y.Doc();
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    applyChanges(a, [{ op: 'section.update', id: section.id, fields: { title: 'Teacher' } }]);
    applyChanges(b, [
      { op: 'section.update', id: section.id, fields: { content: '<p>Model</p>' } }
    ]);
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    expect(readExam(a)).toEqual(readExam(b));
    expect(readExam(a).sections[0].title).toBe('Teacher');
    applyChanges(a, [{ op: 'section.update', id: section.id, fields: { content: '<p>A</p>' } }]);
    applyChanges(b, [{ op: 'section.update', id: section.id, fields: { content: '<p>B</p>' } }]);
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    expect(readExam(a)).toEqual(readExam(b));
    a.destroy();
    b.destroy();
  });
  it('validates asset references and rejects malformed imports before replacing live data', () => {
    const { doc, section } = fixture();
    expect(() =>
      applyChanges(doc, [
        { op: 'section.update', id: section.id, fields: { content: '<img id="missing">' } }
      ])
    ).toThrow('NOT_FOUND: graphic');
    putEntity(doc, 'graphics', { id: 'g1', name: 'test.png', border: false, width: 0.7 });
    applyChanges(doc, [
      { op: 'section.update', id: section.id, fields: { content: '<img id=g&#49;>' } }
    ]);
    expect(referencesTo(readExam(doc), 'g1')).toHaveLength(1);
    const before = readExam(doc);
    const invalid = structuredClone(before);
    (invalid.sections[0] as any).content = 42;
    expect(() => replaceExam(doc, invalid)).toThrow('INVALID_FIELD');
    expect(readExam(doc)).toEqual(before);
    doc.destroy();
  });
});
