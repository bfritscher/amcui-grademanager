import fs from 'fs-extra';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {DatabaseSync} from 'node:sqlite';
import Papa from 'papaparse';
import {PDFDocument, StandardFonts} from 'pdf-lib';
import {parseStringPromise} from 'xml2js';
import {finalGrades, type Exam} from '@amcui/exam-core';
import {projectPath} from '../security/paths.js';

const execute = promisify(execFile);
export interface DiskProject {
  name: string;
  bytes: number;
  folders: Record<string, number>;
  students: number | null;
  commits: number | null;
  measuredAt: number;
  archivedAt?: number;
  error?: string;
}
export interface ArchiveFile {
  id: string;
  label: string;
  filename: string;
  bytes: number;
  pages?: number;
  sha256: string;
}
export interface ResultsSnapshot {
  columns: string[];
  rows: Record<string, unknown>[];
  questions: {id: number; title: string; max: number}[];
  scores: Record<string, unknown>[];
  associations: Record<string, unknown>[];
  options: Record<string, string>;
}
export interface ArchiveManifest {
  version: 1;
  project: string;
  archivedAt: number;
  actor: string;
  files: ArchiveFile[];
  copies: {
    student: number;
    copy: number;
    firstPage: number;
    pages: number;
    id: string | null;
  }[];
  bytesBefore: number;
  resultsSha256: string;
  examSha256: string;
}

export async function directoryBytes(folder: string): Promise<number> {
  let bytes = 0;
  for (const entry of await fs.readdir(folder, {withFileTypes: true})) {
    const filename = path.join(folder, entry.name);
    const stat = await fs.lstat(filename);
    if (stat.isSymbolicLink())
      throw new Error('Symbolic links require manual review');
    bytes += stat.isDirectory() ? await directoryBytes(filename) : stat.size;
  }
  return bytes;
}

export async function measureProject(
  root: string,
  name: string,
): Promise<DiskProject> {
  const folder = projectPath(root, name);
  const result: DiskProject = {
    name,
    bytes: 0,
    folders: {},
    students: null,
    commits: null,
    measuredAt: Date.now(),
  };
  for (const entry of await fs.readdir(folder, {withFileTypes: true})) {
    const filename = projectPath(root, name, entry.name);
    const stat = await fs.lstat(filename);
    const size = stat.isDirectory()
      ? await directoryBytes(filename)
      : stat.size;
    result.bytes += size;
    result.folders[entry.name] = size;
  }
  if (await fs.pathExists(path.join(folder, '.archive/manifest.json'))) {
    result.archivedAt = (
      await fs.readJson(path.join(folder, '.archive/manifest.json'))
    ).archivedAt;
    const results = (await fs.readJson(
      path.join(folder, '.archive/results.json'),
    )) as ResultsSnapshot;
    result.students = results.rows.filter((row) => !row._unmatched).length;
    result.commits = 0;
  } else {
    const csv = path.join(folder, 'students.csv');
    if (await fs.pathExists(csv))
      result.students = Papa.parse(await fs.readFile(csv, 'utf8'), {
        header: true,
        skipEmptyLines: true,
      }).data.length;
    if (await fs.pathExists(path.join(folder, '.git'))) {
      try {
        const {stdout} = await execute('git', ['rev-list', '--count', 'HEAD'], {
          cwd: folder,
          timeout: 30_000,
        });
        result.commits = Number(stdout.trim());
      } catch {
        result.error = 'Git history unavailable';
      }
    }
  }
  return result;
}

async function database(file: string) {
  if (!(await fs.pathExists(file)))
    throw new Error('Required AMC database is missing: ' + path.basename(file));
  // Synchronous SQLite stays inside the disk worker; Node 24 supplies its runtime.
  const db = new DatabaseSync(file, {readOnly: true});
  const all = async <T extends Record<string, any> = Record<string, any>>(
    sql: string,
  ): Promise<T[]> => db.prepare(sql).all() as T[];
  const close = async () => {
    db.close();
  };
  try {
    const check = await all('PRAGMA quick_check');
    if (check.some((row) => Object.values(row)[0] !== 'ok'))
      throw new Error(
        'AMC database integrity check failed: ' + path.basename(file),
      );
  } catch (error) {
    await close();
    throw error;
  }
  return {all, close};
}
const quote = (value: string) => "'" + value.replaceAll("'", "''") + "'";

export function makeResults(
  csv: string,
  scores: Record<string, any>[],
  associations: Record<string, any>[],
  options: Record<string, string>,
): ResultsSnapshot {
  const parsed = Papa.parse<Record<string, unknown>>(csv, {
    header: true,
    dynamicTyping: (field) => field !== 'id',
    skipEmptyLines: true,
  });
  if (parsed.errors.length)
    throw new Error('Student CSV requires correction before archiving');
  const columns = [...(parsed.meta.fields || [])];
  if (!columns.includes('id'))
    throw new Error('Student CSV must contain an id column');
  if (
    columns.some((name) =>
      ['__proto__', 'constructor', 'prototype'].includes(name),
    )
  )
    throw new Error('Unsupported student column name');
  const rows = parsed.data.map((row) => ({...row}));
  const ids = rows.map((row) => String(row.id));
  if (
    ids.some((id) => !id || id === 'undefined' || id === 'null') ||
    new Set(ids).size !== ids.length
  )
    throw new Error('Student identifiers must be unique');
  const questions = [
    ...new Map(
      scores.map((score) => [
        score.question,
        {id: score.question, title: score.title, max: score.max},
      ]),
    ).values(),
  ];
  if (
    new Set(questions.map((question) => question.title)).size !==
    questions.length
  )
    throw new Error(
      'Duplicate question titles require review before archiving',
    );
  const settings = {...options};
  settings.points_max ||= String(
    questions.reduce((sum, question) => sum + Number(question.max), 0),
  );
  settings.final_grade_formula ||= 'row.Grade';
  const copies = new Map<
    string,
    {id: string | null; total: number; questions: Record<string, number>}
  >();
  for (const score of scores) {
    if (!Number.isFinite(score.score) || !Number.isFinite(score.max))
      throw new Error('Invalid AMC score');
    const key = `${score.student}:${score.copy}`;
    const copy = copies.get(key) || {
      id: score.id == null ? null : String(score.id),
      total: 0,
      questions: {},
    };
    copy.total += score.score;
    copy.questions[score.title] = score.score;
    copies.set(key, copy);
  }
  const linked = new Set<string>();
  for (const row of rows) {
    const matches = [...copies].filter(
      ([, copy]) => copy.id === String(row.id),
    );
    if (matches.length > 1)
      throw new Error(
        'Multiple answer sheets associated with one student require review before archiving',
      );
    if (!matches.length) {
      if (
        (row.Grade !== '' && row.Grade != null) ||
        (row.FinalGrade !== '' && row.FinalGrade != null)
      )
        throw new Error(
          'Saved grades without corresponding AMC scores require review',
        );
      row._key = 'student:' + row.id;
      continue;
    }
    const [key, copy] = matches[0];
    linked.add(key);
    const grades = finalGrades(row, copy.total, settings);
    for (const field of ['Total', 'Grade', 'FinalGrade'] as const) {
      if (
        row[field] === '' ||
        row[field] == null ||
        !Number.isFinite(Number(row[field])) ||
        Math.abs(Number(row[field]) - grades[field]) > 1e-8
      )
        throw new Error(
          'Saved grades differ from current results; open and finalize the grades page before archiving',
        );
    }
    Object.assign(row, grades, {
      _key: 'student:' + row.id,
      _copy: key,
      questions: copy.questions,
    });
  }
  for (const [key, copy] of copies)
    if (!linked.has(key))
      rows.push({
        _key: 'copy:' + key,
        _copy: key,
        _unmatched: true,
        id: copy.id,
        Total: copy.total,
        questions: copy.questions,
      });
  for (const field of ['Total', 'Grade', 'FinalGrade'])
    if (!columns.includes(field)) columns.push(field);
  return {columns, rows, questions, scores, associations, options: settings};
}

async function pdfReport(project: string, results: ResultsSnapshot) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const safe = (value: unknown) =>
    [...String(value ?? '')]
      .map((char) => {
        try {
          font.encodeText(char);
          return char;
        } catch {
          return '?';
        }
      })
      .join('');
  let page = pdf.addPage([842, 595]);
  let y = 560;
  const line = (text: string, size = 9) => {
    if (y < 35) {
      page = pdf.addPage([842, 595]);
      y = 560;
    }
    page.drawText(safe(text).slice(0, 145), {x: 30, y, size, font});
    y -= size + 7;
  };
  line(project + ' — Final grades', 15);
  // Include every column and question value; wrap instead of truncating records.
  for (const row of results.rows) {
    line(
      `Student: ${row.id ?? 'unmatched'} | Copy: ${row._copy ?? 'none'}`,
      11,
    );
    for (const name of results.columns) {
      const text = `${name}: ${String(row[name] ?? '')}`;
      for (let offset = 0; offset < text.length; offset += 130)
        line(text.slice(offset, offset + 130));
    }
    for (const [name, value] of Object.entries((row.questions || {}) as object))
      line(`${name}: ${value}`);
    y -= 10;
  }
  return pdf.save();
}

const hash = (data: Buffer | Uint8Array | string) =>
  createHash('sha256').update(data).digest('hex');
export async function verifyArchive(
  root: string,
  project: string,
  location = '.archive',
) {
  const folder = projectPath(root, project, location);
  const manifest = (await fs.readJson(
    path.join(folder, 'manifest.json'),
  )) as ArchiveManifest;
  if (manifest.version !== 1 || manifest.project !== project)
    throw new Error('Invalid archive manifest');
  for (const [name, expected] of [
    ['results.json', manifest.resultsSha256],
    ['exam.json', manifest.examSha256],
  ])
    if (
      hash(await fs.readFile(projectPath(root, project, location, name))) !==
      expected
    )
      throw new Error('Archive snapshot checksum mismatch');
  for (const file of manifest.files) {
    const bytes = await fs.readFile(
      projectPath(root, project, location, file.filename),
    );
    if (hash(bytes) !== file.sha256)
      throw new Error('Archive document checksum mismatch');
    if (
      file.pages !== undefined &&
      (await PDFDocument.load(bytes)).getPageCount() !== file.pages
    )
      throw new Error('Archive PDF page count mismatch');
  }
  return manifest;
}

export async function prepareArchive(
  root: string,
  project: string,
  exam: Exam,
  actor: string,
  progress: (message: string) => void = () => {},
) {
  const folder = projectPath(root, project);
  if (await fs.pathExists(path.join(folder, '.archive/manifest.json')))
    return verifyArchive(root, project);
  const stage = projectPath(root, project, '.archive-staging');
  if (await fs.pathExists(stage)) await fs.remove(stage);
  const bytesBefore = await directoryBytes(folder);
  const xml = await parseStringPromise(
    await fs.readFile(projectPath(root, project, 'options.xml'), 'utf8'),
    {explicitArray: false},
  );
  const options = (xml.project || xml.projetAMC) as Record<string, string>;
  if (!options) throw new Error('Invalid project options');
  const capture = await database(
    projectPath(root, project, 'data/capture.sqlite'),
  );
  let pages: Record<string, any>[];
  let failed: Record<string, any>[];
  let scores: Record<string, any>[];
  let associations: Record<string, any>[];
  try {
    for (const name of ['layout', 'association', 'scoring']) {
      const filename = projectPath(root, project, 'data/' + name + '.sqlite');
      const check = await database(filename);
      await check.close();
      await capture.all(`ATTACH DATABASE ${quote(filename)} AS ${name}`);
    }
    pages = await capture.all(
      'SELECT student,page,copy,src,timestamp_auto,timestamp_manual,timestamp_annotate FROM capture_page WHERE timestamp_auto>0 OR timestamp_manual>0 ORDER BY student,copy,page',
    );
    failed = await capture.all('SELECT filename FROM capture_failed');
    associations = await capture.all(
      'SELECT student,copy,manual,auto FROM association_association',
    );
    scores = await capture.all(
      'SELECT COALESCE(aa.manual,aa.auto) AS id,ss.*,st.title FROM scoring_score ss JOIN scoring_title st ON ss.question=st.question JOIN scoring_question sq ON ss.question=sq.question AND ss.student=sq.student AND sq.indicative=0 LEFT JOIN association_association aa ON aa.student=ss.student AND aa.copy=ss.copy ORDER BY ss.student,ss.copy,ss.question',
    );
  } finally {
    await capture.close();
  }
  if (!pages.length || !scores.length)
    throw new Error('Archive requires finalized grading and corrected papers');
  const relativeScan = (value: unknown) => {
    let filename = String(value).replace(/^%PROJET\//, '');
    if (path.isAbsolute(filename)) filename = path.relative(folder, filename);
    return normalizeScan(projectPath(root, project, filename));
  };
  const normalizeScan = (filename: string) =>
    process.platform === 'win32'
      ? path.normalize(filename).toLowerCase()
      : path.normalize(filename);
  const represented = new Set([
    ...pages.map((page) => relativeScan(page.src)),
    ...failed.map((row) => relativeScan(row.filename)),
  ]);
  const checkScans = async (directory: string) => {
    for (const entry of await fs.readdir(directory, {withFileTypes: true})) {
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) await checkScans(filename);
      else if (!represented.has(normalizeScan(filename)))
        throw new Error(
          'An unreferenced scan requires review before archiving: ' +
            path.relative(folder, filename),
        );
    }
  };
  if (await fs.pathExists(projectPath(root, project, 'scans')))
    await checkScans(projectPath(root, project, 'scans'));
  const capturedCopies = new Set(
    pages.map((page) => `${page.student}:${page.copy}`),
  );
  const scoredCopies = new Set(
    scores.map((score) => `${score.student}:${score.copy}`),
  );
  if (
    [...capturedCopies].some((key) => !scoredCopies.has(key)) ||
    [...scoredCopies].some((key) => !capturedCopies.has(key))
  )
    throw new Error('Captured copies and scored copies do not match');
  if (
    pages.some(
      (page) =>
        Number(page.timestamp_annotate || 0) <
        Math.max(
          Number(page.timestamp_auto || 0),
          Number(page.timestamp_manual || 0),
        ),
    )
  )
    throw new Error(
      'Some corrected pages are stale; annotate all papers before archiving',
    );
  const csv = await fs.readFile(
    projectPath(root, project, 'students.csv'),
    'utf8',
  );
  const results = makeResults(csv, scores, associations, options);
  const report = await database(
    projectPath(root, project, 'data/report.sqlite'),
  );
  let reports: Record<string, any>[];
  let directories: Record<string, any>[];
  try {
    reports = await report.all(
      'SELECT student,copy,file FROM report_student WHERE type=1',
    );
    directories = await report.all(
      'SELECT type,directory FROM report_directory',
    );
  } finally {
    await report.close();
  }
  const reportDirectory = String(
    directories.find((row) => row.type === 1)?.directory ||
      'cr/corrections/pdf',
  );
  const manifest: ArchiveManifest = {
    version: 1,
    project,
    archivedAt: Date.now(),
    actor,
    files: [],
    copies: [],
    bytesBefore,
    resultsSha256: '',
    examSha256: '',
  };
  await fs.ensureDir(stage);
  const save = async (
    id: string,
    label: string,
    filename: string,
    bytes: Uint8Array | Buffer | string,
    pageCount?: number,
  ) => {
    await fs.writeFile(path.join(stage, filename), bytes);
    manifest.files.push({
      id,
      label,
      filename,
      bytes: Buffer.byteLength(bytes),
      pages: pageCount,
      sha256: hash(bytes),
    });
  };
  progress('Verifying final papers');
  const combined = await PDFDocument.create();
  const copies = [
    ...new Set(pages.map((page) => `${page.student}:${page.copy}`)),
  ];
  for (const key of copies) {
    const copyPages = pages.filter(
      (page) => `${page.student}:${page.copy}` === key,
    );
    const item = reports.find((row) => `${row.student}:${row.copy}` === key);
    if (!item) throw new Error('A captured copy has no final PDF: ' + key);
    const source = projectPath(
      root,
      project,
      reportDirectory,
      String(item.file),
    );
    const pdf = await PDFDocument.load(await fs.readFile(source));
    if (pdf.getPageCount() !== copyPages.length)
      throw new Error('Final PDF does not cover every captured page: ' + key);
    const firstPage = combined.getPageCount() + 1;
    for (const page of await combined.copyPages(pdf, pdf.getPageIndices()))
      combined.addPage(page);
    const association = associations.find(
      (row) => `${row.student}:${row.copy}` === key,
    );
    manifest.copies.push({
      student: copyPages[0].student,
      copy: copyPages[0].copy,
      firstPage,
      pages: pdf.getPageCount(),
      id: association ? (association.manual ?? association.auto ?? null) : null,
    });
  }
  await save(
    'papers',
    'All corrected papers',
    'papers.pdf',
    await combined.save(),
    combined.getPageCount(),
  );
  if (failed.length) {
    progress('Preserving unrecognized scans');
    const unrecognized = await PDFDocument.create();
    for (const row of failed) {
      let filename = String(row.filename).replace(/^%PROJET\//, '');
      if (path.isAbsolute(filename))
        filename = path.relative(folder, filename).split(path.sep).join('/');
      const source = projectPath(root, project, filename);
      let pdf: PDFDocument;
      if (/\.pdf$/i.test(source))
        pdf = await PDFDocument.load(await fs.readFile(source));
      else {
        const converted = path.join(stage, 'unrecognized-page.pdf');
        await execute('gm', ['convert', source, converted], {timeout: 60_000});
        pdf = await PDFDocument.load(await fs.readFile(converted));
        await fs.remove(converted);
      }
      for (const page of await unrecognized.copyPages(
        pdf,
        pdf.getPageIndices(),
      ))
        unrecognized.addPage(page);
    }
    await save(
      'unrecognized',
      'Unrecognized submitted pages',
      'unrecognized.pdf',
      await unrecognized.save(),
      unrecognized.getPageCount(),
    );
  }
  // Final reference documents live in out/; preserve all of its PDFs without lossy rewriting.
  for (const filename of await fs.readdir(projectPath(root, project, 'out')))
    if (/\.pdf$/i.test(filename)) {
      const bytes = await fs.readFile(
        projectPath(root, project, 'out', filename),
      );
      if (manifest.files.some((file) => file.sha256 === hash(bytes))) continue;
      const pdf = await PDFDocument.load(bytes);
      await save(
        'document-' + manifest.files.length,
        filename,
        'document-' + manifest.files.length + '.pdf',
        bytes,
        pdf.getPageCount(),
      );
    }
  const subject = String(options.doc_question || 'sujet.pdf');
  if (!(await fs.pathExists(projectPath(root, project, 'out', subject))))
    throw new Error('Final subject PDF is missing');
  const resultsJson = JSON.stringify(results);
  const examJson = JSON.stringify(exam);
  await fs.writeFile(path.join(stage, 'results.json'), resultsJson);
  manifest.resultsSha256 = hash(resultsJson);
  await fs.writeFile(path.join(stage, 'exam.json'), examJson);
  manifest.examSha256 = hash(examJson);
  const exportRows = results.rows.map((row) =>
    Object.fromEntries([
      ...results.columns.map((name) => [name, row[name] ?? '']),
      ['Copy', row._copy ?? ''],
      ...results.questions.map((question) => [
        question.title,
        ((row.questions || {}) as Record<string, unknown>)[question.title] ??
          '',
      ]),
    ]),
  );
  await save(
    'grades-csv',
    'Final grades (CSV)',
    'grades.csv',
    Papa.unparse(exportRows, {escapeFormulae: true}),
  );
  const gradesPdf = await pdfReport(project, results);
  await save(
    'grades-pdf',
    'Final grades (PDF)',
    'grades.pdf',
    gradesPdf,
    (await PDFDocument.load(gradesPdf)).getPageCount(),
  );
  await fs.writeJson(path.join(stage, 'manifest.json'), manifest);
  await verifyArchive(root, project, '.archive-staging');
  // Publish the independently readable snapshot before touching working inputs.
  await fs.writeJson(projectPath(root, project, 'data.json'), exam);
  await fs.move(stage, projectPath(root, project, '.archive'), {
    overwrite: false,
  });
  return manifest;
}

export async function cleanupArchive(root: string, project: string) {
  const manifest = await verifyArchive(root, project);
  const folder = projectPath(root, project);
  for (const name of ['.git', 'scans', 'cr', 'data', 'exports', 'out', 'pdf']) {
    const target = projectPath(root, project, name);
    if (await fs.pathExists(target)) await fs.remove(target);
  }
  for (const filename of await fs.readdir(folder))
    if (
      /^amc-compiled\./.test(filename) ||
      /^(source|questions_definition|questions_layout)\.(aux|log|toc|out|synctex\.gz)$/.test(
        filename,
      )
    )
      await fs.remove(projectPath(root, project, filename));
  const previews = projectPath(root, project); // Preview cache is outside the working directory.
  const previewRoot = path.join(root, '.previews', path.basename(previews));
  if (await fs.pathExists(previewRoot)) {
    const stat = await fs.lstat(path.join(root, '.previews'));
    if (stat.isSymbolicLink() || (await fs.lstat(previewRoot)).isSymbolicLink())
      throw new Error('Preview cache contains symbolic links');
    await fs.remove(previewRoot);
  }
  await verifyArchive(root, project);
  return {
    bytesBefore: manifest.bytesBefore,
    bytesAfter: await directoryBytes(folder),
  };
}
