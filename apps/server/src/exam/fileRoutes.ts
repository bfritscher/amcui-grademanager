import fs from 'fs-extra';
import path from 'node:path';
import type {Express, RequestHandler} from 'express';
import {projectPath, safeFilename, safeId} from '../security/paths.js';
import {isThumbnail, resolveThumbnail} from './thumbnails.js';
import {asyncHandler} from '../security/login.js';

export function installProjectFileRoutes(
  app: Express,
  root: string,
  fallbackImage: string,
  authorize: RequestHandler,
  upload: RequestHandler,
  thumbnail: (folder: string, filename: string, id: string) => Promise<void>,
  convertSvg: (bytes: Buffer) => Promise<Buffer>,
) {
  app.get('/project/:project/static/:file*', authorize, (req, res, next) => {
    try {
      const file = req.params.file + (req.params[0] || '');
      const target = resolveThumbnail(
        projectPath(root, req.params.project, file),
      );
      // Thumbnail fallback may select a different file; validate that file too.
      const checked = projectPath(
        root,
        req.params.project,
        path
          .relative(projectPath(root, req.params.project), target)
          .split(path.sep)
          .join('/'),
      );
      res.sendFile(checked, (error) => {
        if (!error) return;
        if (isThumbnail(file) || file.endsWith('.jpg'))
          res.sendFile(fallbackImage);
        else if (!res.headersSent) res.sendStatus(404);
      });
    } catch (error) {
      next(error);
    }
  });

  app.post(
    '/project/:project/upload/graphics',
    authorize,
    upload,
    asyncHandler(async (req, res, next) => {
      try {
        if (!req.file) return res.status(400).send('No file uploaded');
        const id = safeId(req.body?.id);
        const extension = path
          .extname(safeFilename(req.file.originalname))
          .slice(1)
          .toLowerCase();
        if (!['jpg', 'jpeg', 'png', 'svg', 'pdf'].includes(extension))
          return res.sendStatus(415);
        const folder = projectPath(root, req.params.project, 'src/graphics');
        const filename = `${id}.${extension === 'svg' ? 'pdf' : extension}`;
        const destination = projectPath(
          root,
          req.params.project,
          'src/graphics',
          filename,
        );
        const drawing = projectPath(
          root,
          req.params.project,
          'src/graphics',
          `${id}.excalidraw`,
        );
        if (extension === 'svg') {
          await fs.writeFile(
            destination,
            await convertSvg(await fs.readFile(req.file.path)),
          );
          if (typeof req.body.excalidraw === 'string')
            await fs.writeFile(drawing, req.body.excalidraw);
        } else await fs.copy(req.file.path, destination);
        await thumbnail(folder, filename, id);
        res.sendStatus(200);
      } catch (error) {
        next(error);
      } finally {
        if (req.file) await fs.remove(req.file.path);
      }
    }),
  );

  app.post('/project/:project/graphics/delete', authorize, (req, res, next) => {
    try {
      const id = safeId(req.body?.id);
      const extension = path
        .extname(safeFilename(req.body?.filename))
        .slice(1)
        .toLowerCase();
      if (!['jpg', 'jpeg', 'png', 'svg', 'pdf'].includes(extension))
        return res.sendStatus(400);
      // Resolve everything before deleting anything.
      const files = [
        `${id}.${extension}`,
        `${id}_thumb.png`,
        `${id}_thumb.jpg`,
        `${id}.excalidraw`,
      ].map((file) =>
        projectPath(root, req.params.project, 'src/graphics', file),
      );
      fs.unlinkSync(files[0]);
      for (const file of files.slice(1))
        if (fs.existsSync(file)) fs.unlinkSync(file);
      res.sendStatus(200);
    } catch (error) {
      next(error);
    }
  });
}
