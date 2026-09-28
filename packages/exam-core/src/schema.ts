import { z } from 'zod';
import { parseFragment } from 'parse5';

// Validate the parsed HTML, rather than trying to sanitize HTML with regular expressions.
// Keep this module browser-safe: parse5 does not execute code or fetch resources.
export function assertSafeHtml(value: string): void {
  const allowed = new Set(
    'p br b strong i em u s sub sup span div mark var tt code pre ul ol li table tbody thead tfoot tr td th h1 h2 h3 h4 h5 h6 hr img blockquote'.split(
      ' '
    )
  );
  const attributes = new Set(
    'id class style colspan rowspan start value spellcheck data-gutter data-border data-width data-options data-language data-highlight-language data-numbers data-lexical-text data-lexical-code'.split(
      ' '
    )
  );
  const visit = (node: any) => {
    if (node.tagName && !allowed.has(node.tagName))
      throw new Error(`Unsupported HTML element: ${node.tagName}`);
    for (const { name, value: attributeValue } of node.attrs || []) {
      if (!attributes.has(name)) throw new Error(`Unsupported HTML attribute: ${name}`);
      if (
        name === 'style' &&
        !attributeValue
          .split(';')
          .every(
            (declaration: string) =>
              !declaration.trim() ||
              /^\s*(text-align|font-weight|font-style|text-decoration|vertical-align|white-space|color|background-color|width)\s*:\s*[-#(),.%\w\s]+$/i.test(
                declaration
              )
          )
      ) {
        throw new Error('Unsupported inline style');
      }
    }
    for (const child of node.childNodes || []) visit(child);
  };
  visit(parseFragment(value));
}
export const htmlSchema = z
  .string()
  .max(500_000)
  .superRefine((value, ctx) => {
    try {
      assertSafeHtml(value);
    } catch (error) {
      ctx.addIssue({ code: 'custom', message: (error as Error).message });
    }
  })
  .describe('HTML, not Markdown. Use <p> for paragraphs and <code>identifier</code> for inline monospace. Escape literal < and &. Use code_block_upsert for multiline code. Preserve existing image and code references when replacing content.');
const id = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[\w-]+$/);
const integer = z.number().int().finite();
export const sectionPatchSchema = z
  .object({
    title: z.string().max(2000).describe('Section heading; use plain text. Empty hides the heading.'),
    content: htmlSchema,
    level: integer.min(0).max(2).describe('Heading level: 0 section, 1 subsection, 2 subsubsection. Sections remain an ordered flat list.'),
    isNumbered: z.boolean().describe('Show automatic section numbering.'),
    isSectionTitleVisibleOnAMC: z.boolean().describe('Include the section heading on the AMC answer sheet.'),
    shuffle: z.boolean().describe('Shuffle questions within this section when generating exam copies.'),
    columns: integer.min(1).max(10).describe('Number of columns for questions within the section; default 1.'),
    pageBreakBefore: z.boolean().describe('Start this section on a new page.')
  })
  .partial()
  .strict();
export const questionPatchSchema = z
  .object({
    content: htmlSchema,
    type: z.enum(['SINGLE', 'MULTIPLE', 'OPEN']).describe('SINGLE: exactly one correct choice. MULTIPLE: zero or more correct explicit choices. Both require choices. OPEN: written response, with solution in answer.'),
    layout: z.enum(['VERTICAL', 'HORIZONTAL']).describe('Choice arrangement; default VERTICAL. Applies to SINGLE and MULTIPLE.'),
    ordered: z.boolean().describe('Preserve choice order instead of allowing AMC to shuffle choices; default false.'),
    scoring: z.string().max(2000).describe('Advanced AMC scoring expression for a choice question, not a points number. Preserve unless explicitly requested; empty uses template defaults.'),
    points: integer.min(1).max(1000).describe('Maximum manual score for OPEN questions; default 1. Does not set choice-question scoring.'),
    dots: z.boolean().describe('Use dotted writing lines for OPEN questions; default false.'),
    lines: integer.min(0).max(1000).describe('OPEN answer-space size; default 3. Normally number of lines; with lineup enabled, height of the drawn box in centimetres.'),
    columns: integer.min(1).max(10).describe('Number of columns for answer choices; default 1.'),
    boxedAnswers: z.boolean().describe('Use AMC boxed answer layout for choices; multiple columns also enable this layout.'),
    lineup: z.boolean().describe('OPEN: use the alternative AMC lineup layout with a response box sized by lines; default false.'),
    answer: htmlSchema.describe('OPEN question model solution in HTML, not the list of selectable answers. Inline monospace uses <code>; multiline code uses code_block_upsert with field="answer".')
  })
  .partial()
  .strict();
export const answerPatchSchema = z
  .object({
    content: htmlSchema,
    correct: z.boolean().describe('Whether this choice is correct. SINGLE needs exactly one correct choice.'),
    scoring: z.string().max(2000).describe('Advanced AMC scoring override for this choice; empty uses defaults.')
  })
  .partial()
  .strict();
export const operationSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('section.create'), fields: sectionPatchSchema.default({}) }),
  z.object({ op: z.literal('section.update'), id, fields: sectionPatchSchema }),
  z.object({ op: z.literal('section.move'), id, afterId: id.nullable() }),
  z.object({ op: z.literal('section.delete'), id }),
  z.object({
    op: z.literal('question.create'),
    sectionId: id,
    fields: questionPatchSchema.default({}),
    answers: z.array(answerPatchSchema).max(100).optional()
  }),
  z.object({ op: z.literal('question.update'), id, fields: questionPatchSchema }),
  z.object({ op: z.literal('question.move'), id, sectionId: id, afterId: id.nullable() }),
  z.object({ op: z.literal('question.duplicate'), id, sectionId: id.optional() }),
  z.object({ op: z.literal('question.delete'), id }),
  z.object({
    op: z.literal('answer.create'),
    questionId: id,
    fields: answerPatchSchema.default({})
  }),
  z.object({ op: z.literal('answer.update'), id, fields: answerPatchSchema }),
  z.object({ op: z.literal('answer.move'), id, questionId: id, afterId: id.nullable() }),
  z.object({ op: z.literal('answer.delete'), id })
]);
export const operationsSchema = z.array(operationSchema).min(1).max(100);
export type ExamOperation = z.infer<typeof operationSchema>;
