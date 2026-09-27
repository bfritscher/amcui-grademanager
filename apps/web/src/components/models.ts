export interface Project {
  project: string;
  status: {
    preview: string;
    locked?: string;
    printed: string;
    scanned: string;
    marked: string;
    annotated: string;
  };
  users: string[];
  prefix: string;
}

export interface User {
  username: string;
  exp: number;
  iat: number;
  authenticators: { label: string; type: string }[];
}

export interface Options {
  options: {
    [key: string]: string;
  };
  status: {
    preview?: string;
    locked: string;
    printed?: string;
    scanned?: string;
    marked?: string;
    annotated?: string;
  };
  users: string[];
}

export interface GitLog {
  date: string;
  msg: string;
  sha: string;
  type: string;
  username: string;
  diff: string;
}
export interface Exam {
  sections: Section[];
  properties: {
    [key: string]: string;
  };
  source: string;
  codes: {
    [key: string]: Code;
  };
  graphics: {
    [key: string]: Graphics;
  };
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

export type PartialAnswer = Partial<Answer>;

export type PartialQuestion = Partial<Omit<Question, 'answers'>> & {
  answers?: PartialAnswer[];
};

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

export interface UsedGraphics extends Graphics {
  used: boolean;
}

export interface Code {
  id: string;
  border: boolean;
  mode: string;
  numbers: boolean;
  content: string;
}

export interface ExamData {
  questions_definition: string;
  questions_layout: string;
  json: any;
  source?: any;
  codes?: any;
}

export interface Page {
  student: number;
  page: number;
  copy: number;
}

export interface PageZone extends Page {
  manual: number;
  type: number;
  id_a: number;
  id_b: number;
}

export interface PageScan extends Page {
  id: string;
  timestamp_manual: number;
  timestamp_auto: number;
  mse: number;
  s: number;
}

export interface Zone {
  answer: number;
  black: number;
  manual: number;
  question: number;
  total: number;
  x0: number;
  x1: number;
  x2: number;
  x3: number;
  y0: number;
  y1: number;
  y2: number;
  y3: number;
}

export interface PageCapture extends Page {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
  dpi: number;
  height: number;
  width: number;
  layout_image: string;
  mse: number;
  originalHeight: number;
  originalWidth: number;
  ratiox: number;
  ratioy: number;
  src: string;
  timestamp_auto: number;
  timestamp_manual: number;
}

export interface Score extends Page {
  id: string;
  max: number;
  question: number;
  score: number;
  title: string;
  why: string;
}

export interface GradeFile {
  data: any[];
  demoid: number;
  errors: any[];
  fileLookup: string;
  meta: {
    fields: string[];
    selected: { [key: number]: boolean };
    // all from Papa.parse
  };
  name: string;
  studentLookup: string;
}

export interface Stat {
  answers: {
    question: number;
    answer: number | string;
    nb: number;
    correct: number;
  }[];
  avg: number;
  indicative: number;
  max: number;
  question: number;
  title: string;
  total: number;
  type: number;
}

export interface Name extends Page {
  image: string;
  manual: string | null;
  auto: string | null;
}

export interface GradeRecord {
  id: string;
  key: string;
  student: number;
  copy: number;
  questions: { [key: string]: number };
  total: number;
  _unmatched?: boolean;
}

export interface GradeQuestion {
  max: number;
  question: number;
  pages: { [key: string]: number };
}

export interface AdminProject {
  students: number;
  commits: number;
  name: string;
  users: string[];
  size: number;
  folders: { [key: string]: number }[];
  error: string;
  detail?: boolean;
}

export interface AdminUser {
  username: string;
  projects: string[];
}

export interface AdminStats {
  projects: { [key: string]: AdminProject };
  users: { [key: string]: string[] };
}

export interface AdminDu {
  [key: string]: {
    total: number;
    folders: { [key: string]: number }[];
  };
}
