export interface Exam {
  sections: Section[];
  properties: Record<string, string>;
  source: string;
  codes: Record<string, Code>;
  graphics: Record<string, Graphics>;
}
export interface Section {
  id: string;
  title: string;
  content: string;
  level: number;
  isNumbered: boolean;
  isSectionTitleVisibleOnAMC: boolean;
  shuffle: boolean;
  columns: number;
  pageBreakBefore: boolean;
  questions: Question[];
  number?: string;
  order?: number;
}
export interface Question {
  id: string;
  content: string;
  type: string;
  layout: string;
  ordered: boolean;
  scoring: string;
  points: number;
  dots: boolean;
  lines: number;
  columns: number;
  boxedAnswers: boolean;
  lineup: boolean;
  answers: Answer[];
  answer?: string;
  number?: number;
  isValid?: boolean;
  section?: string;
  order?: number;
}
export interface Answer {
  id: string;
  content: string;
  correct: boolean;
  question?: string;
  order?: number;
  scoring?: string;
}
export interface Graphics {
  id: string;
  border: boolean;
  width: number;
  name: string;
  options?: string;
  updatedAt?: string;
}
export interface Code {
  id: string;
  border: boolean;
  mode: string;
  numbers: boolean;
  content: string;
}
export type PartialAnswer = Partial<Answer>;
export type PartialQuestion = Partial<Omit<Question, 'answers'>> & { answers?: PartialAnswer[] };
export interface Diagnostic {
  code: string;
  entityId: string;
  message: string;
}
