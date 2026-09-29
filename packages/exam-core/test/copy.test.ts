import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import {
  applyChanges,
  applyExamPaste,
  createSection,
  extractExamFragment,
  htmlReferences,
  prepareExamPaste,
  putEntity,
  readExam,
  replaceExam
} from '../src/index.js';

function fixture() {
  const doc = new Y.Doc();
  const section = createSection();
  putEntity(doc, 'sections', section);
  applyChanges(doc, [
    {
      op: 'question.create',
      sectionId: section.id,
      fields: { content: '<p>First</p>', lineup: true, scoring: 'b=2', points: 7 },
      answers: [{ content: 'Correct', correct: true, scoring: 'b=3' }]
    },
    {
      op: 'question.create',
      sectionId: section.id,
      fields: { type: 'OPEN', content: '<p>Second</p>', answer: '<p>Solution</p>' }
    }
  ]);
  return { doc, section };
}

describe('exam content copy', () => {
  it('copies across documents and into the same document in source order, preserving fields and parents', () => {
    const { doc, section } = fixture();
    const source = readExam(doc);
    const dest = new Y.Doc();
    replaceExam(dest, {
      ...source,
      source: 'Destination layout',
      properties: { course: 'Destination' }
    });
    // Even a destination cloned from the source must get independent identities.
    for (const target of [dest, doc]) {
      const plan = prepareExamPaste(extractExamFragment(source, [{ sectionId: section.id }]));
      let transactions = 0;
      target.on('afterTransaction', () => transactions++);
      applyExamPaste(target, plan);
      expect(transactions).toBe(1);
      const copy = readExam(target).sections[1];
      expect(copy.id).not.toBe(section.id);
      expect(copy.questions.map((q) => q.content)).toEqual(['<p>First</p>', '<p>Second</p>']);
      expect(copy.questions[0]).toMatchObject({
        lineup: true,
        scoring: 'b=2',
        points: 7,
        section: copy.id
      });
      expect(copy.questions[0].answers[0]).toMatchObject({
        correct: true,
        scoring: 'b=3',
        question: copy.questions[0].id
      });
      expect(copy.questions[0].answers[0].id).not.toBe(
        source.sections[0].questions[0].answers[0].id
      );
      expect(copy.questions[1].answer).toBe('<p>Solution</p>');
    }
    expect(readExam(dest)).toMatchObject({
      source: 'Destination layout',
      properties: { course: 'Destination' }
    });
    expect(source.sections).toHaveLength(1);
    doc.destroy();
    dest.destroy();
  });

  it('orders partial selections by source order and supports deliberately empty sections', () => {
    const { doc, section } = fixture();
    const second = createSection(5);
    putEntity(doc, 'sections', second);
    const source = readExam(doc);
    const questions = source.sections[0].questions;
    const fragment = extractExamFragment(source, [
      { sectionId: second.id, questionIds: [] },
      { sectionId: section.id, questionIds: [questions[1].id, questions[0].id] }
    ]);
    expect(fragment.sections.map((s) => s.id)).toEqual([section.id, second.id]);
    expect(fragment.sections[0].questions.map((q) => q.id)).toEqual(questions.map((q) => q.id));
    expect(
      extractExamFragment(source, [{ sectionId: section.id, questionIds: [questions[1].id] }])
        .sections[0].questions
    ).toHaveLength(1);
    expect(fragment.sections[1].questions).toEqual([]);
    expect(() =>
      extractExamFragment(source, [{ sectionId: second.id, questionIds: [questions[0].id] }])
    ).toThrow('INVALID_QUESTION_SELECTION');
    doc.destroy();
  });

  it('copies only dependencies, rewrites every HTML owner, and separates inline blocks with reused IDs', () => {
    const { doc, section } = fixture();
    const source = readExam(doc);
    source.graphics = {
      g1: { id: 'g1', name: 'drawing.svg', border: true, width: 0.5 },
      unused: { id: 'unused', name: 'unused.png', border: false, width: 1 }
    };
    source.codes = {
      c1: { id: 'c1', content: 'legacy', mode: 'python', border: true, numbers: true },
      unused: { id: 'unused', content: 'unused', mode: '', border: false, numbers: false }
    };
    source.sections[0].content = '<p class="historic"><img id=g&#49; data-width="70"></p>';
    source.sections[0].questions[0].content = '<code id="c1"></code>';
    source.sections[0].questions[0].answers[0].content = '<img id="g1">';
    source.sections[0].questions[1].answer =
      '<code id="inline" data-border="true">one</code><code id="inline" data-border="true">two</code>';
    const before = structuredClone(source);
    const fragment = extractExamFragment(source, [{ sectionId: section.id }]);
    expect(Object.keys(fragment.graphics)).toEqual(['g1']);
    expect(Object.keys(fragment.codes)).toEqual(['c1']);
    const plan = prepareExamPaste(fragment);
    const copied = plan.fragment.sections[0];
    const gId = plan.graphicIds.g1;
    expect(copied.content).toBe(`<p class="historic"><img id="${gId}" data-width="70"></p>`);
    expect(copied.questions[0].answers[0].content).toBe(`<img id="${gId}">`);
    expect(copied.questions[0].content).toContain(Object.keys(plan.fragment.codes)[0]);
    const inline = htmlReferences(copied.questions[1].answer!);
    expect(inline[0].id).not.toBe(inline[1].id);
    expect(inline.every((r) => r.id !== 'inline')).toBe(true);
    expect(source).toEqual(before);
    doc.destroy();
  });

  it('rejects broken references and duplicate paste identities without partial writes', () => {
    const { doc, section } = fixture();
    const source = readExam(doc);
    const plan = prepareExamPaste(extractExamFragment(source, [{ sectionId: section.id }]));
    applyExamPaste(doc, plan);
    const before = readExam(doc);
    expect(() => applyExamPaste(doc, plan)).toThrow('ID_COLLISION');
    expect(readExam(doc)).toEqual(before);
    source.sections[0].questions[0].answers[0].content = '<img id="missing">';
    expect(() => extractExamFragment(source, [{ sectionId: section.id }])).toThrow(
      'NOT_FOUND: graphic'
    );
    expect(readExam(doc)).toEqual(before);
    doc.destroy();
  });
});
