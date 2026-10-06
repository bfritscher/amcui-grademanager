import fs from 'fs-extra';
import path from 'node:path';
import {randomUUID, createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {JSDOM} from 'jsdom';
import {readExam, normalizeExam, type Exam} from '@amcui/exam-core';
import {renderExam} from '@amcui/exam-core/render';
import {ExamDocuments} from './documents.js';
import {validateSourceFiles} from './sourceFiles.js';

export interface PreviewJob {
  id: string;
  project: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  createdAt: string;
  snapshotHash: string;
  log: string;
  error?: string;
  instance: string;
}
export type RenderedExam = ReturnType<typeof renderExam>;
export function renderSnapshot(exam: Exam): RenderedExam {
  const dom = new JSDOM();
  try {
    return renderExam(exam, dom.window.document);
  } finally {
    dom.window.close();
  }
}
async function writeJob(file: string, job: PreviewJob) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  await fs.writeJson(temporary, job);
  await fs.rename(temporary, file);
}
export class ExamPreviews {
  private queues = new Map<string, Promise<unknown>>();
  private counts = new Map<string, number>();
  private instance = randomUUID();
  constructor(
    private projectsRoot: string,
    private documents: ExamDocuments,
    private publish: (
      project: string,
      username: string,
      body: RenderedExam,
      pdf: string,
    ) => Promise<void>,
    private notify: (project: string, event: Record<string, unknown>) => void,
    private compile = compilePreview,
  ) {}
  private folder(project: string, id: string) {
    ExamDocuments.projectName(project);
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error('INVALID_PREVIEW_ID');
    return path.join(this.projectsRoot, '.previews', project, id);
  }
  async wait(project: string) { await this.queues.get(project); }
  async enqueue(project: string, username: string, rendered?: RenderedExam) {
    ExamDocuments.projectName(project);
    if (rendered) validateSourceFiles(this.projectsRoot, project, rendered);
    if ((this.counts.get(project) || 0) >= 20)
      throw new Error('PREVIEW_QUEUE_FULL');
    this.counts.set(project, (this.counts.get(project) || 0) + 1);
    const id = randomUUID(),
      folder = this.folder(project, id);
    try {
      await this.prune(project);
      // The snapshot and assets are captured before returning the job ID.
      const exam = await this.documents.withDocument(project, async (doc) => {
        const exam = rendered ? normalizeExam(rendered.json) : readExam(doc);
        if (!(rendered?.source || exam.source))
          throw new Error('MISSING_TEMPLATE');
        await fs.ensureDir(folder);
        const src = path.join(this.projectsRoot, project, 'src');
        if (await fs.pathExists(src))
          await fs.copy(src, path.join(folder, 'src'));
        await fs.writeJson(path.join(folder, 'exam.json'), exam);
        return exam;
      });
      const job: PreviewJob = {
        id,
        project,
        status: 'queued',
        createdAt: new Date().toISOString(),
        snapshotHash: createHash('sha256')
          .update(JSON.stringify(exam))
          .digest('hex'),
        log: '',
        instance: this.instance,
      };
      await writeJob(path.join(folder, 'job.json'), job);
      const queue = (this.queues.get(project) || Promise.resolve())
        .catch(() => {})
        .then(() => this.run(job, exam, username, rendered));
      this.queues.set(project, queue);
      void queue
        .finally(() => {
          this.counts.set(project, (this.counts.get(project) || 1) - 1);
          if (this.queues.get(project) === queue) this.queues.delete(project);
        })
        .catch(() => {});
      return job;
    } catch (error) {
      this.counts.set(project, (this.counts.get(project) || 1) - 1);
      await fs.remove(folder);
      throw error;
    }
  }
  private async prune(project: string) {
    const root = path.join(this.projectsRoot, '.previews', project);
    if (!(await fs.pathExists(root))) return;
    const cutoff = Date.now() - 7 * 24 * 3600 * 1000;
    for (const id of await fs.readdir(root)) {
      if (!/^[0-9a-f-]{36}$/.test(id)) continue;
      const folder = this.folder(project, id);
      // Stat the snapshot directory, never traverse a supplied filesystem path.
      const stat = await fs.lstat(folder);
      if (
        !stat.isDirectory() ||
        stat.isSymbolicLink() ||
        stat.mtimeMs >= cutoff
      )
        continue;
      const job = (await fs
        .readJson(path.join(folder, 'job.json'))
        .catch(() => null)) as PreviewJob | null;
      if (
        job?.instance === this.instance &&
        ['queued', 'running'].includes(job.status)
      )
        continue;
      await fs.remove(folder);
    }
  }
  private async run(
    job: PreviewJob,
    exam: Exam,
    username: string,
    rendered?: RenderedExam,
  ) {
    const folder = this.folder(job.project, job.id);
    const update = () => writeJob(path.join(folder, 'job.json'), job);
    try {
      job.status = 'running';
      await update();
      this.notify(job.project, {
        action: 'start',
        msg: 'preview',
        command: 'prepare',
        jobId: job.id,
      });
      const body = rendered || renderSnapshot(exam);
      await fs.ensureDir(path.join(folder, 'out'));
      await fs.ensureDir(path.join(folder, 'src', 'codes'));
      for (const [filename, data] of Object.entries({
        'source.tex': body.source,
        'questions_definition.tex': body.questions_definition,
        'questions_layout.tex': body.questions_layout,
        'data.json': body.json,
      }))
        await fs.writeFile(path.join(folder, filename), data);
      for (const [id, code] of Object.entries(body.codes)) {
        if (!/^[\w-]{1,200}$/.test(id)) throw new Error('INVALID_CODE_ID');
        await fs.writeFile(path.join(folder, 'src', 'codes', id), code.content);
      }
      await this.compile(folder, (chunk) => {
        job.log = (job.log + chunk).slice(-65_536);
        this.notify(job.project, {
          action: 'log',
          msg: 'preview',
          command: 'prepare',
          data: chunk,
          jobId: job.id,
        });
      });
      const pdf = path.join(folder, 'out', 'out.pdf');
      if (!(await fs.pathExists(pdf)))
        throw new Error('Compiler did not produce a PDF');
      await this.publish(job.project, username, body, pdf);
      job.status = 'succeeded';
    } catch (error) {
      job.status = 'failed';
      job.error = (error as Error).message;
    }
    await update();
    this.notify(job.project, {
      action: 'end',
      msg: 'preview',
      command: 'prepare',
      code: job.status === 'succeeded' ? 0 : 1,
      jobId: job.id,
    });
  }
  async get(project: string, id: string): Promise<PreviewJob> {
    const file = path.join(this.folder(project, id), 'job.json');
    if (!(await fs.pathExists(file))) throw new Error('NOT_FOUND: preview');
    const job: PreviewJob = await fs.readJson(file);
    if (
      job.instance !== this.instance &&
      ['queued', 'running'].includes(job.status)
    ) {
      job.status = 'failed';
      job.error = 'Server restarted before preview completed';
      await writeJob(file, job);
    }
    return job;
  }
  async download(project: string, id: string) {
    const job = await this.get(project, id);
    if (job.status !== 'succeeded') throw new Error('PREVIEW_NOT_READY');
    return (
      await fs.readFile(path.join(this.folder(project, id), 'out', 'out.pdf'))
    ).toString('base64');
  }
}
export async function compilePreview(
  folder: string,
  log: (chunk: string) => void,
): Promise<void> {
  const dataFolder = path.join(folder, 'data');
  await fs.ensureDir(dataFolder);
  return new Promise((resolve, reject) => {
    const child = spawn(
      'auto-multiple-choice',
      [
        'prepare',
        '--with',
        'pdflatex',
        '--filter',
        'latex',
        '--out-corrige',
        'out/out.pdf',
        '--mode',
        'k',
        '--n-copies',
        '1',
        'source.tex',
        '--latex-stdout',
        '--data',
        dataFolder,
      ],
      {
        cwd: folder,
        detached: process.platform !== 'win32',
        env: {
          ...process.env,
          openin_any: 'p',
          openout_any: 'p',
          shell_escape: 'f',
        },
      },
    );
    const timeout = setTimeout(() => {
      if (process.platform !== 'win32' && child.pid) {
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch {
          child.kill('SIGKILL');
        }
      } else child.kill('SIGKILL');
      reject(new Error('Preview compilation timed out'));
    }, 120_000);
    child.stdout.on('data', (data) => log(data.toString()));
    child.stderr.on('data', (data) => log(data.toString()));
    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve();
      else reject(new Error(`Preview compiler exited with ${code}`));
    });
  });
}
