import {it, expect} from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';
import express from 'express';
import request from 'supertest';
import {execFileSync, spawnSync} from 'node:child_process';
import {
  isThumbnail,
  makeThumbnail,
  missingThumbnails,
  resolveThumbnail,
} from '../src/exam/thumbnails.js';

it('serves PNG for both thumbnail URLs, falls back to legacy JPEG, and leaves originals alone', async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'amcui-thumbs-'));
  const app = express();
  app.get('/:filename', (req, res) =>
    res.sendFile(resolveThumbnail(path.join(folder, req.params.filename))),
  );
  try {
    await fs.writeFile(path.join(folder, 'image_thumb.jpg'), 'legacy');
    await request(app)
      .get('/image_thumb.png')
      .expect('Content-Type', /image\/jpeg/)
      .expect(200);
    await fs.writeFile(path.join(folder, 'image_thumb.png'), 'transparent');
    for (const extension of ['jpg', 'png']) {
      const response = await request(app)
        .get(`/image_thumb.${extension}`)
        .expect('Content-Type', /image\/png/)
        .expect(200);
      expect(response.body.toString()).toBe('transparent');
    }
    await fs.writeFile(path.join(folder, 'original.jpg'), 'original');
    await fs.writeFile(path.join(folder, 'original.png'), 'other');
    const original = await request(app)
      .get('/original.jpg')
      .expect('Content-Type', /image\/jpeg/)
      .expect(200);
    expect(original.body.toString()).toBe('original');
    await request(app).get('/missing_thumb.png').expect(404);
  } finally {
    await fs.remove(folder);
  }
});

it('migrates legacy PNG previews without rebuilding legacy JPEG/PDF previews or converting sidecars', () => {
  const files = [
    'alpha.png',
    'alpha_thumb.jpg',
    'ready.png',
    'ready_thumb.png',
    'photo.jpg',
    'photo_thumb.jpg',
    'document.pdf',
    'document_thumb.jpg',
    'new.pdf',
    'diagram.svg',
    'diagram.pdf',
    'diagram.excalidraw',
    '.thumbnail-staging',
    'name_thumb.jpg.backup',
  ];
  expect(missingThumbnails(files)).toEqual([
    'alpha.png',
    'new.pdf',
    'diagram.pdf',
  ]);
  expect(files.filter(isThumbnail)).toEqual([
    'alpha_thumb.jpg',
    'ready_thumb.png',
    'photo_thumb.jpg',
    'document_thumb.jpg',
  ]);
});

const hasGraphicsMagick =
  spawnSync('gm', ['version'], {windowsHide: true}).status === 0;
it.skipIf(!hasGraphicsMagick)(
  'preserves transparent pixels with the real converter and retains legacy output on failure',
  async () => {
    const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'amcui-alpha-'));
    try {
      execFileSync('gm', [
        'convert',
        '-size',
        '5x5',
        'xc:none',
        '-fill',
        '#ff000080',
        '-draw',
        'point 1,1 point 3,3',
        path.join(folder, 'alpha.png'),
      ]);
      await makeThumbnail(folder, 'alpha.png', 'alpha');
      const rgba = execFileSync('gm', [
        'convert',
        path.join(folder, 'alpha_thumb.png'),
        '-depth',
        '8',
        'RGBA:-',
      ]);
      const alpha = [...rgba].filter((_, index) => index % 4 === 3);
      expect(alpha).toContain(0);
      expect(alpha.some((value) => value > 0 && value < 255)).toBe(true);
      await fs.writeFile(path.join(folder, 'legacy_thumb.jpg'), 'legacy');
      await expect(
        makeThumbnail(folder, 'missing.png', 'legacy'),
      ).rejects.toThrow();
      expect(
        await fs.readFile(
          resolveThumbnail(path.join(folder, 'legacy_thumb.png')),
          'utf8',
        ),
      ).toBe('legacy');
      expect(
        (await fs.readdir(folder)).some((name) =>
          name.startsWith('.thumbnail-'),
        ),
      ).toBe(false);
    } finally {
      await fs.remove(folder);
    }
  },
);
