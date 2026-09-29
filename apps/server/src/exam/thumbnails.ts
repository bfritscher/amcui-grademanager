import fs from 'fs-extra';
import path from 'node:path';
import {spawn} from 'node:child_process';

export const isThumbnail = (filename: string) =>
  /_thumb\.(png|jpg)$/i.test(filename);

// Old clients and projects use .jpg URLs; serve the best available thumbnail
// with sendFile's actual content type, regardless of the requested extension.
export function resolveThumbnail(filename: string): string {
  if (!isThumbnail(filename)) return filename;
  const stem = filename.replace(/\.(png|jpg)$/i, '');
  for (const extension of ['png', 'jpg']) {
    const candidate = `${stem}.${extension}`;
    if (fs.existsSync(candidate)) return candidate;
  }
  return filename;
}

export function missingThumbnails(files: string[]): string[] {
  const sources = files.filter(
    (name) => !isThumbnail(name) && /\.(png|jpe?g|pdf)$/i.test(name),
  );
  const seen = new Set<string>();
  return sources.filter((name) => {
    const id = path.parse(name).name;
    if (seen.has(id)) return false;
    seen.add(id);
    // Rebuild legacy PNG previews to recover the alpha channel from the original.
    return (
      !files.includes(`${id}_thumb.png`) &&
      (/\.png$/i.test(name) || !files.includes(`${id}_thumb.jpg`))
    );
  });
}

export async function makeThumbnail(
  folder: string,
  filename: string,
  id: string,
): Promise<void> {
  const staging = await fs.mkdtemp(path.join(folder, '.thumbnail-'));
  try {
    const output = path.join(staging, `${id}_thumb.png`);
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        'gm',
        [
          'convert',
          '-density',
          '120',
          filename + '[0]',
          '-trim',
          '+repage',
          output,
        ],
        {cwd: folder, windowsHide: true},
      );
      const timeout = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error('Thumbnail generation timed out'));
      }, 60_000);
      child.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.on('close', (code) => {
        clearTimeout(timeout);
        if (code === 0) {
          resolve();
        } else {
          reject(new Error('Thumbnail generation failed'));
        }
      });
    });
    // Publish only complete images, leaving a legacy thumbnail usable on failure.
    await fs.move(output, path.join(folder, `${id}_thumb.png`), {
      overwrite: true,
    });
  } finally {
    await fs.remove(staging);
  }
}
