import { useExamStore } from '@/stores/exam';
import { createRenderer, renderExam } from '@amcui/exam-core/render';
export default function examToLatex() {
  return renderExam(useExamStore().exam, document);
}
export function html2Latex(content: string, isAnswer = false) {
  return createRenderer(useExamStore().exam, document).html2Latex(content, isAnswer);
}
