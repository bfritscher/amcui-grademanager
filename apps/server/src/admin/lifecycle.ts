import fs from 'fs-extra';
import type {RequestHandler} from 'express';
import {AdminError, AdminStore} from './store.js';
import {projectPath} from '../security/paths.js';
import {asyncHandler} from '../security/login.js';

export class ProjectLifecycle {
  private operations = new Map<string, number>();
  constructor(
    readonly store: AdminStore,
    readonly root: string,
  ) {}
  async state(project: string): Promise<'active' | 'archiving' | 'archived'> {
    projectPath(this.root, project);
    const status = await this.store.redis.HGETALL(
      'project:' + project + ':status',
    );
    if (status.archiving === '1') return 'archiving';
    if (
      status.archived ||
      (await fs.pathExists(
        projectPath(this.root, project, '.archive/manifest.json'),
      ))
    )
      return 'archived';
    return 'active';
  }
  begin(project: string) {
    this.operations.set(project, (this.operations.get(project) || 0) + 1);
    let released = false;
    return () => {
      if (!released) {
        released = true;
        this.operations.set(
          project,
          Math.max(0, (this.operations.get(project) || 1) - 1),
        );
      }
    };
  }
  async writable(project: string) {
    if ((await this.state(project)) !== 'active')
      throw new AdminError('Project is archived or being archived', 409);
  }
  async operation<T>(
    projects: string[],
    write: boolean,
    run: () => Promise<T>,
  ): Promise<T> {
    const unique = [...new Set(projects)];
    // Reserve leases before asynchronous state checks so archiving can drain them.
    const releases = unique.map((project) => this.begin(project));
    try {
      for (const project of unique) {
        const state = await this.state(project);
        if (state === 'archiving' || (write && state === 'archived'))
          throw new AdminError('Project is archived or being archived', 409);
      }
      return await run();
    } finally {
      releases.forEach((release) => release());
    }
  }
  middleware: RequestHandler = asyncHandler(async (req, res, next) => {
    const project = req.params.project;
    // These collection routes do not address a project.
    if (['list', 'recent', 'create'].includes(project)) {
      next();
      return;
    }
    projectPath(this.root, project);
    const releases = [this.begin(project)];
    const release = () => releases.forEach((done) => done());
    // A client disconnect does not mean its asynchronous disk mutation stopped.
    // Keep the lease until the handler ends its response, even on a closed socket.
    const end = res.end;
    res.end = function (this: typeof res, ...args: any[]) {
      release();
      return end.apply(this, args as any);
    } as typeof res.end;
    res.once('finish', release);
    const state = await this.state(project);
    const copy =
      req.method === 'POST' &&
      /^\/copy\/(project|content|graphics|codes)$/.test(req.path);
    const read =
      req.method === 'GET' &&
      (/^\/archive(?:\/|$)/.test(req.path) ||
        req.path === '/options' ||
        /^\/static\/src\//.test(req.path));
    const publishedRead =
      read &&
      (await fs.pathExists(
        projectPath(this.root, project, '.archive/manifest.json'),
      ));
    if (
      (state === 'archiving' && !publishedRead) ||
      (state === 'archived' && !(copy || read))
    )
      throw new AdminError('Project is archived or being archived', 409);
    if (copy && req.path !== '/copy/project') {
      const destination = req.body?.destinationProjectId || req.body?.project;
      projectPath(this.root, destination);
      releases.push(this.begin(destination));
      await this.writable(destination);
    }
    next();
  });
  async drain(project: string) {
    const deadline = Date.now() + 10 * 60_000;
    while (this.operations.get(project)) {
      if (Date.now() > deadline)
        throw new AdminError(
          'Project operations did not finish; retry archiving later',
          409,
        );
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}
