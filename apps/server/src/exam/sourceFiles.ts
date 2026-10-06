import fs from 'fs-extra';
import type {RenderedExam} from './previews.js';
import {InvalidPath, projectPath, safeId} from '../security/paths.js';

export function validateSourceFiles(
  root: string,
  project: string,
  body: RenderedExam,
): void {
  if (
    !body ||
    typeof body !== 'object' ||
    !['json', 'source', 'questions_definition', 'questions_layout'].every(
      (key) => typeof body[key as keyof RenderedExam] === 'string',
    ) ||
    !body.codes ||
    typeof body.codes !== 'object' ||
    Array.isArray(body.codes)
  )
    throw new InvalidPath();
  for (const [id, code] of Object.entries(body.codes)) {
    projectPath(root, project, 'src/codes', safeId(id));
    if (!code || typeof code.content !== 'string') throw new InvalidPath();
  }
  for (const file of [
    'out',
    'pdf',
    'data.json',
    'source.tex',
    'questions_definition.tex',
    'questions_layout.tex',
  ])
    projectPath(root, project, file);
}

export function saveSourceFilesSync(
  root: string,
  project: string,
  body: RenderedExam,
): void {
  // Reject the entire request before removing output or changing working files.
  validateSourceFiles(root, project, body);
  const out = projectPath(root, project, 'out');
  for (const item of fs.readdirSync(out))
    fs.unlinkSync(projectPath(root, project, 'out', item));
  for (const [file, content] of Object.entries({
    'data.json': body.json,
    'source.tex': body.source,
    'questions_definition.tex': body.questions_definition,
    'questions_layout.tex': body.questions_layout,
  }))
    fs.writeFileSync(projectPath(root, project, file), content);
  for (const [id, code] of Object.entries(body.codes))
    fs.writeFileSync(
      projectPath(root, project, 'src/codes', safeId(id)),
      code.content,
    );
}
