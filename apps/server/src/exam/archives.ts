import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';
import {Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import unzipper from 'unzipper';
import {normalizeExam, type Exam} from '@amcui/exam-core';

export function archivePath(name: string): string {
  const clean = name.endsWith('/') ? name.slice(0, -1) : name;
  if (
    !clean ||
    /[\\:\0]/.test(clean) ||
    clean
      .split('/')
      .some(
        (part) => !part || part === '.' || part === '..' || /[. ]$/.test(part),
      )
  )
    throw new Error('UNSAFE_ARCHIVE_PATH');
  return clean;
}

// Decompress into a fresh directory and validate the entire model before touching
// the project. The callback runs only after every entry has been checked.
export async function importArchive(
  file: string,
  projectFolder: string,
  commit: (exam: Exam) => void,
): Promise<Exam> {
  const directory = await unzipper.Open.file(file);
  if (directory.files.length > 10_000) throw new Error('ARCHIVE_TOO_LARGE');
  for (const entry of directory.files) archivePath(entry.path);
  const models = directory.files.filter(
    (entry) =>
      entry.type === 'File' &&
      path.posix.basename(entry.path) === 'data.json' &&
      !entry.path.split('/').includes('.git'),
  );
  if (models.length !== 1)
    throw new Error('Archive must contain exactly one data.json');
  const prefix = path.posix.dirname(models[0].path);
  const staging = await fs.mkdtemp(path.join(os.tmpdir(), 'amcui-import-'));
  let total = 0;
  try {
    const names = new Set<string>();
    for (const entry of directory.files) {
      if (
        entry.type !== 'File' ||
        (prefix !== '.' && !entry.path.startsWith(prefix + '/'))
      )
        continue;
      const name = archivePath(
        prefix === '.' ? entry.path : entry.path.slice(prefix.length + 1),
      );
      if (name.split('/').some((part) => part.toLowerCase() === '.git'))
        continue;
      if (((entry.externalFileAttributes >>> 16) & 0xf000) === 0xa000)
        throw new Error('ARCHIVE_SYMLINK');
      if (names.has(name.toLowerCase()))
        throw new Error('DUPLICATE_ARCHIVE_PATH');
      names.add(name.toLowerCase());
      if (entry.uncompressedSize > 64 * 1024 * 1024)
        throw new Error('ARCHIVE_TOO_LARGE');
      let current = path.resolve(projectFolder);
      for (const part of ['', ...name.split('/')]) {
        current = path.join(current, part);
        const stat = await fs.lstat(current).catch(() => null);
        if (stat?.isSymbolicLink()) throw new Error('ARCHIVE_SYMLINK');
      }
      const destination = path.join(staging, name);
      await fs.ensureDir(path.dirname(destination));
      let size = 0;
      await pipeline(
        entry.stream(),
        new Transform({
          transform(chunk, _encoding, callback) {
            size += chunk.length;
            total += chunk.length;
            callback(
              size > 64 * 1024 * 1024 || total > 512 * 1024 * 1024
                ? new Error('ARCHIVE_TOO_LARGE')
                : null,
              chunk,
            );
          },
        }),
        fs.createWriteStream(destination),
      );
    }
    const exam = normalizeExam(
      await fs.readJson(path.join(staging, 'data.json')),
    );
    await fs.copy(staging, projectFolder);
    commit(exam);
    return exam;
  } finally {
    await fs.remove(staging);
  }
}
