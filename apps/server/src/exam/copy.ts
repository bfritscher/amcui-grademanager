import fs from 'fs-extra';
import path from 'node:path';
import {createHash} from 'node:crypto';
import * as Y from 'yjs';
import type {RequestHandler} from 'express';
import {
  applyExamPaste,
  copyRequestSchema,
  extractExamFragment,
  prepareExamPaste,
  readExam,
  type CopyRequest,
  type ExamPastePlan,
} from '@amcui/exam-core';
import {ExamDocuments} from './documents.js';

export interface CopyResult {
  sectionIds: string[];
  sections: number;
  questions: number;
}
type Receipt = {fingerprint: string; result: CopyResult};

export class ExamCopy {
  constructor(
    private root: string,
    private documents: ExamDocuments,
  ) {}

  async copy(
    source: string,
    input: CopyRequest,
    actor: string,
  ): Promise<CopyResult> {
    ExamDocuments.projectName(source);
    const request = copyRequestSchema.parse(input);
    const destination = request.destinationProjectId;
    const key = createHash('sha256')
      .update(JSON.stringify([actor, request.requestId]))
      .digest('hex');
    const fingerprint = createHash('sha256')
      .update(JSON.stringify([source, request]))
      .digest('hex');
    const previous = (doc: Y.Doc) => {
      const receipt = doc.getMap<Receipt>('_copyReceipts').get(key);
      if (receipt && receipt.fingerprint !== fingerprint)
        throw new Error('REQUEST_ID_REUSED');
      return receipt?.result;
    };
    const completed = await this.documents.withDocument(destination, previous);
    if (completed) return completed;

    let staging: string | undefined;
    const published: string[] = [];
    let committed = false;
    try {
      // Never nest document locks: A -> B and B -> A must not deadlock.
      const plan = await this.documents.withDocument(source, async (doc) => {
        if (request.sourceSnapshot) {
          // A state vector alone misses pending deletions. Snapshots include the
          // delete set, so a copy cannot silently use content the browser removed.
          let expected: Y.Snapshot;
          try {
            expected = Y.decodeSnapshot(
              Uint8Array.from(request.sourceSnapshot),
            );
          } catch {
            throw new Error('INVALID_SOURCE_SNAPSHOT');
          }
          if (!Y.equalSnapshots(expected, Y.snapshot(doc)))
            throw new Error('SOURCE_NOT_SYNCED');
        }
        const plan = prepareExamPaste(
          extractExamFragment(readExam(doc), request.selection),
        );
        if (Object.keys(plan.graphicIds).length) {
          const parent = path.join(this.root, destination, 'src');
          await fs.ensureDir(parent);
          staging = await fs.mkdtemp(path.join(parent, '.copy-'));
          await this.stageGraphics(source, plan, staging);
        }
        return plan;
      });
      return await this.documents.withDocument(destination, async (doc) => {
        const completed = previous(doc);
        if (completed) return completed;
        if (staging) {
          const folder = path.join(this.root, destination, 'src', 'graphics');
          await fs.ensureDir(folder);
          for (const filename of await fs.readdir(staging)) {
            const target = path.join(folder, filename);
            await fs.move(path.join(staging, filename), target, {
              overwrite: false,
            });
            published.push(target);
          }
        }
        let result!: CopyResult;
        doc.transact(
          () => {
            const sectionIds = applyExamPaste(doc, plan);
            result = {
              sectionIds,
              sections: sectionIds.length,
              questions: plan.fragment.sections.reduce(
                (n, s) => n + s.questions.length,
                0,
              ),
            };
            // Persist the receipt with the content, including across server restarts.
            doc
              .getMap<Receipt>('_copyReceipts')
              .set(key, {fingerprint, result});
          },
          {actor, operation: 'exam.copy'},
        );
        committed = true;
        return result;
      });
    } catch (error) {
      // A persistence error after publication must not remove files referenced by
      // the live document. A retry will consult the receipt and await persistence.
      if (!committed)
        await Promise.all(published.map((file) => fs.remove(file)));
      throw error;
    } finally {
      if (staging) await fs.remove(staging);
    }
  }

  private async stageGraphics(
    source: string,
    plan: ExamPastePlan,
    staging: string,
  ) {
    const folder = path.join(this.root, source, 'src', 'graphics');
    const filenames = await fs.readdir(folder);
    for (const [oldId, newId] of Object.entries(plan.graphicIds)) {
      if (!/^[\w-]{1,200}$/.test(oldId)) throw new Error('INVALID_ASSET_ID');
      const names = filenames.filter(
        (name) =>
          name.startsWith(oldId) &&
          /^(\.(png|jpe?g|svg|pdf|excalidraw)|_thumb\.(png|jpg))$/i.test(
            name.slice(oldId.length),
          ),
      );
      const graphic = plan.fragment.graphics[newId];
      const extension = path.extname(graphic.name).toLowerCase();
      const hasOriginal =
        names.includes(oldId + extension) ||
        (extension === '.svg' && names.includes(oldId + '.pdf'));
      const hasRenderable = names.some(
        (name) =>
          /\.(png|jpe?g|svg|pdf)$/i.test(name) && !name.includes('_thumb.'),
      );
      if (!hasOriginal || !hasRenderable)
        throw new Error(`MISSING_GRAPHIC_FILE: ${oldId}`);
      for (const name of names)
        await fs.copy(
          path.join(folder, name),
          path.join(staging, newId + name.slice(oldId.length)),
          {overwrite: false, errorOnExist: true},
        );
    }
    // Code files are renderer output; legacy code lives in the fragment and
    // inline code lives in HTML. Both are materialized on preview/print.
  }
}

export function copyContentHandler(
  copy: ExamCopy,
  allowed: (username: string, project: string) => Promise<boolean>,
  operation?: <T>(projects: string[], run: () => Promise<T>) => Promise<T>,
): RequestHandler {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        res.sendStatus(403);
        return;
      }
      const input = copyRequestSchema.safeParse(req.body);
      if (!input.success) {
        res.status(400).json({error: 'INVALID_COPY_REQUEST'});
        return;
      }
      const source = String(req.params.project);
      ExamDocuments.projectName(source);
      if (
        !(await allowed(req.user.username, source)) ||
        !(await allowed(req.user.username, input.data.destinationProjectId))
      ) {
        res.sendStatus(403);
        return;
      }
      const username = req.user.username;
      const run = () =>
        copy.copy(source, input.data, JSON.stringify([username, 'web']));
      res.json(
        await (operation
          ? operation([source, input.data.destinationProjectId], run)
          : run()),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (
        /^(NOT_FOUND|INVALID_|MISSING_GRAPHIC_FILE|DUPLICATE_SELECTION|REQUEST_ID_REUSED|SOURCE_NOT_SYNCED)/.test(
          message,
        )
      ) {
        res.status(409).json({error: message});
        return;
      }
      next(error);
    }
  };
}
