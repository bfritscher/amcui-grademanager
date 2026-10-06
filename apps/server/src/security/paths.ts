import fs from 'node:fs';
import path from 'node:path';

export class InvalidPath extends Error {
  status = 400;
  constructor() {
    super('Invalid project file path');
  }
}

export const hasControlCharacters = (value: string): boolean =>
  [...value].some((character) => character.charCodeAt(0) < 32);

export function safeId(value: unknown): string {
  if (typeof value !== 'string' || !/^[\w-]{1,200}$/.test(value))
    throw new InvalidPath();
  return value;
}

export function safeFilename(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value ||
    value === '.' ||
    value === '..' ||
    /[\\/:<>|?*]/.test(value) ||
    hasControlCharacters(value) ||
    /[. ]$/.test(value) ||
    /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value)
  )
    throw new InvalidPath();
  return value;
}

// Validate every component before filesystem access, including existing symlinks.
export function projectPath(
  root: string,
  project: unknown,
  ...parts: string[]
): string {
  const name = safeFilename(safeId(project));
  if (!/^[a-zA-Z0-9]/.test(name)) throw new InvalidPath();
  const components = [name];
  for (const part of parts) {
    if (
      typeof part !== 'string' ||
      path.isAbsolute(part) ||
      /[\\:]/.test(part) ||
      hasControlCharacters(part)
    )
      throw new InvalidPath();
    for (const component of part.split('/'))
      components.push(safeFilename(component));
  }
  let current = path.resolve(root);
  for (const component of components) {
    current = path.join(current, component);
    try {
      if (fs.lstatSync(current).isSymbolicLink()) throw new InvalidPath();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  return current;
}
