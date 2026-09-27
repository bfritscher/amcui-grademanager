import { useApiStore } from '@/stores/api';
import { useExamStore } from '@/stores/exam';
import type { Exam, Question } from '@/components/models';
import htmlToPlaintext from '@/utils/htmlToPlainText';

export function toImportText(exam: Exam): { text: string; exportedOpenQuestions: number } {
  const blocks: string[] = [];
  let questionNumber = 1;
  let exportedOpenQuestions = 0;

  exam.sections.forEach((section) => {
    section.questions.forEach((question) => {
      if (question.type === 'OPEN') {
        blocks.push(openQuestionToImportText(questionNumber, question));
        exportedOpenQuestions += 1;
      } else {
        blocks.push(questionToImportText(questionNumber, question));
      }
      questionNumber += 1;
    });
  });

  return {
    text: blocks.join('\n\n\n').trim(),
    exportedOpenQuestions
  };
}

export default function examToImportText() {
  const examStore = useExamStore();
  const API = useApiStore();
  const { text, exportedOpenQuestions } = toImportText(examStore.exam);

  const a = window.document.createElement('a');
  a.href = window.URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  a.download = API.project + '_import_format.txt';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  return {
    exportedQuestions: text ? text.split('\n\n\n').length : 0,
    exportedOpenQuestions
  };
}

function questionToImportText(questionNumber: number, question: Question): string {
  const questionText = cleanText(question.content) || 'Question';
  const answers = question.answers.map((answer, index) => `${index + 1}) ${cleanText(answer.content)}`);
  const correctAnswers = question.answers
    .map((answer, index) => (answer.correct ? String(index + 1) : ''))
    .filter(Boolean)
    .join(', ');

  return [
    `Question ${questionNumber}: ${questionText}`,
    ...answers,
    `Answer: ${correctAnswers || '1'}`
  ].join('\n');
}

function openQuestionToImportText(questionNumber: number, question: Question): string {
  const questionText = cleanText(question.content) || 'Question';
  const expectedAnswer = cleanText(question.answer || '');

  return [
    `Question ${questionNumber}: ${questionText}`,
    '[OPEN_QUESTION]',
    expectedAnswer ? `Expected answer: ${expectedAnswer}` : 'Expected answer:'
  ].join('\n');
}

function cleanText(text: string): string {
  return htmlToPlaintext(text)
    .replace(/\r\n/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();
}
