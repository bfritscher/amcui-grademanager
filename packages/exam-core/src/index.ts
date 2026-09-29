import * as Y from 'yjs';
import { v4 as uuid } from 'uuid';
import type { Exam, Section, Question, Answer, Diagnostic } from './types.js';
import { operationsSchema, type ExamOperation } from './schema.js';
import { parseFragment } from 'parse5';
export * from './types.js';
export * from './schema.js';
export * from './migrations.js';
export * from './copy.js';

export const entityMaps = ['sections', 'questions', 'answers', 'graphics', 'codes'] as const;
export type EntityMap = (typeof entityMaps)[number];
export function createSection(order = 0): Section {
  return {
    id: `s${uuid()}`,
    title: 'Section Name',
    content: '<p></p>',
    level: 0,
    isNumbered: true,
    isSectionTitleVisibleOnAMC: true,
    shuffle: false,
    columns: 1,
    pageBreakBefore: false,
    questions: [],
    order
  };
}
export function createQuestion(): Question {
  return {
    id: `q${uuid()}`,
    content: '<p></p>',
    type: 'SINGLE',
    layout: 'VERTICAL',
    ordered: false,
    scoring: '',
    points: 1,
    dots: false,
    lines: 3,
    columns: 1,
    boxedAnswers: false,
    lineup: false,
    answers: []
  };
}
export function createAnswer(question: Pick<Question, 'id' | 'answers'>): Answer {
  return {
    id: `a${uuid()}`,
    content: '<p></p>',
    correct: false,
    question: question.id,
    order:
      Math.max(-1, ...question.answers.map((a) => (Number.isFinite(a.order) ? a.order! : 0))) + 1
  };
}
export function patchEntity(
  doc: Y.Doc,
  kind: EntityMap,
  id: string,
  fields: Record<string, unknown>
): void {
  const entity = doc.getMap<Y.Map<unknown>>(kind).get(id);
  if (!entity) throw new Error(`NOT_FOUND: ${kind}/${id}`);
  doc.transact(() => {
    for (const [key, value] of Object.entries(fields))
      if (value !== undefined) entity.set(key, value);
  });
}
export function putEntity(doc: Y.Doc, kind: EntityMap, entity: { id: string }): void {
  const data = { ...entity } as Record<string, unknown>;
  delete data.questions;
  delete data.answers;
  delete data.number;
  delete data.isValid;
  doc
    .getMap(kind)
    .set(entity.id, new Y.Map(Object.entries(data).filter(([, value]) => value !== undefined)));
}
function values<T>(doc: Y.Doc, kind: EntityMap): T[] {
  return [...doc.getMap<Y.Map<unknown>>(kind).values()].map((v) => v.toJSON() as T);
}
const sortOrder = (a: { order?: number; id: string }, b: { order?: number; id: string }) =>
  (a.order || 0) - (b.order || 0) || a.id.localeCompare(b.id);
export function readExam(doc: Y.Doc): Exam {
  const questions = values<Question>(doc, 'questions');
  const answers = values<Answer>(doc, 'answers');
  const exam: Exam = {
    sections: values<Section>(doc, 'sections')
      .sort(sortOrder)
      .map((s) => ({
        ...s,
        questions: questions
          .filter((q) => q.section === s.id)
          .sort(sortOrder)
          .map((q) => ({
            ...q,
            answers: answers.filter((a) => a.question === q.id).sort(sortOrder)
          }))
      })),
    source: doc.getText('source').toString(),
    properties: doc.getMap<string>('properties').toJSON(),
    graphics: doc.getMap('graphics').toJSON(),
    codes: doc.getMap('codes').toJSON()
  };
  numberExam(exam);
  return exam;
}
export function numberExam(exam: Exam): void {
  let questionNumber = 0;
  const levels = [0, 0, 0];
  for (const section of exam.sections) {
    const level = Math.max(0, Math.min(2, Number(section.level)));
    if (section.isNumbered) {
      levels[level]++;
      levels.fill(0, level + 1);
      section.number = levels.slice(0, level + 1).join('.');
    } else section.number = '';
    for (const q of section.questions) {
      q.number = ++questionNumber;
      q.isValid =
        q.type === 'OPEN' ||
        (q.answers.length > 0 &&
          (q.type !== 'SINGLE' || q.answers.filter((a) => a.correct).length === 1));
    }
  }
}
export function validateExam(exam: Exam): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const s of exam.sections)
    for (const q of s.questions) {
      if (!q.isValid)
        diagnostics.push({
          code: 'INCOMPLETE_QUESTION',
          entityId: q.id,
          message: 'A choice question needs answers; SINGLE needs exactly one correct answer.'
        });
      const seen = new Set<string>();
      for (const a of q.answers) {
        const text = plainText(a.content).toLowerCase();
        if (text && seen.has(text))
          diagnostics.push({
            code: 'DUPLICATE_ANSWER',
            entityId: a.id,
            message: 'Duplicate answer wording.'
          });
        seen.add(text);
      }
    }
  return diagnostics;
}
export function plainText(html: string): string {
  const text = (node: any): string =>
    node.nodeName === '#text' ? node.value : (node.childNodes || []).map(text).join(' ');
  return text(parseFragment(html)).replace(/\s+/g, ' ').trim();
}
export function contentFields(exam: Exam): { entityId: string; field: string; content: string }[] {
  return exam.sections.flatMap((s) => [
    { entityId: s.id, field: 'content', content: s.content },
    ...s.questions.flatMap((q) => [
      { entityId: q.id, field: 'content', content: q.content },
      { entityId: q.id, field: 'answer', content: q.answer || '' },
      ...q.answers.map((a) => ({ entityId: a.id, field: 'content', content: a.content }))
    ])
  ]);
}
export function htmlReferences(html: string): { id: string; tag: string; inline: boolean }[] {
  const refs: { id: string; tag: string; inline: boolean }[] = [];
  const visit = (node: any) => {
    const attrs = Object.fromEntries((node.attrs || []).map((a: any) => [a.name, a.value]));
    if (attrs.id) refs.push({ id: attrs.id, tag: node.tagName, inline: 'data-border' in attrs });
    for (const child of node.childNodes || []) visit(child);
  };
  visit(parseFragment(html));
  return refs;
}
export function referencesTo(exam: Exam, id: string) {
  return contentFields(exam).filter((f) => htmlReferences(f.content).some((ref) => ref.id === id));
}
function getQuestion(doc: Y.Doc, id: string): Question {
  const q = readExam(doc)
    .sections.flatMap((s) => s.questions)
    .find((q) => q.id === id);
  if (!q) throw new Error(`NOT_FOUND: question/${id}`);
  return q;
}
function remove(doc: Y.Doc, kind: EntityMap, id: string) {
  if (!doc.getMap(kind).has(id)) throw new Error(`NOT_FOUND: ${kind}/${id}`);
  if (kind === 'sections')
    for (const q of values<Question>(doc, 'questions').filter((q) => q.section === id))
      remove(doc, 'questions', q.id);
  if (kind === 'questions')
    for (const a of values<Answer>(doc, 'answers').filter((a) => a.question === id))
      remove(doc, 'answers', a.id);
  doc.getMap(kind).delete(id);
}
function move(
  doc: Y.Doc,
  kind: EntityMap,
  id: string,
  parent: { key: string; id: string } | null,
  afterId: string | null
) {
  if (!doc.getMap(kind).has(id)) throw new Error(`NOT_FOUND: ${id}`);
  if (parent) patchEntity(doc, kind, id, { [parent.key]: parent.id });
  const siblings = values<any>(doc, kind)
    .filter((e) => e.id !== id && (!parent || e[parent.key] === parent.id))
    .sort(sortOrder);
  const position = afterId === null ? 0 : siblings.findIndex((e) => e.id === afterId) + 1;
  if (afterId !== null && position === 0)
    throw new Error('INVALID_POSITION: preceding sibling not found');
  siblings.splice(position, 0, { id });
  siblings.forEach((e, order) => patchEntity(doc, kind, e.id, { order }));
}
function execute(
  doc: Y.Doc,
  operations: ExamOperation[],
  makeId: (prefix: string) => string
): string[] {
  const affected: string[] = [];
  const needSection = (id: string) => {
    if (!doc.getMap('sections').has(id)) throw new Error(`NOT_FOUND: section/${id}`);
  };
  for (const op of operations) {
    if ('id' in op) affected.push(op.id);
    switch (op.op) {
      case 'section.create': {
        const order =
          Math.max(-1, ...values<Section>(doc, 'sections').map((s) => s.order || 0)) + 1;
        const s = { ...createSection(order), ...op.fields, id: makeId('s') };
        putEntity(doc, 'sections', s);
        affected.push(s.id);
        break;
      }
      case 'section.update':
        patchEntity(doc, 'sections', op.id, op.fields);
        break;
      case 'section.delete':
        remove(doc, 'sections', op.id);
        if (!doc.getMap('sections').size) {
          const section = { ...createSection(), id: makeId('s') };
          putEntity(doc, 'sections', section);
          affected.push(section.id);
        }
        break;
      case 'section.move':
        move(doc, 'sections', op.id, null, op.afterId);
        break;
      case 'question.create': {
        needSection(op.sectionId);
        const q = {
          ...createQuestion(),
          ...op.fields,
          id: makeId('q'),
          section: op.sectionId,
          order:
            Math.max(
              -1,
              ...values<Question>(doc, 'questions')
                .filter((q) => q.section === op.sectionId)
                .map((q) => q.order || 0)
            ) + 1
        };
        if (q.type === 'OPEN') q.answer ??= '';
        putEntity(doc, 'questions', q);
        affected.push(q.id);
        const answers = op.answers ?? (q.type === 'OPEN' ? [] : [{}, {}]);
        answers.forEach((a, order) => {
          const answer = { ...createAnswer(q), ...a, id: makeId('a'), order };
          putEntity(doc, 'answers', answer);
          affected.push(answer.id);
        });
        break;
      }
      case 'question.update':
        patchEntity(doc, 'questions', op.id, op.fields);
        break;
      case 'question.delete':
        remove(doc, 'questions', op.id);
        break;
      case 'question.move':
        needSection(op.sectionId);
        move(doc, 'questions', op.id, { key: 'section', id: op.sectionId }, op.afterId);
        break;
      case 'question.duplicate': {
        const original = getQuestion(doc, op.id);
        const section = op.sectionId || original.section!;
        needSection(section);
        const q = { ...original, id: makeId('q'), section };
        putEntity(doc, 'questions', q);
        affected.push(q.id);
        move(
          doc,
          'questions',
          q.id,
          { key: 'section', id: section },
          section === original.section ? original.id : null
        );
        for (const a of original.answers) {
          const answer = { ...a, id: makeId('a'), question: q.id };
          putEntity(doc, 'answers', answer);
          affected.push(answer.id);
        }
        break;
      }
      case 'answer.create': {
        const q = getQuestion(doc, op.questionId);
        const a = { ...createAnswer(q), ...op.fields, id: makeId('a') };
        putEntity(doc, 'answers', a);
        affected.push(a.id);
        break;
      }
      case 'answer.update':
        patchEntity(doc, 'answers', op.id, op.fields);
        break;
      case 'answer.delete':
        remove(doc, 'answers', op.id);
        break;
      case 'answer.move':
        getQuestion(doc, op.questionId);
        move(doc, 'answers', op.id, { key: 'question', id: op.questionId }, op.afterId);
        break;
    }
  }
  return affected;
}
export interface ApplyResult {
  affectedIds: string[];
  exam: Exam;
  warnings: Diagnostic[];
}
export function applyChanges(doc: Y.Doc, input: unknown, origin: unknown = null): ApplyResult {
  const ops = operationsSchema.parse(input);
  // Validate references introduced by this request without rejecting unrelated
  // historic content that may already contain broken links.
  for (const op of ops) {
    const fields = [
      ...('fields' in op ? [op.fields] : []),
      ...('answers' in op ? op.answers || [] : [])
    ];
    for (const patch of fields)
      for (const [key, value] of Object.entries(patch)) {
        if (!['content', 'answer'].includes(key) || typeof value !== 'string') continue;
        for (const ref of htmlReferences(value)) {
          if (ref.tag === 'img' && !doc.getMap('graphics').has(ref.id))
            throw new Error(`NOT_FOUND: graphic/${ref.id}`);
          if (['code', 'pre'].includes(ref.tag) && !ref.inline && !doc.getMap('codes').has(ref.id))
            throw new Error(`NOT_FOUND: code/${ref.id}`);
        }
      }
  }
  const candidate = new Y.Doc();
  Y.applyUpdate(candidate, Y.encodeStateAsUpdate(doc));
  const ids: string[] = [];
  try {
    execute(candidate, ops, (prefix) => {
      const id = prefix + uuid();
      ids.push(id);
      return id;
    });
  } finally {
    candidate.destroy();
  }
  let affectedIds: string[] = [];
  let index = 0;
  doc.transact(() => {
    affectedIds = execute(doc, ops, () => ids[index++]);
  }, origin);
  const exam = readExam(doc);
  return { affectedIds, exam, warnings: validateExam(exam) };
}

// Legacy snapshots are trusted stored documents, not MCP HTML input. Normalize them
// without stripping their historic formatting, and check topology before clearing maps.
export function normalizeExam(input: unknown): Exam {
  const data = typeof input === 'string' ? JSON.parse(input) : structuredClone(input);
  if (!data || !Array.isArray(data.sections) || typeof data.source !== 'string')
    throw new Error('INVALID_EXAM');
  const seen = new Set<string>();
  const unique = (id: string) => {
    if (typeof id !== 'string' || !id || seen.has(id)) throw new Error('INVALID_OR_DUPLICATE_ID');
    seen.add(id);
    return id;
  };
  const exam: Exam = {
    source: data.source,
    properties: data.properties || {},
    graphics: data.graphics || {},
    codes: data.codes || {},
    sections: []
  };
  for (const map of [exam.properties, exam.graphics, exam.codes])
    if (!map || typeof map !== 'object' || Array.isArray(map)) throw new Error('INVALID_EXAM_MAP');
  const checkFields = (entity: Record<string, unknown>, defaults: Record<string, unknown>) => {
    for (const [key, fallback] of Object.entries(defaults)) {
      if (['questions', 'answers'].includes(key)) continue;
      const value = entity[key];
      if (
        typeof value !== typeof fallback ||
        (typeof value === 'number' && !Number.isFinite(value))
      )
        throw new Error(`INVALID_FIELD: ${key}`);
    }
    if (entity.answer !== undefined && typeof entity.answer !== 'string')
      throw new Error('INVALID_FIELD: answer');
  };
  for (const [order, s] of data.sections.entries()) {
    if (!Array.isArray(s.questions)) throw new Error('INVALID_SECTION');
    const section: Section = {
      ...createSection(order),
      ...s,
      id: unique(s.id || `s${uuid()}`),
      level: Number(s.level ?? 0),
      columns: Number(s.columns ?? 1),
      order,
      questions: []
    };
    checkFields(section as unknown as Record<string, unknown>, { ...createSection() });
    for (const [qorder, q] of s.questions.entries()) {
      if (!Array.isArray(q.answers) || !['SINGLE', 'MULTIPLE', 'OPEN'].includes(q.type))
        throw new Error('INVALID_QUESTION');
      const question: Question = {
        ...createQuestion(),
        ...q,
        id: unique(q.id || `q${uuid()}`),
        section: section.id,
        order: qorder,
        columns: Number(q.columns ?? 1),
        lines: Number(q.lines ?? 3),
        answers: []
      };
      if (question.type === 'OPEN') question.answer ??= '';
      checkFields(question as unknown as Record<string, unknown>, { ...createQuestion() });
      question.answers = q.answers.map((a: Answer, order: number) => {
        const answer = {
          ...a,
          id: unique(a.id || `a${uuid()}`),
          question: question.id,
          order,
          scoring: a.scoring === undefined ? undefined : String(a.scoring)
        };
        if (typeof answer.content !== 'string' || typeof answer.correct !== 'boolean')
          throw new Error('INVALID_ANSWER');
        return answer;
      });
      section.questions.push(question);
    }
    exam.sections.push(section);
  }
  for (const [key, value] of Object.entries(exam.properties))
    if (typeof value !== 'string') throw new Error(`INVALID_PROPERTY: ${key}`);
  for (const map of [exam.graphics, exam.codes])
    for (const [key, value] of Object.entries(map))
      if (!value || value.id !== key) throw new Error('INVALID_ASSET');
  return exam;
}
export function replaceExam(doc: Y.Doc, input: unknown, origin: unknown = null): void {
  const exam = normalizeExam(input);
  doc.transact(() => {
    for (const name of [...entityMaps, 'properties']) doc.getMap(name).clear();
    const source = doc.getText('source');
    source.delete(0, source.length);
    source.insert(0, exam.source);
    for (const [key, value] of Object.entries(exam.properties))
      doc.getMap('properties').set(key, value);
    for (const section of exam.sections) {
      putEntity(doc, 'sections', section);
      for (const q of section.questions) {
        putEntity(doc, 'questions', q);
        for (const a of q.answers) putEntity(doc, 'answers', a);
      }
    }
    for (const graphic of Object.values(exam.graphics)) putEntity(doc, 'graphics', graphic);
    for (const code of Object.values(exam.codes)) putEntity(doc, 'codes', code);
    if (!exam.sections.length) putEntity(doc, 'sections', createSection());
  }, origin);
}
