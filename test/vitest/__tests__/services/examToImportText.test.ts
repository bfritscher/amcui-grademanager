import { describe, it, expect } from 'vitest';
import { toImportText } from '../../../../src/services/examToImportText';
import type { Exam } from '../../../../src/components/models';

describe('examToImportText', () => {
  it('exports parser-compatible text with numbered answers and answer line', () => {
    const exam = {
      source: '',
      properties: {},
      codes: {},
      graphics: {},
      sections: [
        {
          id: 's1',
          title: 'Section 1',
          content: '',
          level: 1,
          isNumbered: true,
          isSectionTitleVisibleOnAMC: true,
          shuffle: false,
          columns: 1,
          pageBreakBefore: false,
          questions: [
            {
              id: 'q1',
              content: '<p>What is 2 + 2?</p>',
              type: 'SINGLE',
              layout: '',
              ordered: false,
              scoring: '',
              points: 1,
              dots: false,
              lines: 0,
              columns: 1,
              boxedAnswers: false,
              lineup: false,
              answers: [
                { id: 'a1', content: '<b>3</b>', correct: false },
                { id: 'a2', content: '<b>4</b>', correct: true }
              ]
            }
          ]
        }
      ]
    } as Exam;

    const { text, exportedOpenQuestions } = toImportText(exam);

    expect(text).toContain('Question 1: What is 2 + 2?');
    expect(text).toContain('1) 3');
    expect(text).toContain('2) 4');
    expect(text).toContain('Answer: 2');
    expect(exportedOpenQuestions).toBe(0);
  });

  it('exports OPEN questions with explicit marker', () => {
    const exam = {
      source: '',
      properties: {},
      codes: {},
      graphics: {},
      sections: [
        {
          id: 's1',
          title: 'Section 1',
          content: '',
          level: 1,
          isNumbered: true,
          isSectionTitleVisibleOnAMC: true,
          shuffle: false,
          columns: 1,
          pageBreakBefore: false,
          questions: [
            {
              id: 'q1',
              content: '<p>Explain recursion</p>',
              type: 'OPEN',
              layout: '',
              ordered: false,
              scoring: '',
              points: 1,
              dots: false,
              lines: 0,
              columns: 1,
              boxedAnswers: false,
              lineup: false,
              answers: []
            }
          ]
        }
      ]
    } as Exam;

    const { text, exportedOpenQuestions } = toImportText(exam);

    expect(text).toContain('Question 1: Explain recursion');
    expect(text).toContain('[OPEN_QUESTION]');
    expect(text).toContain('Expected answer:');
    expect(exportedOpenQuestions).toBe(1);
  });
});
