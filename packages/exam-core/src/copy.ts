import * as Y from 'yjs';
import { v4 as uuid } from 'uuid';
import { parseFragment } from 'parse5';
import { z } from 'zod';
import type { Exam, Section } from './types.js';
import { contentFields, htmlReferences, normalizeExam, putEntity, readExam } from './index.js';

const id = z.string().regex(/^[\w-]{1,200}$/);
export const copySelectionSchema = z
  .array(
    z
      .object({
        sectionId: id,
        // Omit to select a whole section; [] deliberately copies an empty section.
        questionIds: z.array(id).max(10000).optional()
      })
      .strict()
  )
  .min(1)
  .max(1000);
export type CopySelection = z.infer<typeof copySelectionSchema>;
export const copyRequestSchema = z
  .object({
    destinationProjectId: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,199}$/),
    requestId: z.string().min(1).max(128),
    selection: copySelectionSchema,
    sourceSnapshot: z.array(z.number().int().min(0).max(255)).max(100000).optional()
  })
  .strict();
export type CopyRequest = z.infer<typeof copyRequestSchema>;
export interface ExamFragment {
  version: 1;
  sections: Section[];
  graphics: Exam['graphics'];
  codes: Exam['codes'];
}
export interface ExamPastePlan {
  fragment: ExamFragment;
  graphicIds: Record<string, string>;
}

export function extractExamFragment(source: Exam, input: CopySelection): ExamFragment {
  const selection = copySelectionSchema.parse(input);
  const requested = new Map(selection.map((s) => [s.sectionId, s]));
  if (requested.size !== selection.length) throw new Error('DUPLICATE_SELECTION');
  const sections = source.sections
    .filter((s) => requested.has(s.id))
    .map((s) => {
      const ids = requested.get(s.id)!.questionIds;
      if (
        ids &&
        (new Set(ids).size !== ids.length ||
          ids.some((id) => !s.questions.some((q) => q.id === id)))
      )
        throw new Error('INVALID_QUESTION_SELECTION');
      return { ...s, questions: s.questions.filter((q) => !ids || ids.includes(q.id)) };
    });
  if (sections.length !== requested.size) throw new Error('NOT_FOUND: section selection');
  const fragment: ExamFragment = {
    version: 1,
    sections: structuredClone(sections),
    graphics: {},
    codes: {}
  };
  for (const field of contentFields({ ...source, sections })) {
    for (const ref of htmlReferences(field.content)) {
      if (ref.tag === 'img') {
        if (!source.graphics[ref.id]) throw new Error(`NOT_FOUND: graphic/${ref.id}`);
        fragment.graphics[ref.id] = structuredClone(source.graphics[ref.id]);
      } else if (['code', 'pre'].includes(ref.tag) && !ref.inline) {
        if (!source.codes[ref.id]) throw new Error(`NOT_FOUND: code/${ref.id}`);
        fragment.codes[ref.id] = structuredClone(source.codes[ref.id]);
      }
    }
  }
  return fragment;
}

export function prepareExamPaste(fragment: ExamFragment): ExamPastePlan {
  if (fragment.version !== 1) throw new Error('INVALID_FRAGMENT_VERSION');
  const exam = normalizeExam({ ...fragment, source: '', properties: {} });
  // Validate dependencies before generating or publishing anything.
  extractExamFragment(
    exam,
    exam.sections.map((s) => ({ sectionId: s.id }))
  );
  const graphicIds: Record<string, string> = {};
  const codeIds: Record<string, string> = {};
  const graphics: Exam['graphics'] = {};
  const codes: Exam['codes'] = {};
  for (const graphic of Object.values(exam.graphics)) {
    const id = `g${uuid()}`;
    graphicIds[graphic.id] = id;
    graphics[id] = { ...graphic, id };
  }
  for (const code of Object.values(exam.codes)) {
    const id = `code${uuid()}`;
    codeIds[code.id] = id;
    codes[id] = { ...code, id };
  }
  const rewrite = (html: string): string => {
    const edits: { start: number; end: number; id: string }[] = [];
    const visit = (node: any) => {
      const attrs = Object.fromEntries((node.attrs || []).map((a: any) => [a.name, a.value]));
      let id: string | undefined;
      if (attrs.id && node.tagName === 'img') id = graphicIds[attrs.id];
      if (attrs.id && ['code', 'pre'].includes(node.tagName))
        id = 'data-border' in attrs ? `code${uuid()}` : codeIds[attrs.id];
      const location = node.sourceCodeLocation?.attrs?.id;
      if (id && location) edits.push({ start: location.startOffset, end: location.endOffset, id });
      for (const child of node.childNodes || []) visit(child);
    };
    visit(parseFragment(html, { sourceCodeLocationInfo: true }));
    // Only change reference attributes: preserve historic HTML formatting verbatim.
    for (const edit of edits.sort((a, b) => b.start - a.start))
      html = html.slice(0, edit.start) + `id="${edit.id}"` + html.slice(edit.end);
    return html;
  };
  const sections = exam.sections.map((s, order) => {
    const section = { ...s, id: `s${uuid()}`, order, content: rewrite(s.content) };
    section.questions = s.questions.map((q, order) => {
      const question = {
        ...q,
        id: `q${uuid()}`,
        section: section.id,
        order,
        content: rewrite(q.content)
      };
      if (q.answer !== undefined) question.answer = rewrite(q.answer);
      question.answers = q.answers.map((a, order) => ({
        ...a,
        id: `a${uuid()}`,
        question: question.id,
        order,
        content: rewrite(a.content)
      }));
      return question;
    });
    return section;
  });
  return { fragment: { version: 1, sections, graphics, codes }, graphicIds };
}

export function applyExamPaste(doc: Y.Doc, plan: ExamPastePlan, origin: unknown = null): string[] {
  const exam = normalizeExam({ ...plan.fragment, source: '', properties: {} });
  if (plan.fragment.version !== 1) throw new Error('INVALID_FRAGMENT_VERSION');
  extractExamFragment(
    exam,
    exam.sections.map((s) => ({ sectionId: s.id }))
  );
  const destination = readExam(doc);
  const occupied = new Set([
    ...['sections', 'questions', 'answers', 'graphics', 'codes'].flatMap((name) => [
      ...doc.getMap(name).keys()
    ]),
    ...contentFields(destination).flatMap((f) => htmlReferences(f.content).map((r) => r.id))
  ]);
  const entities = exam.sections.flatMap((s) => [
    s,
    ...s.questions.flatMap((q) => [q, ...q.answers])
  ]);
  for (const entity of [...entities, ...Object.values(exam.graphics), ...Object.values(exam.codes)])
    if (occupied.has(entity.id)) throw new Error(`ID_COLLISION: ${entity.id}`);
  for (const field of contentFields(exam))
    for (const ref of htmlReferences(field.content))
      if (['img', 'code', 'pre'].includes(ref.tag) && occupied.has(ref.id))
        throw new Error(`ID_COLLISION: ${ref.id}`);
  const order = Math.max(-1, ...destination.sections.map((s) => s.order || 0)) + 1;
  doc.transact(() => {
    for (const graphic of Object.values(exam.graphics)) putEntity(doc, 'graphics', graphic);
    for (const code of Object.values(exam.codes)) putEntity(doc, 'codes', code);
    exam.sections.forEach((s, index) => {
      s.order = order + index;
      putEntity(doc, 'sections', s);
      for (const q of s.questions) {
        putEntity(doc, 'questions', q);
        for (const a of q.answers) putEntity(doc, 'answers', a);
      }
    });
  }, origin);
  return exam.sections.map((s) => s.id);
}
