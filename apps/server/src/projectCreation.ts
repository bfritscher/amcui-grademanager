import fs from 'fs-extra';
import path from 'node:path';
import slug from 'slug';
import type {RequestHandler} from 'express';
import xml2js from 'xml2js';
import {readExam, replaceExam} from '@amcui/exam-core';
import type {ExamDocuments} from './exam/documents.js';
import {hasControlCharacters, projectPath} from './security/paths.js';
import {asyncHandler} from './security/login.js';

export class ProjectCreationError extends Error {
  constructor(readonly code: 'INVALID_PROJECT' | 'PROJECT_EXISTS') {
    super(
      code === 'PROJECT_EXISTS'
        ? 'PROJECT_EXISTS: Choose another name. To access an existing project, use Options > Add editor access.'
        : 'INVALID_PROJECT: Choose a non-reserved project name of up to 200 characters without path separators.',
    );
  }
}

export function projectCreationHandler(
  creator: ProjectCreator,
): RequestHandler {
  return asyncHandler(async (req, res) => {
    if (!req.user) return res.sendStatus(403);
    try {
      res.send(await creator.create(req.body.project, req.user.username));
    } catch (error) {
      if (!(error instanceof ProjectCreationError)) throw error;
      res.status(403).send('Project already exists!');
    }
  });
}

export function projectCopyHandler(
  creator: ProjectCreator,
  documents: ExamDocuments,
): RequestHandler {
  return asyncHandler(async (req, res) => {
    if (!req.user) return res.sendStatus(403);
    const source = req.params.project;
    let destination: string;
    try {
      destination = await creator.create(
        req.body.project.toLowerCase(),
        req.user.username,
      );
    } catch (error) {
      if (!(error instanceof ProjectCreationError)) throw error;
      res.status(403).send('Project already exists!');
      return;
    }
    await documents.withDocument(source, async (doc) => {
      const snapshot = readExam(doc);
      await fs.copy(
        projectPath(creator.root, source, 'src'),
        projectPath(creator.root, destination, 'src'),
      );
      const sourceOptions = await xml2js.parseStringPromise(
        await fs.readFile(
          projectPath(creator.root, source, 'options.xml'),
          'utf8',
        ),
        {explicitArray: false},
      );
      const targetOptions = await xml2js.parseStringPromise(
        await fs.readFile(
          projectPath(creator.root, destination, 'options.xml'),
          'utf8',
        ),
        {explicitArray: false},
      );
      for (const [key, value] of Object.entries(sourceOptions.project))
        if (!/mail|email|liste|assoc|student|archive/i.test(key))
          targetOptions.project[key] = value;
      await fs.writeFile(
        projectPath(creator.root, destination, 'options.xml'),
        new xml2js.Builder().buildObject(targetOptions),
      );
      await fs.writeJson(
        projectPath(creator.root, destination, 'data.json'),
        snapshot,
      );
      await documents.withDocument(destination, (target) =>
        replaceExam(target, snapshot),
      );
    });
    res.sendStatus(200);
  });
}

/** Shared by the browser and MCP; reserves the directory before any side effects. */
export class ProjectCreator {
  constructor(
    readonly root: string,
    private assets: string,
    private addAccess: (project: string, username: string) => Promise<void>,
    private initialize: (project: string, root: string) => void = () => {},
  ) {}

  async create(name: string, username: string): Promise<string> {
    if (
      typeof name !== 'string' ||
      !name.trim() ||
      name.length > 200 ||
      /[\\/]/.test(name) ||
      hasControlCharacters(name)
    )
      throw new ProjectCreationError('INVALID_PROJECT');
    const project = slug(name, {fallback: false});
    if (
      ['admin', 'list', 'recent', 'create', 'login', 'profile', 'mcp'].includes(
        project,
      )
    )
      throw new ProjectCreationError('INVALID_PROJECT');
    let root: string;
    try {
      root = projectPath(this.root, project);
    } catch {
      throw new ProjectCreationError('INVALID_PROJECT');
    }
    try {
      // Non-recursive mkdir is exclusive, including when two clients use the same name.
      await fs.mkdir(root);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST')
        throw new ProjectCreationError('PROJECT_EXISTS');
      throw error;
    }
    await Promise.all(
      [
        'cr/corrections/jpg',
        'cr/corrections/pdf',
        'cr/zooms',
        'cr/diagnostic',
        'data',
        'scans',
        'exports',
        'out',
        'pdf',
        'src/graphics',
        'src/codes',
      ].map((directory) => fs.ensureDir(path.join(root, directory))),
    );
    await Promise.all(
      [
        ['options.xml', 'options.xml'],
        ['students.csv', 'students.csv'],
        ['gitignore.template', '.gitignore'],
      ].map(([source, target]) =>
        fs.copyFile(path.join(this.assets, source), path.join(root, target)),
      ),
    );
    await this.addAccess(project, username);
    this.initialize(project, root);
    return project;
  }
}
