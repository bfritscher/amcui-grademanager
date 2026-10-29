import Sentry from './sentry.js';

import fs from 'fs-extra';
import StreamSplitter from 'stream-splitter';
import cors from 'cors';
import {createServer} from 'http';
import express from 'express';
import {Server} from 'socket.io';
import errorHandler from 'errorhandler';
import sqlite3 from 'sqlite3';
import path from 'path';
import jwt from 'jsonwebtoken';
import {authorize} from '@thream/socketio-jwt';
import {expressjwt, Request as JWTRequest} from 'express-jwt';
import bcrypt from 'bcrypt';
import {createClient, type RedisClientType} from 'redis';
import xml2js from 'xml2js';
import ACL from 'acl2';
import multer from 'multer';
import tmp from 'tmp';
import childProcess from 'child_process';
import {simpleGit} from 'simple-git';
import {ZipArchive} from 'archiver';
import slug from 'slug';
import {imageSizeFromFile} from 'image-size/fromFile';
import {fileURLToPath} from 'url';
import {dirname} from 'path';
import {authenticator} from 'otplib';
import QRCode from 'qrcode';
import {Factor, Fido2Lib} from 'fido2-lib';
import * as base64buffer from 'base64-arraybuffer';
import {WebSocketServer} from 'ws';
import fetch from 'node-fetch';
import {readExam, replaceExam} from '@amcui/exam-core';
import {installProjectFileRoutes} from './exam/fileRoutes.js';
import {projectPath, safeFilename} from './security/paths.js';
import {
  validateLogin,
  validatePassword,
  validatePasswordChange,
  asyncHandler,
} from './security/login.js';
import {
  configureProxyTrust,
  createRateLimits,
  credentialRoutes,
  redisRateLimitStores,
} from './security/rateLimits.js';
import {saveSourceFilesSync, validateSourceFiles} from './exam/sourceFiles.js';
import {importArchive, streamArchive} from './exam/archives.js';

import {URL} from 'url';
import {LeveldbPersistence} from 'y-leveldb';
import {ExamDocuments} from './exam/documents.js';
import {ExamCopy, copyContentHandler} from './exam/copy.js';
import {ExamAssets} from './exam/assets.js';
import {
  isThumbnail,
  makeThumbnail,
  missingThumbnails,
} from './exam/thumbnails.js';
import {ExamPreviews, renderSnapshot} from './exam/previews.js';
import {ExamOAuth} from './mcp/oauth.js';
import {installMcp} from './mcp/routes.js';
import {AdminStore} from './admin/store.js';
import {AdminError} from './admin/store.js';
import {ZodError} from 'zod';
import {AdminMail} from './admin/mail.js';
import {AdminAccounts} from './admin/accounts.js';
import {ProjectLifecycle} from './admin/lifecycle.js';
import {
  ProjectCreator,
  projectCreationHandler,
  projectCopyHandler,
} from './projectCreation.js';
import {AdminService} from './admin/service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

slug.defaults.mode = 'rfc3986';

function str2ab(str: string) {
  const enc = new TextEncoder();
  return enc.encode(str);
}

if (!process.env.JWT_SECRET) {
  /* c8 ignore next */
  throw new Error('JWT_SECRET env variable must be set!');
}

// This allows TypeScript to detect our global value
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User;
    }
    interface User {
      username: string;
    }
  }
}

const app = express();
configureProxyTrust(app, process.env.AMCUI_TRUST_PROXY);
Sentry.setupExpressErrorHandler(app);

const APP_FOLDER = path.resolve(__dirname, '../src/');
const PROJECTS_FOLDER =
  process.env.AMCUI_PROJECTS_DIR || path.resolve(__dirname, '../projects/');
const TEMPLATES_FOLDER =
  process.env.AMCUI_TEMPLATES_DIR || path.resolve(__dirname, '../templates/');
await fs.ensureDir(PROJECTS_FOLDER);

const redisClient = (await createClient({
  socket: {port: 6379, host: 'redis'},
  disableOfflineQueue: true,
})
  .on('error', (err) => {
    console.log('Redis error ' + err);
    Sentry.captureException(err);
  })
  .connect()) as RedisClientType;
const acl = new ACL(new ACL.redisBackend({redis: redisClient, prefix: 'acl'}));
const adminStore = new AdminStore(redisClient);
const accountMail = new AdminMail(adminStore);
const accounts = new AdminAccounts(adminStore, accountMail, acl);
const lifecycle = new ProjectLifecycle(adminStore, PROJECTS_FOLDER);

const f2l = new Fido2Lib({
  rpName: 'AMCUI',
});

async function addProjectAcl(project: string, username: string | undefined) {
  if (!username) return;
  //role, resource, permission
  await acl.allow(project, '/project/' + project, 'admin');
  //user, role
  await acl.addUserRoles(username, project);
}

const corsOptions: cors.CorsOptions = {
  origin: true,
  credentials: true,
  exposedHeaders: [
    'Accept-Ranges',
    'Content-Encoding',
    'Content-Length',
    'Content-Range',
    'Retry-After',
    'RateLimit',
    'RateLimit-Policy',
  ],
};

app.use(cors(corsOptions));
const limits = createRateLimits(
  redisRateLimitStores((...args) => redisClient.sendCommand(args)),
);
// Reject excessive requests before parsing bodies or performing authentication.
app.use((_req, res, next) => {
  const start = performance.now();
  res.once('finish', () => {
    const ms = performance.now() - start;
    administration.metrics.requests++;
    administration.metrics.latencyMs += ms;
    administration.metrics.maxLatencyMs = Math.max(
      administration.metrics.maxLatencyMs,
      ms,
    );
    if (res.statusCode >= 500) administration.metrics.errors++;
    if (res.statusCode === 429) administration.metrics.throttled++;
  });
  next();
});
app.use(limits.api);
app.use(credentialRoutes, limits.authIp);

const httpServer = createServer(app);
const ws = new Server(httpServer, {cors: corsOptions});

ws.use(
  authorize({
    secret: process.env.JWT_SECRET,
  }),
);
ws.use((socket, next) => {
  void accounts
    .active(
      socket.decodedToken.username,
      socket.decodedToken.sessionVersion || 0,
    )
    .then((active) =>
      next(active ? undefined : new Error('Account access revoked')),
    )
    .catch(next);
});
accounts.disconnect = async (username) => {
  for (const socket of ws.sockets.sockets.values())
    if (socket.decodedToken?.username === username) socket.disconnect(true);
};

const wss = new WebSocketServer({noServer: true, maxPayload: 5 * 1024 * 1024});
if (process.env.MCP_ENABLED === 'true' && !process.env.YPERSISTENCE)
  throw new Error('YPERSISTENCE is required for MCP');
const documentPersistence = process.env.YPERSISTENCE
  ? new LeveldbPersistence(process.env.YPERSISTENCE)
  : null;
const documents = new ExamDocuments(
  documentPersistence,
  async (project) => {
    const folder = path.join(PROJECTS_FOLDER, project);
    if (!(await fs.pathExists(folder))) throw new Error('Project not found');
    const file = path.join(folder, 'data.json');
    return (await fs.pathExists(file)) ? fs.readJson(file) : null;
  },
  60_000,
  30_000,
  async (project) => (await lifecycle.state(project)) !== 'archived',
);
const administration = new AdminService(
  adminStore,
  accounts,
  lifecycle,
  documents,
  async (project) => {
    await previews.wait(project);
    await gitLocks.get(project);
  },
  withGit,
);

httpServer.on('upgrade', async (request, socket, head) => {
  // You may check auth of request here..
  // Call `wss.HandleUpgrade` *after* you checked whether the client has access
  // (e.g. by checking cookies, or url parameters).
  // See https://github.com/websockets/ws#client-authentication
  // Parse the request URL
  const requestUrl = new URL(
    request.url || '',
    `wss://${request.headers.host}`,
  );
  if (requestUrl.pathname.startsWith('/ws')) {
    const projectName = requestUrl.pathname.split('/')[2];
    const accessToken = requestUrl.searchParams.get('access_token');
    if (accessToken) {
      try {
        const decodedToken = jwt.verify(
          accessToken,
          process.env.JWT_SECRET || '',
        ) as {username: string; sessionVersion?: number};
        if (
          decodedToken &&
          (await accounts.active(
            decodedToken.username,
            decodedToken.sessionVersion || 0,
          )) &&
          (await lifecycle.state(projectName)) === 'active' &&
          (await acl.hasRole(decodedToken.username, projectName))
        ) {
          wss.handleUpgrade(request, socket, head, (ws) => {
            void documents
              .connect(
                projectName,
                ws,
                async () => {
                  const token = jwt.verify(
                    accessToken,
                    process.env.JWT_SECRET || '',
                  ) as {username: string; sessionVersion?: number};
                  return (
                    (await accounts.active(
                      token.username,
                      token.sessionVersion || 0,
                    )) &&
                    (await lifecycle.state(projectName)) === 'active' &&
                    (await acl.hasRole(token.username, projectName))
                  );
                },
                async () => {
                  await accounts.activity(decodedToken.username, 'human');
                  await redisClient.HSET('project:' + projectName + ':status', {
                    lastModifiedAt: String(Date.now()),
                    lastHumanActivityAt: String(Date.now()),
                  });
                },
              )
              .catch(() => ws.close(1011, 'Document unavailable'));
          });
          return;
        }
      } catch (e) {
        console.error(e);
      }
    }
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
  }
});

const uploadMiddleware = multer({dest: '/tmp/amcui-uploads/'});

async function userSaveVisit(username: string, projectName: string) {
  await accounts.activity(username, 'human');
  await redisClient.HSET(
    'project:' + projectName + ':status',
    'lastHumanActivityAt',
    String(Date.now()),
  );
  await redisClient.ZADD('user:' + username + ':recent', {
    score: new Date().getTime(),
    value: projectName,
  });
  await redisClient.ZREMRANGEBYRANK('user:' + username + ':recent', 0, -11);
}

ws.on('connection', (socket) => {
  //this socket is authenticated, we are good to handle more events from it.
  const username: string = socket.decodedToken.username;
  const recheck = setInterval(() => {
    void accounts
      .active(username, socket.decodedToken.sessionVersion || 0)
      .then((active) => {
        if (!active) socket.disconnect(true);
      })
      .catch(() => socket.disconnect(true));
  }, 30_000);
  recheck.unref();
  socket.on('disconnect', () => clearInterval(recheck));

  socket.on('listen', (project: string) => {
    void (async () => {
      const hasRole =
        (await accounts.active(
          username,
          socket.decodedToken.sessionVersion || 0,
        )) && (await acl.hasRole(username, project));
      if (!hasRole) {
        socket.disconnect(true);
      } else {
        userSaveVisit(username, project);
        socket.join(project + '-notifications');
      }
    })().catch(() => socket.disconnect(true));
  });
});

const env = process.env.NODE_ENV || 'development';
if (env === 'development') {
  sqlite3.verbose();
} else if (env === 'production') {
  app.use(express.static(__dirname + '/public'));
}

app.use(express.urlencoded({extended: true}));
app.use(express.json({limit: '50mb'}));
app.use(function (req, _res, next) {
  if (req.is('text/*')) {
    req.body = '';
    req.setEncoding('utf8');
    req.on('data', function (chunk) {
      req.body += chunk;
    });
    req.on('end', next);
  } else {
    next();
  }
});

const secureJwt = expressjwt({
  secret: process.env.JWT_SECRET,
  algorithms: ['HS256'],
  getToken: function fromHeaderOrQuerystring(req) {
    if (
      req.headers.authorization &&
      req.headers.authorization.split(' ')[0] === 'Bearer'
    ) {
      return req.headers.authorization.split(' ')[1];
    } else if (req.query && req.query.token) {
      return String(req.query.token);
    }
    return;
  },
});

// map auth to user because of migration from 6 to 8 of express-jwt
const secure = (
  req: JWTRequest,
  res: express.Response,
  next: express.NextFunction,
) => {
  secureJwt(req, res, (err) => {
    if (err) {
      return next(err);
    }
    if (req.auth) {
      req.user = req.auth as any;
    }
    void accounts
      .active(req.user?.username || '', (req.auth as any)?.sessionVersion || 0)
      .then((active) =>
        active
          ? next()
          : res.status(401).json({error: 'Account access revoked'}),
      )
      .catch(next);
  });
};

const projectCreator = new ProjectCreator(
  PROJECTS_FOLDER,
  path.resolve(APP_FOLDER, 'assets'),
  addProjectAcl,
  (project, root) => {
    // Preserve the existing asynchronous AMC association initialization.
    amcCommande(
      null,
      root,
      project,
      'create association db',
      [
        'association-auto',
        '--data',
        path.join(root, 'data'),
        '--notes-id',
        'etu',
        '--liste',
        path.join(root, 'students.csv'),
        '--liste-key',
        'id',
      ],
      null,
    );
  },
);

// Shared browser/MCP asset and preview services.
const assets = new ExamAssets(PROJECTS_FOLDER, makeThumbnail, async (data) => {
  const response = await fetch(
    process.env.SVG2PDF_URL || 'http://svg2pdf:3000/convert',
    {method: 'POST', body: data, signal: AbortSignal.timeout(60_000)},
  );
  if (!response.ok) throw new Error('SVG conversion failed');
  return Buffer.from(await response.arrayBuffer());
});
const previews = new ExamPreviews(
  PROJECTS_FOLDER,
  documents,
  async (project, username, body, pdf) => {
    // A captured preview can finish during printing; retain its isolated result without
    // changing the working files used by that print run.
    if ((await lifecycle.state(project)) !== 'active') return;
    if (
      (await redisClient.HGET('project:' + project + ':status', 'locked')) ===
      '1'
    )
      return;
    saveSourceFilesSync(PROJECTS_FOLDER, project, body);
    await fs.copy(pdf, path.join(PROJECTS_FOLDER, project, 'out', 'out.pdf'));
    await commitGit(project, username, 'preview');
  },
  (project, event) => {
    ws.to(project + '-notifications').emit('log', event);
  },
);
if (process.env.MCP_ENABLED === 'true') {
  const publicApiUrl = process.env.MCP_PUBLIC_API_URL;
  const webUrl = process.env.MCP_WEB_URL;
  if (!publicApiUrl || !webUrl)
    throw new Error('MCP_PUBLIC_API_URL and MCP_WEB_URL are required');
  const projects = async (username: string): Promise<string[]> => {
    const [roles, recent] = await Promise.all([
      acl.userRoles(username),
      redisClient.ZRANGE('user:' + username + ':recent', 0, -1, {REV: true}),
    ]);
    const recentOrder = new Map(
      recent.map((project, index) => [project, index]),
    );
    return roles
      .filter((role: string) => role !== 'admin')
      .sort((a: string, b: string) => {
        const rankA = recentOrder.get(a) ?? recent.length;
        const rankB = recentOrder.get(b) ?? recent.length;
        return rankA - rankB || a.localeCompare(b);
      });
  };
  const oauth = new ExamOAuth(
    {
      get: (key) => redisClient.GET(key),
      set: async (key, value, seconds) => {
        await redisClient.SET(key, value, {EX: seconds});
      },
      compareAndSet: async (key, expected, value) =>
        (await redisClient.EVAL(
          `if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
           redis.call('SET', KEYS[1], ARGV[2], 'KEEPTTL')
           return 1`,
          {keys: [key], arguments: [expected, value]},
        )) === 1,
      take: (key) => redisClient.GETDEL(key),
      delete: async (key) => {
        await redisClient.DEL(key);
      },
      addMember: async (key, value) => {
        await redisClient.SADD(key, value);
      },
      members: (key) => redisClient.SMEMBERS(key),
    },
    publicApiUrl.replace(/\/$/, '') + '/mcp',
    webUrl,
    projects,
    JSON.parse(process.env.MCP_CLIENTS_JSON || '[]'),
    (username) => accounts.active(username),
  );
  accounts.revokeGrants = async (username) => {
    for (const grant of await oauth.grants(username))
      await oauth.revokeGrant(username, grant.id);
  };
  installMcp(app, {
    copy: new ExamCopy(PROJECTS_FOLDER, documents),
    oauth,
    documents,
    assets,
    previews,
    publicApiUrl,
    webUrl,
    secure,
    createProject: (name, username) => projectCreator.create(name, username),
    projects,
    allowed: async (username, project) => {
      const allowed =
        (await accounts.active(username)) &&
        (await acl.hasRole(username, project));
      if (allowed) await accounts.activity(username, 'mcp');
      return allowed;
    },
    writable: (project) => lifecycle.writable(project),
    operation: (projects, write, run) =>
      lifecycle.operation(projects, write, run),
    audit: async (event) => {
      if (typeof event.username === 'string')
        await accounts.activity(event.username, 'mcp');
      if (event.result === 'success' && typeof event.project === 'string')
        await redisClient.HSET(
          'project:' + event.project + ':status',
          'lastModifiedAt',
          String(Date.now()),
        );
      await redisClient.LPUSH('mcp:audit', JSON.stringify(event));
      await redisClient.LTRIM('mcp:audit', 0, 9999);
    },
  });
}

//secure /project with auth api
app.use('/project', secure);
app.use('/admin', secure);
app.use('/profile', secure);
app.use('/project/:project', lifecycle.middleware);
app.use((req, res, next) => {
  res.once('finish', () => {
    if (
      req.user &&
      req.method !== 'GET' &&
      req.path.startsWith('/project/') &&
      !req.path.endsWith('/delete') &&
      res.statusCode < 400
    ) {
      void accounts.activity(req.user.username, 'human').catch(() => {});
      const project = req.path.split('/')[2];
      if (!['list', 'recent', 'create'].includes(project))
        void redisClient
          .HSET(
            'project:' + project + ':status',
            'lastModifiedAt',
            String(Date.now()),
          )
          .catch(() => {});
    }
  });
  next();
});

const projectAcl = acl.middleware(
  2,
  (req) => {
    return (req as express.Request)?.user?.username as any;
  },
  'admin',
);

const aclProject: express.RequestHandler = (req, res, next) => {
  try {
    projectPath(PROJECTS_FOLDER, req.params.project);
    if (req.params.project === 'admin')
      throw new AdminError('Reserved project');
  } catch (error) {
    next(error);
    return;
  }
  projectAcl(req, res, next);
};

installProjectFileRoutes(
  app,
  PROJECTS_FOLDER,
  APP_FOLDER + '/assets/image_not_found.jpg',
  aclProject,
  uploadMiddleware.single('file'),
  makeThumbnail,
  async (bytes) => {
    const response = await fetch(
      process.env.SVG2PDF_URL || 'http://svg2pdf:3000/convert',
      {
        method: 'POST',
        body: bytes,
        signal: AbortSignal.timeout(60_000),
      },
    );
    if (!response.ok) throw new Error('SVG conversion failed');
    return Buffer.from(await response.arrayBuffer());
  },
);

const aclAdmin: express.RequestHandler = acl.middleware(
  1,
  (req) => {
    return (req as express.Request)?.user?.username as any;
  },
  'admin',
);
administration.install(app, aclAdmin, aclProject, limits.authAccount);

//TODO check types with db
interface DbParams {
  $threshold?: number;
  $student?: string;
  $page?: string;
  $copy?: string;
  $manual?: number;
  $type?: string;
  $id_a?: string;
  $id_b?: string;
}

function database(
  req: express.Request,
  res: express.Response,
  callback: (
    dbReady: (
      method: keyof sqlite3.Database,
      query: string,
      params: DbParams | ((rows: any[]) => void),
      success?: (rows: any[] | any) => void,
    ) => void,
  ) => void,
): void {
  const project = req.params.project;
  const db = new sqlite3.Database(
    PROJECTS_FOLDER + '/' + project + '/data/capture.sqlite',
    (err) => {
      if (err) {
        console.log(err);
        res.status(500).end(JSON.stringify(err));
        return;
      }
      // Release attached databases when the response ends, including disconnects.
      // Open SQLite handles prevent project renames on Windows bind mounts.
      const closeDatabase = () =>
        db.close((error) => {
          if (error) console.log(error);
        });
      if (res.destroyed) {
        closeDatabase();
        return;
      }
      res.once('close', closeDatabase);
      db.exec(
        "ATTACH DATABASE '" +
          PROJECTS_FOLDER +
          '/' +
          project +
          "/data/layout.sqlite' AS layout",
        () => {
          db.exec(
            "ATTACH DATABASE '" +
              PROJECTS_FOLDER +
              '/' +
              project +
              "/data/association.sqlite' AS assoc",
            () => {
              db.exec(
                "ATTACH DATABASE '" +
                  PROJECTS_FOLDER +
                  '/' +
                  project +
                  "/data/scoring.sqlite' AS scoring",
                () => {
                  const dbHandled = (
                    method: keyof sqlite3.Database,
                    query: string,
                    params: DbParams | ((rows: any[]) => void),
                    success?: (rows: any[] | any) => void,
                  ): void => {
                    const internalCallback = (
                      err: Error | null,
                      rows: any[],
                    ): void => {
                      if (err) {
                        console.log(err);
                        res.status(500).end(JSON.stringify(err));
                        return;
                      }
                      if (success) {
                        success(rows);
                      } else {
                        if (typeof params === 'function') {
                          params(rows);
                        }
                      }
                    };

                    if (success) {
                      // @ts-expect-error -- Dynamic SQLite method signatures have incompatible overloads.
                      db[method](query, params, internalCallback);
                    } else {
                      // @ts-expect-error -- Dynamic SQLite method signatures have incompatible overloads.
                      db[method](query, internalCallback);
                    }
                  };
                  callback(dbHandled);
                },
              );
            },
          );
        },
      );
    },
  );
}

function projectOptions(
  project: string,
  callback: (err: Error | null, result: any) => void,
): void {
  const filename = path.resolve(PROJECTS_FOLDER, project + '/options.xml');
  fs.readFile(filename, 'utf-8', function (err, data) {
    if (err) {
      callback(err, null);
    } else {
      xml2js.parseString(data, {explicitArray: false}, (err, result) => {
        // auto-upgrade old options files
        if (result.projetAMC) {
          result.project = result.projetAMC;
          delete result.projetAMC;
        }
        callback(err, result);
      });
    }
  });
}

function projectThreshold(
  project: string,
  callback: (err: Error | null, threshold: number) => void,
): void {
  projectOptions(project, (_err, result) => {
    let threshold = 0.5;
    if (result.project.seuil && !isNaN(result.project.seuil)) {
      threshold = parseFloat(result.project.seuil);
    }
    callback(null, threshold);
  });
}

function amcCommande(
  res: express.Response | null,
  cwd: string,
  project: string,
  msg: string,
  params: string[],
  callback?: ((log: string) => void) | null,
  error?: (() => void) | null,
): void {
  ws.to(project + '-notifications').emit('log', {
    command: params[0],
    msg: msg,
    action: 'start',
    params: params,
  });
  const releaseOperation = lifecycle.begin(project);
  const amc = childProcess.spawn('auto-multiple-choice', params, {
    cwd: cwd,
  });

  amc.once('close', releaseOperation);
  amc.once('error', () => {
    releaseOperation();
    if (res && !res.headersSent) res.sendStatus(500);
  });
  let log = '';
  let errorlog = '';

  //send complete lines
  const splitter = amc.stdout.pipe(StreamSplitter('\n'));
  splitter.encoding = 'utf8';
  splitter.on('token', function (token: string) {
    log += token + '\n';
    ws.to(project + '-notifications').emit('log', {
      command: params[0],
      msg: msg,
      action: 'log',
      data: token,
    });
  });

  amc.stderr.on('data', (data) => {
    errorlog += data;
    ws.to(project + '-notifications').emit('log', {
      command: params[0],
      msg: msg,
      action: 'err',
      data: data.toString(),
    });
  });
  amc.on('close', async (code) => {
    ws.to(project + '-notifications').emit('log', {
      command: params[0],
      msg: msg,
      action: 'end',
      code: code,
    });
    if (code === 0) {
      if (callback) {
        callback(log);
      }
    } else {
      await redisClient.HSET('project:' + project + ':status', 'locked', '0');
      if (error) {
        error();
      }
      const debug = {
        log: log,
        command: params,
        errorlog: errorlog,
        error: code,
      };
      if (res) {
        res.json(debug);
      }
    }
  });
}

app.get('/', (_req, res) => {
  res.json({
    name: 'AMCUI API SERVER',
    sha: process.env.COMMIT_SHA,
  });
});

app.get('/templates', async (_req, res) => {
  const files = await fs.readdir(TEMPLATES_FOLDER, {withFileTypes: true});
  res.json(
    files.filter((dirent) => dirent.isDirectory()).map((dirent) => dirent.name),
  );
});

app.get('/debug-sentry', () => {
  throw new Error('Sentry express test');
});

await acl.allow('admin', '/admin', 'admin');
if (process.env.ADMIN_USER) {
  addProjectAcl('admin', process.env.ADMIN_USER);
}

app.post('/admin/import', aclAdmin, (req, res) => {
  if (req.body.project === 'admin')
    return res.status(400).send('Reserved project');
  const folder = projectPath(PROJECTS_FOLDER, req.body.project);
  if (!fs.existsSync(folder)) return res.sendStatus(404);
  void addProjectAcl(req.body.project, req.user?.username)
    .then(async () => {
      await administration.jobs.enqueue(
        'inventory',
        req.user!.username,
        req.body.project,
      );
      res.sendStatus(200);
    })
    .catch((error) => res.status(500).send(error.message));
});

app.post(
  '/admin/addtoproject',
  aclAdmin,
  asyncHandler(async (req, res) => {
    if (!req.user) return res.sendStatus(403);
    if (req.body.project === 'admin') throw new AdminError('Reserved project');
    projectPath(PROJECTS_FOLDER, req.body.project);
    await acl.addUserRoles(req.user.username, req.body.project);
    await adminStore.audit(req.user.username, 'project.join', req.body.project);
    const msg = `ADMIN: ${req.user.username} added himself to ${req.body.project}`;
    Sentry.captureMessage(msg);
    res.sendStatus(200);
  }),
);

app.post(
  '/admin/removefromproject',
  aclAdmin,
  asyncHandler(async (req, res) => {
    if (!req.user) return res.sendStatus(403);
    if (req.body.project === 'admin') throw new AdminError('Reserved project');
    projectPath(PROJECTS_FOLDER, req.body.project);
    await acl.removeUserRoles(req.user.username, req.body.project);
    await adminStore.audit(
      req.user.username,
      'project.leave',
      req.body.project,
    );
    const msg = `ADMIN: ${req.user.username} removed himself from ${req.body.project}`;
    Sentry.captureMessage(msg);
    res.sendStatus(200);
  }),
);

app.post(
  '/admin/user/:username/removemfa',
  aclAdmin,
  asyncHandler(async (req, res) => {
    const reply = await redisClient.GET('user:' + req.params.username);
    if (reply) {
      await accounts.updateCredentials(
        req.params.username,
        req.user!.username,
        'account.resetMfa',
        async () => {
          const user = JSON.parse(
            (await redisClient.GET('user:' + req.params.username))!,
          );
          user.authenticators = [];
          await redisClient.SET('user:' + user.username, JSON.stringify(user));
        },
      );
      res.sendStatus(200);
    } else {
      res.status(404).send('user not found');
    }
  }),
);

app.post(
  '/admin/user/:username/changepassword',
  aclAdmin,
  asyncHandler(async (req, res) => {
    if (
      typeof req.body.newPassword !== 'string' ||
      req.body.newPassword.length < 12 ||
      Buffer.byteLength(req.body.newPassword) > 72
    )
      return res
        .status(400)
        .send(
          'Password must be 12 characters or more and at most 72 UTF-8 bytes',
        );
    const reply = await redisClient.GET('user:' + req.params.username);
    if (reply) {
      const password = await bcrypt.hash(req.body.newPassword, 12);
      await accounts.updateCredentials(
        req.params.username,
        req.user!.username,
        'account.resetPassword',
        async () => {
          const user = JSON.parse(
            (await redisClient.GET('user:' + req.params.username))!,
          );
          user.password = password;
          await redisClient.SET('user:' + user.username, JSON.stringify(user));
        },
      );
      res.sendStatus(200);
    } else {
      res.status(404).send('user not found');
    }
  }),
);

app.post('/admin/project/:project/delete', aclAdmin, (req, res) => {
  deleteProject(req.params.project, (err) => {
    if (err) {
      res.sendStatus(404);
    } else {
      res.sendStatus(200);
    }
  });
});

app.post(
  '/admin/project/:project/gitgc',
  aclAdmin,
  asyncHandler(async (req, res) => {
    projectPath(PROJECTS_FOLDER, req.params.project);
    res
      .status(202)
      .json(
        await administration.jobs.enqueue(
          'gitgc',
          req.user!.username,
          req.params.project,
        ),
      );
  }),
);
app.post(
  '/admin/user/:username/delete',
  aclAdmin,
  asyncHandler(async (req, res) => {
    await accounts.transition(
      req.params.username,
      'disabled',
      req.user!.username,
    );
    res.sendStatus(200);
  }),
);

/*
ZONE_FRAME=>1,
ZONE_NAME=>2,
ZONE_DIGIT=>3, //top of the page id
ZONE_BOX=>4,
*/
/* corner
(1=TL, 2=TR, 3=BR, 4=BL)
*/

/* type
POSITION_BOX=>1,
POSITION_MEASURE=>2,
*/

/*
version > 1.2.1 feature seuil-up not supported

 */

/* Project API */
app.post(
  '/login',
  validateLogin,
  limits.authAccount,
  asyncHandler(async (req, res) => {
    const username = req.body.username.toLowerCase();
    const accountMeta = await accounts.meta(username);
    const sendToken = (user: any): void => {
      try {
        delete user.password;
        user.authenticators = user.authenticators
          ? user.authenticators.map(
              ({label, type}: {label: string; type: string}) => {
                return {
                  label,
                  type,
                };
              },
            )
          : [];
        const token = jwt.sign(
          {...user, sessionVersion: accountMeta.sessionVersion},
          process.env.JWT_SECRET || '',
          {
            expiresIn: '6h',
          },
        );
        void accounts.activity(username, 'login').catch(() => {});
        res.locals.authenticationComplete = true;
        res.json({token: token});
      } catch (e) {
        console.log('login', e, user);
        res.status(500).send(e);
      }
    };
    const userData = await redisClient.GET('user:' + username);

    if (!userData) {
      return res.status(401).send('Wrong user or password');
    } else {
      const user = JSON.parse(userData);
      if (await bcrypt.compare(req.body.password, user.password)) {
        if (accountMeta.status !== 'active')
          return res.status(403).json({
            status: accountMeta.status,
            message: 'Account ' + accountMeta.status,
          });
        // check mfa
        if (user.authenticators && user.authenticators.length > 0) {
          if (
            req.body.authenticator &&
            req.body.authenticator.type === 'authenticator' &&
            req.body.authenticator.token
          ) {
            // validate token test all
            if (
              user.authenticators
                .filter((c: {type: string}) => c.type === 'authenticator')
                .some((config: {secret: string}) => {
                  return authenticator.verify({
                    token: req.body.authenticator.token,
                    secret: config.secret,
                  });
                })
            ) {
              sendToken(user);
            } else {
              res.status(401).send('Wrong token');
            }
          } else if (
            req.body.authenticator &&
            req.body.authenticator.type === 'fido2'
          ) {
            // validate fido2
            const logResponse = req.body.authenticator.response;
            const credListFiltered = user.authenticators.filter(
              (x: {credentialId: string}) =>
                x.credentialId == logResponse.rawId,
            );

            if (!credListFiltered.length)
              return res.status(404).send('Authenticator does not exist');
            const thisCred = credListFiltered.pop();

            logResponse.rawId = base64buffer.decode(logResponse.rawId);
            logResponse.response.authenticatorData = base64buffer.decode(
              logResponse.response.authenticatorData,
            );

            const assertionExpectations = {
              challenge: Fido2inMemoryChallenges[user.username],
              origin: process.env.FRONTEND_DOMAIN
                ? `https://${process.env.FRONTEND_DOMAIN}`
                : 'http://localhost:8080',
              factor: 'either' as Factor, // TODO config?
              publicKey: thisCred.publicKey,
              prevCounter: thisCred.counter,
              userHandle: thisCred.credentialId,
            };

            f2l
              .assertionResult(logResponse, assertionExpectations)
              .then(async (logResult) => {
                thisCred.counter = logResult.authnrData.get('counter');
                delete Fido2inMemoryChallenges[user.username];
                const saved = await redisClient.eval(
                  "if redis.call('get',KEYS[1]) == ARGV[1] then redis.call('set',KEYS[1],ARGV[2]); return 1 else return 0 end",
                  {
                    keys: ['user:' + user.username],
                    arguments: [userData, JSON.stringify(user)],
                  },
                );
                if (!saved)
                  throw new AdminError(
                    'Credentials changed; authenticate again',
                    409,
                  );
                sendToken(user);
              })
              .catch((err) => {
                res.status(401).send(err.message);
              });
          } else {
            // request mfa
            const authenticators = {
              authenticator: user.authenticators
                .filter(
                  (config: {type: string}) => config.type === 'authenticator',
                )
                .map(({label, type}: {label: string; type: string}) => {
                  return {
                    label,
                    type,
                  };
                }),
              fido2: {}, // TODO add fido request challenge
            };
            const filteredFido2 = user.authenticators.filter(
              (config: {type: string}) => config.type === 'fido2',
            );
            if (filteredFido2.length > 0) {
              const authnOptions: any = await f2l.assertionOptions();
              authnOptions.challenge = base64buffer.encode(
                authnOptions.challenge,
              );
              authnOptions.allowCredentials = filteredFido2.map(
                (config: {credentialId: string}) => {
                  return {id: config.credentialId, type: 'public-key'};
                },
              );
              Fido2inMemoryChallenges[user.username] = authnOptions.challenge;
              authenticators.fido2 = authnOptions;
            }
            res.send(authenticators);
          }
        } else {
          // only password login
          sendToken(user);
        }
      } else {
        res.status(401).send('Wrong user or password');
      }
    }
  }),
);

app.get(
  '/profile',
  asyncHandler(async (req, res) => {
    const username = req.user!.username;
    const meta = await accounts.meta(username);
    res.json({
      username,
      displayName: meta.displayName || null,
      email: meta.email || null,
    });
  }),
);

async function updateProfileAccount(
  req: express.Request,
  reason: string,
  update: (user: any) => void,
) {
  const username = req.user!.username;
  let updated: any;
  await accounts.updateCredentials(username, username, reason, async () => {
    if (!(await accounts.active(username)))
      throw new AdminError('Account access revoked', 403);
    const current = JSON.parse((await redisClient.GET('user:' + username))!);
    if (!(await bcrypt.compare(req.body.password, current.password)))
      throw new AdminError('Password changed; authenticate again', 409);
    update(current);
    await redisClient.SET('user:' + username, JSON.stringify(current));
    updated = current;
  });
  return updated;
}
async function profileToken(user: any) {
  const meta = await accounts.meta(user.username);
  if (!(await accounts.active(user.username)))
    throw new AdminError('Account access revoked', 403);
  return jwt.sign(
    {
      username: user.username,
      sessionVersion: meta.sessionVersion,
      authenticators: (user.authenticators || []).map(
        ({label, type}: {label: string; type: string}) => ({label, type}),
      ),
    },
    process.env.JWT_SECRET!,
    {expiresIn: '6h'},
  );
}
app.post(
  '/profile/addAuthenticator',
  validatePassword,
  limits.authAccount,
  asyncHandler(async (req, res) => {
    const userData = await redisClient.GET('user:' + req.user?.username);
    if (!userData) {
      return res.sendStatus(401);
    }
    const user = JSON.parse(userData);
    if (!(await bcrypt.compare(req.body.password, user.password))) {
      return res.status(500).send('Wrong password');
    }
    res.locals.authenticationComplete = true;
    if (!user.authenticators) {
      user.authenticators = [];
    }
    if (
      user.authenticators
        .filter((c: {type: string}) => c.type === 'authenticator')
        .map((c: {label: string}) => c.label)
        .includes(req.body.label)
    ) {
      return res.status(500).send('name already exists');
    }
    const authenticatorConfig = {
      type: 'authenticator',
      label: req.body.label,
      secret: authenticator.generateSecret(),
    };
    const updated = await updateProfileAccount(
      req,
      'account.addMfa',
      (current) => {
        current.authenticators ||= [];
        if (
          current.authenticators.some(
            (item: any) =>
              item.type === 'authenticator' && item.label === req.body.label,
          )
        )
          throw new AdminError('Name already exists', 409);
        current.authenticators.push(authenticatorConfig);
      },
    );
    const token = await profileToken(updated);
    // TODO config
    const service = 'AMCUI Server';
    const otpauthUrl = authenticator.keyuri(
      user.username,
      service,
      authenticatorConfig.secret,
    );
    QRCode.toDataURL(otpauthUrl)
      .then((qrCodeDataUrl) => {
        res.send({
          token,
          otpauthUrl,
          qrCodeDataUrl,
        });
      })
      .catch(() => {
        res.send({
          token,
          otpauthUrl,
        });
      });
  }),
);

app.post(
  '/profile/removeMFA',
  validatePassword,
  limits.authAccount,
  asyncHandler(async (req, res) => {
    const userData = await redisClient.GET('user:' + req.user?.username);
    if (!userData) {
      return res.sendStatus(401);
    }
    const user = JSON.parse(userData);
    if (!(await bcrypt.compare(req.body.password, user.password))) {
      return res.status(500).send('Wrong user or password');
    }
    res.locals.authenticationComplete = true;
    const updated = await updateProfileAccount(
      req,
      'account.removeMfa',
      (current) => {
        current.authenticators = current.authenticators
          ? current.authenticators.filter(
              (authConfig: {type: string; label: string}) =>
                !(
                  authConfig.type === req.body.type &&
                  authConfig.label === req.body.label
                ),
            )
          : [];
      },
    );
    res.json({token: await profileToken(updated)});
  }),
);

app.post(
  '/changePassword',
  validatePasswordChange,
  limits.authAccount,
  asyncHandler(async (req, res) => {
    if (req.body.password && req.body.username && req.body.newPassword) {
      const username = req.body.username.toLowerCase();
      const reply = await redisClient.GET('user:' + username);
      if (reply) {
        const user = JSON.parse(reply);
        if (await bcrypt.compare(req.body.password, user.password)) {
          if (!(await accounts.active(username))) return res.sendStatus(403);
          const password = await bcrypt.hash(req.body.newPassword, 12);
          await accounts.updateCredentials(
            username,
            username,
            'account.changePassword',
            async () => {
              const current = JSON.parse(
                (await redisClient.GET('user:' + username))!,
              );
              if (!(await bcrypt.compare(req.body.password, current.password)))
                throw new AdminError(
                  'Password changed; authenticate again',
                  409,
                );
              current.password = password;
              await redisClient.SET(
                'user:' + username,
                JSON.stringify(current),
              );
            },
          );
          res.locals.authenticationComplete = true;
          res.sendStatus(200);
        } else {
          res.status(404).send('Wrong user or password');
        }
      } else {
        res.status(404).send('Wrong user or password');
      }
    } else {
      res.status(404).send('Wrong user or password');
    }
  }),
);

const Fido2inMemoryChallenges = {} as {[key: string]: string};

app.get('/profile/addFido2', async (req, res) => {
  const userData = await redisClient.GET('user:' + req.user?.username);
  if (!userData) {
    return res.sendStatus(401);
  }
  const user = JSON.parse(userData);
  f2l
    .attestationOptions()
    .then((regOptions: any) => {
      regOptions.user = {
        id: base64buffer.encode(str2ab(user.username).buffer),
        name: user.username,
        displayName: user.username,
      };
      regOptions.challenge = base64buffer.encode(regOptions.challenge);
      Fido2inMemoryChallenges[user.username] = regOptions.challenge;
      res.send(regOptions);
    })
    .catch(() => {
      res.sendStatus(500);
    });
});

app.post(
  '/profile/addFido2',
  validatePassword,
  limits.authAccount,
  asyncHandler(async (req, res) => {
    const userData = await redisClient.GET('user:' + req.user?.username);
    if (!userData) {
      return res.sendStatus(401);
    }
    const user = JSON.parse(userData);
    if (!(await bcrypt.compare(req.body.password, user.password))) {
      return res.status(500).send('Wrong password');
    }
    res.locals.authenticationComplete = true;
    if (!user.authenticators) {
      user.authenticators = [];
    }
    if (
      user.authenticators
        .filter((c: {type: string}) => c.type === 'fido2')
        .map((c: {label: string}) => c.label)
        .includes(req.body.label)
    ) {
      return res.status(500).send('name already exists');
    }

    const regResponse = req.body.response;
    regResponse.rawId = base64buffer.decode(regResponse.rawId);

    const attestationExpectations = {
      challenge: Fido2inMemoryChallenges[user.username],
      origin: 'http://localhost:8080', // TODO config
      factor: 'either' as Factor, // TODO config
    };

    f2l
      .attestationResult(regResponse, attestationExpectations)
      .then(async (regResult) => {
        const authnrData = regResult.authnrData;
        const credential = {
          type: 'fido2',
          label: req.body.label,
          counter: authnrData.get('counter'),
          credentialId: base64buffer.encode(authnrData.get('credId')),
          publicKey: authnrData.get('credentialPublicKeyPem'),
        };
        delete Fido2inMemoryChallenges[user.username];
        const updated = await updateProfileAccount(
          req,
          'account.addFido2',
          (current) => {
            current.authenticators ||= [];
            if (
              current.authenticators.some(
                (item: any) =>
                  item.type === 'fido2' && item.label === req.body.label,
              )
            )
              throw new AdminError('Name already exists', 409);
            current.authenticators.push(credential);
          },
        );
        res.json({token: await profileToken(updated)});
      })
      .catch((err) => {
        console.log(err);
        res.status(500).send(err.message);
      });
  }),
);

app.get(
  '/project/list',
  asyncHandler(async (req, res) => {
    if (!req.user) return res.sendStatus(403);
    const roles = await acl.userRoles(req.user.username);
    const projects = await Promise.all(
      roles
        .filter((role) => role !== 'admin')
        .map(async (role) => {
          const status = await redisClient.HGETALL(
            'project:' + role + ':status',
          );
          const users = await acl.roleUsers(role);
          return {
            project: role,
            status: status,
            users: users,
          };
        }),
    );
    res.json(projects);
  }),
);

app.get('/project/recent', async (req, res) => {
  try {
    const response = await redisClient.ZRANGE(
      'user:' + req.user?.username + ':recent',
      0,
      -1,
      {REV: true},
    );
    res.json(response);
  } catch {
    res.json([]);
  }
});

function ignoreGitError() {}

// Git lock mechanism to prevent concurrent operations
const gitLocks = new Map<string, Promise<any>>();
function withGit<T>(project: string, run: () => Promise<T>): Promise<T> {
  const operation = (gitLocks.get(project) || Promise.resolve())
    .catch(() => {})
    .then(run);
  gitLocks.set(project, operation);
  return operation.finally(() => {
    if (gitLocks.get(project) === operation) gitLocks.delete(project);
  });
}

async function commitGit(
  project: string,
  username: string,
  message: string,
): Promise<void> {
  const release = lifecycle.begin(project);
  try {
    if ((await lifecycle.state(project)) === 'archived') return;
    await withGit(project, () => performGitCommit(project, username, message));
  } finally {
    release();
  }
}

async function performGitCommit(
  project: string,
  username: string,
  message: string,
): Promise<void> {
  const g = simpleGit(PROJECTS_FOLDER + '/' + project);
  await g.init().catch(ignoreGitError);
  await g.raw(['add', '--all', '.']).catch((err: Error | null) => {
    if (err) {
      console.log('add', err);
      Sentry.captureException(err);
    }
  });
  await g
    .raw([
      'commit',
      '--author=' + username + ' <' + username + '@amcui.ig.he-arc.ch>',
      '-m',
      message,
    ])
    .catch((err: Error | null) => {
      if (err) {
        console.log('commit', err);
        Sentry.captureException(err);
      }
    });
}

app.post('/project/create', projectCreationHandler(projectCreator));

app.get('/project/:project/options', aclProject, (req, res) => {
  projectOptions(req.params.project, async (_err, result) => {
    const users = await acl.roleUsers(req.params.project);
    const status = await redisClient.HGETALL(
      'project:' + req.params.project + ':status',
    );
    res.json({
      options: result ? result.project : {},
      users: users,
      status: status,
    });
  });
});

app.post('/project/:project/options', aclProject, (req, res) => {
  if (!req.user) return res.sendStatus(403);
  const filename = path.resolve(
    PROJECTS_FOLDER,
    req.params.project + '/options.xml',
  );
  const builder = new xml2js.Builder();
  const xml = builder.buildObject({project: req.body.options});
  fs.writeFile(filename, xml, function (err) {
    if (err) {
      res.sendStatus(500);
    } else {
      ws.to(req.params.project + '-notifications').emit(
        'update:options',
        req.body.options,
      );
      commitGit(req.params.project, req.user?.username || '', 'options');
      res.sendStatus(200);
    }
  });
});

app.get('/project/:project/dbversions', aclProject, (req, res) => {
  database(req, res, (db) => {
    db(
      'get',
      `SELECT (SELECT value FROM capture_variables WHERE name = 'version') capture,
              (SELECT value FROM layout_variables WHERE name = 'version') layout,
              (SELECT value FROM association_variables WHERE name = 'version') association,
              (SELECT value FROM scoring_variables WHERE name = 'version') scoring`,
      (rows) => {
        res.json(rows);
      },
    );
  });
});

app.post(
  '/project/:project/copy/content',
  aclProject,
  copyContentHandler(
    new ExamCopy(PROJECTS_FOLDER, documents),
    (username, project) => acl.hasRole(username, project),
    (projects, run) =>
      lifecycle.operation(projects, false, async () => {
        await lifecycle.writable(projects[1]);
        return run();
      }),
  ),
);

app.post('/project/:project/copy/template', aclProject, (req, res) => {
  const TEMPLATE_FOLDER = projectPath(TEMPLATES_FOLDER, req.body.template);
  fs.copy(
    TEMPLATE_FOLDER + '/src',
    PROJECTS_FOLDER + '/' + req.params.project + '/src',
    () => {
      res.sendFile(TEMPLATE_FOLDER + '/source.tex');
    },
  );
});

app.post(
  '/project/:project/copy/project',
  aclProject,
  projectCopyHandler(projectCreator, documents),
);

//TODO: handle only graphics or codes needed?
app.post('/project/:project/copy/graphics', aclProject, async (req, res) => {
  if (!req.user) return res.sendStatus(403);
  const src = req.params.project;
  const dest = req.body.project.toLowerCase();
  const hasRole = await acl.hasRole(req.user.username, dest);
  if (hasRole && src !== dest) {
    fs.copy(
      PROJECTS_FOLDER + '/' + src + '/src/graphics',
      PROJECTS_FOLDER + '/' + dest + '/src/graphics',
      (err) => {
        if (err) {
          res.status(500).send('Failed to copy src files.');
        } else {
          res.sendStatus(200);
        }
      },
    );
  } else {
    res.sendStatus(403);
  }
});
//TODO: refactor?
app.post('/project/:project/copy/codes', aclProject, async (req, res) => {
  if (!req.user) return res.sendStatus(403);
  const src = req.params.project;
  const dest = req.body.project.toLowerCase();
  const hasRole = await acl.hasRole(req.user.username, dest);
  if (hasRole && src !== dest) {
    fs.copy(
      PROJECTS_FOLDER + '/' + src + '/src/codes',
      PROJECTS_FOLDER + '/' + dest + '/src/codes',
      (err) => {
        if (err) {
          res.status(500).send('Failed to copy src files.');
        } else {
          res.sendStatus(200);
        }
      },
    );
  } else {
    res.sendStatus(403);
  }
});

app.post('/project/:project/add', aclProject, async (req, res) => {
  await acl.addUserRoles(req.body.username, req.params.project);
  res.sendStatus(200);
});

app.post('/project/:project/remove', aclProject, async (req, res) => {
  //cannot remove self
  if (req.body.username === req.user?.username) {
    res.sendStatus(500);
  } else {
    await acl.removeUserRoles(req.body.username, req.params.project);
    res.sendStatus(200);
  }
});

app.post('/project/:project/rename', aclProject, (req, res, next) => {
  const project = req.params.project;
  const newProject = slug(req.body.name);
  if (newProject.length === 0 || newProject.indexOf('.') === 0) {
    return res.sendStatus(404);
  }
  //check that destination does not exists

  const newPath = PROJECTS_FOLDER + '/' + newProject;
  if (fs.existsSync(newPath)) {
    return res.sendStatus(403);
  }

  documents
    .rename(project, newProject, () =>
      fs.rename(PROJECTS_FOLDER + '/' + project, newPath),
    )
    .then(async () => {
      if ((await redisClient.EXISTS('exam:' + project)) > 0) {
        await redisClient.RENAMENX('exam:' + project, 'exam:' + newProject);
      }
      await acl.allow(newProject, '/project/' + newProject, 'admin');
      const users = await acl.roleUsers(project);
      await Promise.all(
        users.map(async (username: string) => {
          await acl.removeUserRoles(username, project);
          await acl.addUserRoles(username, newProject);
          await redisClient.ZREM('user:' + username + ':recent', project);
        }),
      );
      const keys = await redisClient.KEYS('project:' + project + ':*');
      await Promise.all(
        keys.map(async (key) => {
          const entries = key.split(':');
          await redisClient.RENAMENX(
            key,
            'project:' + newProject + ':' + entries[2],
          );
        }),
      );
      await acl.removeAllow(project, '/project/' + project, 'admin');
      await acl.removeRole(project);
      await acl.removeResource(project);
      res.send(newProject);
    })
    .catch(next);
});

async function deleteProject(
  project: string,
  callback: (err: boolean) => void,
) {
  try {
    const folder = projectPath(PROJECTS_FOLDER, project);
    if (project === 'admin') return callback(true);
    await adminStore.lock('project:' + project, () =>
      lifecycle.operation([project], false, async () => {
        await documents.disconnectProject(project);
        await previews.wait(project);
        await gitLocks.get(project);
        await documents.clear(project);
        await fs.remove(folder);
        for (const username of await acl.roleUsers(project)) {
          await acl.removeUserRoles(username, project);
          await redisClient.ZREM('user:' + username + ':recent', project);
        }
        await acl.removeAllow(project, '/project/' + project, 'admin');
        await acl.removeRole(project);
        await acl.removeResource(project);
        await redisClient.DEL('exam:' + project);
        for await (const key of redisClient.scanIterator({
          MATCH: 'project:' + project + ':*',
          COUNT: 100,
        }))
          await redisClient.DEL(key);
        await redisClient.SREM('amcui:admin:projects', project);
      }),
    );
    callback(false);
  } catch (error) {
    console.error('Project deletion failed', error);
    callback(true);
  }
}

app.post('/project/:project/delete', aclProject, (req, res) => {
  deleteProject(req.params.project, (err) => {
    if (err) {
      res.sendStatus(404);
    } else {
      res.sendStatus(200);
    }
  });
});

/*
TODO ?
archive project
zip correction/scans...
delete/recreate git
flag as archive
*/

app.get('/project/:project/gitlogs', aclProject, async (req, res) => {
  // TODO? use cI when git version supports it
  try {
    await gitLocks.get(req.params.project);
    const g = simpleGit(PROJECTS_FOLDER + '/' + req.params.project);
    const data = await g.raw([
      'log',
      '--walk-reflogs',
      '--pretty=format:%H%+gs%+an%+ci',
      '--unified=0',
      '--',
      'data.json',
      'options.xml',
    ]);
    const logs = [];
    const json = data.split('\n');
    let i = 0;
    while (i < json.length) {
      const msg = json[i + 1];
      const idx = msg.indexOf(':');
      const log = {
        sha: json[i],
        type: msg.substring(0, idx),
        msg: msg.substring(idx + 2),
        username: json[i + 2],
        date: new Date(json[i + 3]),
        diff: '',
      };
      logs.push(log);
      i += 4;
      while (json[i] !== '') {
        if (json[i].startsWith('+') && !json[i].includes('updatedAt')) {
          log.diff += json[i] + '\n';
        }
        i++;
      }
      i++;
    }
    res.json(logs);
  } catch (err) {
    console.log(err);
    res.status(500).send(err);
  }
});

app.post('/project/:project/revert', aclProject, async (req, res) => {
  try {
    await withGit(req.params.project, async () => {
      await performGitRevert(req.params.project, req.body.sha);
      const json = path.resolve(
        PROJECTS_FOLDER,
        req.params.project + '/data.json',
      );
      await documents.withDocument(req.params.project, (doc) =>
        replaceExam(doc, fs.readJsonSync(json), 'revert'),
      );
      res.send(fs.readFileSync(json));
    });
  } catch (err) {
    Sentry.captureException(err);
    res.status(500).send(err);
  }
});

async function performGitRevert(project: string, sha: string): Promise<void> {
  const g = simpleGit(PROJECTS_FOLDER + '/' + project);
  await g.raw(['reset', '--hard', sha]);
}

app.get('/project/:project/zip', aclProject, async (req, res, next) => {
  try {
    // Annotation/printing announce completion before their Git commit finishes.
    // Wait before traversing .git so temporary commit files have settled.
    await gitLocks.get(req.params.project);
    const snapshot = await documents.withDocument(req.params.project, (doc) =>
      readExam(doc),
    );
    const rendered = renderSnapshot(snapshot);
    const zip = new ZipArchive();
    res.attachment(req.params.project + '.zip');
    const generated = {
      'data.json': rendered.json,
      'source.tex': rendered.source,
      'questions_definition.tex': rendered.questions_definition,
      'questions_layout.tex': rendered.questions_layout,
    };
    for (const [name, content] of Object.entries(generated))
      zip.append(content, {name});
    for (const [id, code] of Object.entries(rendered.codes)) {
      if (!/^[\w-]{1,200}$/.test(id)) throw new Error('INVALID_CODE_ID');
      zip.append(code.content, {name: `src/codes/${id}`});
    }
    zip.glob('**/*', {
      cwd: path.join(PROJECTS_FOLDER, req.params.project),
      dot: true,
      ignore: [...Object.keys(generated), 'src/codes/**'],
    });
    await streamArchive(zip, res);
  } catch (error) {
    next(error);
  }
});

app.post(
  '/project/:project/zip',
  aclProject,
  uploadMiddleware.single('file'),
  async (req, res) => {
    const projectFolder = path.join(PROJECTS_FOLDER, req.params.project);
    if (!req.file) {
      return res.status(400).send('No file uploaded');
    }
    try {
      const uploaded = req.file.path;
      const snapshot = await documents.withDocument(req.params.project, (doc) =>
        importArchive(uploaded, projectFolder, (exam) =>
          replaceExam(doc, exam, 'import'),
        ),
      );
      res.json(snapshot);
    } catch (error) {
      console.error('Error extracting the zip file:', error);
      res.status(400).send('Invalid or unsupported project archive');
    } finally {
      await fs.unlink(req.file.path);
    }
  },
);

app.get('/project/:project/graphics/sync', aclProject, (req, res) => {
  const GRAPHICS_FOLDER =
    PROJECTS_FOLDER + '/' + req.params.project + '/src/graphics/';
  const allFiles = fs.readdirSync(GRAPHICS_FOLDER);
  //remove thumbs from list
  const files = allFiles.filter((filename) => {
    return !isThumbnail(filename) && !filename.startsWith('.');
  });
  //get files without thumb
  void Promise.all(
    missingThumbnails(allFiles).map(async (filename) => {
      try {
        await makeThumbnail(
          GRAPHICS_FOLDER,
          filename,
          path.parse(filename).name,
        );
      } catch (error) {
        console.error(error);
      }
    }),
  ).then(() => res.json(files));
});

app.post('/project/:project/preview', aclProject, async (req, res, next) => {
  // Preserve the rendered-body contract for older clients. Current clients and
  // MCP omit it and capture the live document through the same preview queue.
  try {
    res
      .status(200)
      .json(
        await previews.enqueue(
          req.params.project,
          req.user?.username || '',
          req.body?.json ? req.body : undefined,
        ),
      );
  } catch (error) {
    next(error);
  }
});

app.get('/project/:project/reset/lock', aclProject, async (req, res) => {
  await redisClient.HSET('project:' + req.params.project + ':status', {
    locked: 0,
    preview: 0,
  });
  res.end();
});

/* PRINT */
app.post(
  '/project/:project/print',
  aclProject,
  asyncHandler(async (req, res) => {
    validateSourceFiles(PROJECTS_FOLDER, req.params.project, req.body);
    const locked = await redisClient.HGET(
      'project:' + req.params.project + ':status',
      'locked',
    );
    if (locked === '1') {
      return res.status(409).end('ALREADY PRINTING!');
    }

    await redisClient.HSET('project:' + req.params.project + ':status', {
      locked: 1,
      printed: '',
    });
    const PROJECT_FOLDER = PROJECTS_FOLDER + '/' + req.params.project + '/';
    const project = req.params.project;

    saveSourceFilesSync(PROJECTS_FOLDER, req.params.project, req.body);

    fs.readdirSync(PROJECT_FOLDER + 'pdf/').forEach((item) => {
      fs.unlinkSync(PROJECT_FOLDER + 'pdf/' + item);
    });

    res.sendStatus(200);

    ws.to(project + '-notifications').emit('print', {action: 'start'});

    projectOptions(req.params.project, (_err, result) => {
      //sujet.pdf, catalog.pdf, calage.xy
      amcCommande(
        null,
        PROJECT_FOLDER,
        project,
        'generating pdf',
        [
          'prepare',
          '--with',
          'pdflatex',
          '--filter',
          'latex',
          '--mode',
          's[c]',
          '--n-copies',
          result.project.nombre_copies,
          'source.tex',
          '--prefix',
          PROJECT_FOLDER,
          '--latex-stdout',
          '--data',
          PROJECT_FOLDER + 'data',
        ],
        () => {
          //corrige.pdf for all series
          amcCommande(
            null,
            PROJECT_FOLDER,
            project,
            'generating answers pdf',
            [
              'prepare',
              '--with',
              'pdflatex',
              '--filter',
              'latex',
              '--mode',
              'k',
              '--n-copies',
              result.project.nombre_copies,
              'source.tex',
              '--prefix',
              PROJECT_FOLDER,
              '--latex-stdout',
              '--data',
              PROJECT_FOLDER + 'data',
            ],
            () => {
              //create capture and scoring db
              amcCommande(
                null,
                PROJECT_FOLDER,
                project,
                'computing scoring data',
                [
                  'prepare',
                  '--mode',
                  'b',
                  '--n-copies',
                  result.project.nombre_copies,
                  'source.tex',
                  '--prefix',
                  PROJECT_FOLDER,
                  '--data',
                  PROJECT_FOLDER + 'data',
                  '--latex-stdout',
                ],
                () => {
                  //create layout
                  amcCommande(
                    null,
                    PROJECT_FOLDER,
                    project,
                    'calculating layout',
                    [
                      'meptex',
                      '--src',
                      PROJECT_FOLDER + 'calage.xy',
                      '--data',
                      PROJECT_FOLDER + 'data',
                      '--progression-id',
                      'MEP',
                      '--progression',
                      '1',
                    ],
                    () => {
                      // print
                      const params = [
                        'imprime',
                        '--methode',
                        'file',
                        '--output',
                        PROJECT_FOLDER + 'pdf/sheet-%e.pdf',
                        '--sujet',
                        'sujet.pdf',
                        '--data',
                        PROJECT_FOLDER + 'data',
                        '--progression-id',
                        'impression',
                        '--progression',
                        '1',
                      ];
                      if (result.project.split === '1') {
                        params.push('--split');
                      }
                      amcCommande(
                        null,
                        PROJECT_FOLDER,
                        project,
                        'splitting pdf',
                        params,
                        async () => {
                          const pdfs = fs
                            .readdirSync(PROJECT_FOLDER + 'pdf/')
                            .filter((item) => {
                              return item.indexOf('.pdf') > 0;
                            });
                          commitGit(project, req.user?.username || '', 'print');
                          await redisClient.HSET(
                            'project:' + req.params.project + ':status',
                            {
                              locked: 0,
                              printed: new Date().getTime(),
                            },
                          );
                          ws.to(project + '-notifications').emit('print', {
                            action: 'end',
                            pdfs: pdfs,
                          });
                        },
                      );
                    },
                  );
                },
              );
            },
          );
        },
      );
    });
  }),
);

app.get('/project/:project/zip/pdf', aclProject, (req, res) => {
  const zip = new ZipArchive();
  res.on('close', function () {
    return res.end();
  });
  res.attachment(req.params.project + '.zip');
  zip.pipe(res);
  zip.directory(PROJECTS_FOLDER + '/' + req.params.project + '/pdf', 'sujets');
  zip.file(PROJECTS_FOLDER + '/' + req.params.project + '/catalog.pdf', {
    name: 'catalog.pdf',
  });
  zip.file(PROJECTS_FOLDER + '/' + req.params.project + '/corrige.pdf', {
    name: 'corrige.pdf',
  });
  zip.file(PROJECTS_FOLDER + '/' + req.params.project + '/calage.xy', {
    name: 'calage.xy',
  });
  zip.file(APP_FOLDER + '/assets/print.bat', {name: 'print.bat.txt'});
  zip.finalize();
});

/* validation

$delta=0.1
# * {'NO_BOX} is a pointer on an array containing all the student
#   numbers for which there is no box to be filled in the subject
#
# * {'NO_NAME'} is a pointer on an array containing all the student
#   numbers for which there is no name field
#
# * {'SEVERAL_NAMES'} is a pointer on an array containing all the student
#   numbers for which there is more than one name field
'DEFECT_NO_BOX'=>
       {'sql'=>"SELECT student FROM (SELECT student FROM ".$self->table("page")
	." GROUP BY student) AS list"
	." WHERE student>0 AND"
	."   NOT EXISTS(SELECT * FROM ".$self->table("box")." AS local WHERE role=1 AND"
	."              local.student=list.student)"},
       'DEFECT_NO_NAME'=>
       {'sql'=>"SELECT student FROM (SELECT student FROM ".$self->table("page")
	." GROUP BY student) AS list"
	." WHERE student>0 AND"
	."   NOT EXISTS(SELECT * FROM ".$self->table("namefield")." AS local"
	."              WHERE local.student=list.student)"},
       'DEFECT_SEVERAL_NAMES'=>
       {'sql'=>"SELECT student FROM (SELECT student,COUNT(*) AS n FROM "
	.$self->table("namefield")." GROUP BY student) AS counts WHERE n>1"},
# check_positions($delta) checks if all pages has the same positions
# for marks and binary digits boxes. If this is the case (this SHOULD
# allways be the case), check_positions returns undef. If not,
# check_positions returns a hashref
# {student_a=>S1,page_a=>P1,student_b=>S2,page_b=>P2} showing an
# example for which (S1,P1) has not the same positions as (S2,P2)
# (with difference over $delta for at least one coordinate).
'checkPosDigits'=>
       {'sql'=>"SELECT a.student AS student_a,b.student AS student_b,"
	."         a.page AS page_a, b.page AS page_b,* FROM"
	." (SELECT * FROM"
	."   (SELECT * FROM ".$self->table("digit")
	."    ORDER BY student DESC,page DESC)"
	."  GROUP BY numberid,digitid) AS a,"
	."  ".$self->table("digit")." AS b"
	." ON a.digitid=b.digitid AND a.numberid=b.numberid"
	."    AND (abs(a.xmin-b.xmin)>? OR abs(a.xmax-b.xmax)>?"
	."         OR abs(a.ymin-b.ymin)>? OR abs(a.ymax-b.ymax)>?)"
	." LIMIT 1"},
       'checkPosMarks'=>
       {'sql'=>"SELECT a.student AS student_a,b.student AS student_b,"
	."         a.page AS page_a, b.page AS page_b,* FROM"
	." (SELECT * FROM"
	."   (SELECT * FROM ".$self->table("mark")
	."    ORDER BY student DESC,page DESC)"
	."  GROUP BY corner) AS a,"
	."  ".$self->table("mark")." AS b"
	." ON a.corner=b.corner"
	."    AND (abs(a.x-b.x)>? OR abs(a.y-b.y)>?)"
	." LIMIT 1"},
*/

/* CAPTURE*/

app.post(
  '/project/:project/upload',
  aclProject,
  uploadMiddleware.single('file'),
  (req, res) => {
    if (!req.file) return res.sendStatus(500);
    const filename = safeFilename(req.file.originalname);
    const PROJECT_FOLDER = PROJECTS_FOLDER + '/' + req.params.project + '/';
    const project = req.params.project;
    fs.copySync(
      req.file.path,
      projectPath(PROJECTS_FOLDER, req.params.project, 'scans', filename),
    );
    // don't forget to delete all req.files when done
    fs.unlinkSync(req.file.path);

    tmp.file((_err, path, _fd, _cleanup) => {
      fs.writeFileSync(path, 'scans/' + filename);
      // need to call getimage with file to get path of extracted files...
      amcCommande(
        res,
        PROJECT_FOLDER,
        project,
        'extracting images',
        [
          'getimages',
          '--progression-id',
          'getimages',
          '--progression',
          '1',
          '--vector-density',
          '250',
          '--orientation',
          'portrait',
          '--copy-to', // using copy-to to generate correct absolute url (needed for creating correct %PROJECT in DB)
          PROJECT_FOLDER + 'scans',
          '--list',
          path,
        ],
        (logImages) => {
          projectOptions(req.params.project, (_err, result) => {
            const params = [
              'analyse',
              '--tol-marque',
              '0.2,0.2',
              '--prop',
              '0.8',
              '--bw-threshold',
              '0.6',
              '--progression-id',
              'analyse',
              '--progression',
              '1',
              '--projet',
              PROJECT_FOLDER,
              '--cr',
              PROJECT_FOLDER + 'cr',
              '--data',
              PROJECT_FOLDER + 'data',
              '--liste-fichiers',
              path,
            ];
            if (result.project.auto_capture_mode === '1') {
              params.push('--multiple');
              // In multiple mode we must process one file after another in the order we receive them in order to not get mixups
              // force AMC:Queue to 1 process
              params.push('--n-procs');
              params.push('1');
            } else {
              params.push('--n-procs');
              params.push('0');
            }
            amcCommande(
              res,
              PROJECT_FOLDER,
              project,
              'analysing image',
              params,
              async (logAnalyse) => {
                await redisClient.HSET(
                  'project:' + project + ':status',
                  'scanned',
                  new Date().getTime().toString(),
                );
                res.json({
                  logImages: logImages,
                  logAnalyse: logAnalyse,
                });
              },
            );
          });
        },
      );
    });
  },
);

app.get('/project/:project/missing', aclProject, (req, res) => {
  database(req, res, (db) => {
    //TODO in future check that role=1 version>1.2.1
    const query =
      'SELECT a.student as student, a.page as page, a.copy as copy, ok.page IS NULL as missing ' +
      'FROM (SELECT enter.student, enter.page, p.copy FROM ( ' +
      '    SELECT student, page ' +
      '    FROM layout_zone WHERE zone="__n"' +
      '    UNION ' +
      '    SELECT student, page ' +
      '    FROM layout_box) enter, ' +
      '    (SELECT student, copy FROM capture_page GROUP BY student, copy) p' +
      '  WHERE p.student = enter.student) a ' +
      'LEFT JOIN capture_page ok ON a.student = ok.student AND a.page = ok.page AND ok.copy = a.copy ' +
      'ORDER BY student, copy, page';

    db('all', query, (rows) => {
      const seenTotal: any[] = [];
      const seenMissing: any[] = [];
      if (!rows) {
        rows = [];
      }
      const results = rows.reduce(
        (result, page) => {
          const id = page.student + '_' + page.copy;
          if (seenTotal.indexOf(id) < 0) {
            result.complete += 1;
            seenTotal.push(id);
          }
          if (page.missing === 1) {
            result.missing.push(page);
            if (seenMissing.indexOf(id) < 0) {
              result.complete -= 1;
              result.incomplete += 1;
              seenMissing.push(id);
            }
          }
          return result;
        },
        {complete: 0, incomplete: 0, missing: []},
      );

      const query2 = 'SELECT * FROM capture_failed';
      db('all', query2, (rows) => {
        results.failed = rows;
        res.json(results);
      });
    });
  });
});

app.get('/project/:project/capture', aclProject, (req, res) => {
  projectThreshold(req.params.project, (_err, threshold) => {
    database(req, res, (db) => {
      const query =
        "SELECT p.student || '/' || p.page || ':' || p.copy as id, p.student, p.page, p.copy, p.mse, p.timestamp_auto, p.timestamp_manual, " +
        '(SELECT ROUND(10* COALESCE(($threshold - MIN(ABS(1.0*black/total - $threshold)))/ $threshold, 0), 1) ' +
        'FROM capture_zone WHERE student=p.student AND page=p.page AND copy=p.copy AND type=4) s ' +
        'FROM capture_page p ORDER BY p.student, p.page, p.copy';

      db('all', query, {$threshold: threshold}, (rows) => {
        res.json(rows || []);
      });
    });
  });
});

app.get(
  '/project/:project/capture/:student/:page::copy',
  aclProject,
  (req, res) => {
    database(req, res, (db) => {
      const query =
        'SELECT c.src, c.student, c.page, c.copy, c.timestamp_auto, c.timestamp_manual, c.a, c.b, c.c, c.d, c.e, c.f, ' +
        'c.mse, c.layout_image, l.dpi, l.width as originalwidth, l.width, l.height as originalheight, l.height FROM capture_page c JOIN layout_page l ON c.student = l.student AND c.page = l.page WHERE c.student=$student AND c.page=$page AND c.copy=$copy';
      db(
        'get',
        query,
        {
          $student: req.params.student,
          $page: req.params.page,
          $copy: req.params.copy,
        },
        (row) => {
          if (row) {
            imageSizeFromFile(
              PROJECTS_FOLDER +
                '/' +
                req.params.project +
                '/cr/' +
                row.layout_image,
            )
              .catch(() => undefined)
              .then((dimensions) => {
                row.ratiox = 1;
                row.ratioy = 1;
                if (dimensions && dimensions.width && dimensions.height) {
                  row.ratiox = row.width / dimensions.width;
                  row.ratioy = row.height / dimensions.height;
                  row.width = dimensions.width;
                  row.height = dimensions.height;
                }
                res.json(row);
              });
          } else {
            res.sendStatus(404);
          }
        },
      );
    });
  },
);

app.post('/project/:project/capture/setauto', aclProject, (req, res) => {
  database(req, res, (db) => {
    let query =
      'UPDATE capture_page SET timestamp_annotate=0, timestamp_manual=0 WHERE student=$student AND page=$page AND copy=$copy';
    db(
      'run',
      query,
      {
        $student: req.body.student,
        $page: req.body.page,
        $copy: req.body.copy,
      },
      () => {
        query =
          'UPDATE capture_zone SET manual=-1 WHERE student=$student AND page=$page AND copy=$copy';
        db(
          'run',
          query,
          {
            $student: req.body.student,
            $page: req.body.page,
            $copy: req.body.copy,
          },
          async () => {
            await redisClient.HSET(
              'project:' + req.params.project + ':status',
              'scanned',
              new Date().getTime().toString(),
            );
            res.sendStatus(200);
          },
        );
      },
    );
  });
});

/* TODO: support insert for fully manual pages */
app.post('/project/:project/capture/setmanual', aclProject, (req, res) => {
  database(req, res, (db) => {
    let query =
      "UPDATE capture_page SET timestamp_annotate=0, timestamp_manual=strftime('%s','now') WHERE student=$student AND page=$page AND copy=$copy";
    db(
      'run',
      query,
      {
        $student: req.body.student,
        $page: req.body.page,
        $copy: req.body.copy,
      },
      () => {
        query =
          'UPDATE capture_zone SET manual=$manual WHERE student=$student AND page=$page AND copy=$copy AND type=$type AND id_a=$id_a AND id_b=$id_b';
        db(
          'run',
          query,
          {
            $manual: req.body.manual,
            $student: req.body.student,
            $page: req.body.page,
            $copy: req.body.copy,
            $type: req.body.type,

            $id_a: req.body.id_a,

            $id_b: req.body.id_b,
          },
          async () => {
            await redisClient.HSET(
              'project:' + req.params.project + ':status',
              'scanned',
              new Date().getTime().toString(),
            );
            res.sendStatus(200);
          },
        );
      },
    );
  });
});

app.post('/project/:project/capture/delete', aclProject, (req, res) => {
  /*
	1) get image files generated, and remove them
    scan file, layout image, in cr directory, annotated scan, zooms
    */
  database(req, res, (db) => {
    const query =
      "SELECT replace(src, '%PROJET/', '') as path FROM capture_page " +
      'WHERE student=$student AND page=$page AND copy=$copy ' +
      'UNION ' +
      "SELECT 'cr/' || layout_image FROM capture_page " +
      'WHERE student=$student AND page=$page AND copy=$copy ' +
      'UNION ' +
      "SELECT 'cr/corrections/jpg/' || annotated FROM capture_page " +
      'WHERE student=$student AND page=$page AND copy=$copy ' +
      'UNION ' +
      "SELECT 'cr/' || image FROM capture_zone " +
      'WHERE student=$student AND page=$page AND copy=$copy AND image IS NOT NULL';
    db(
      'all',
      query,
      {
        $student: req.body.student,
        $page: req.body.page,
        $copy: req.body.copy,
      },
      (rows) => {
        rows.forEach((row: any) => {
          fs.unlink(
            PROJECTS_FOLDER + '/' + req.params.project + '/' + row.path,
            (err) => {
              console.log('unlick', err);
            },
          );
        });
        // 2) remove data from database
        db(
          'run',
          'DELETE FROM capture_position WHERE zoneid IN (SELECT zoneid FROM capture_zone WHERE student=$student AND page=$page AND copy=$copy)',
          {
            $student: req.body.student,
            $page: req.body.page,
            $copy: req.body.copy,
          },
          () => {
            db(
              'run',
              'DELETE FROM capture_zone WHERE student=$student AND page=$page AND copy=$copy',
              {
                $student: req.body.student,
                $page: req.body.page,
                $copy: req.body.copy,
              },
              () => {
                db(
                  'run',
                  'DELETE FROM capture_page WHERE student=$student AND page=$page AND copy=$copy',
                  {
                    $student: req.body.student,
                    $page: req.body.page,
                    $copy: req.body.copy,
                  },
                  () => {
                    db(
                      'run',
                      'DELETE FROM scoring_score WHERE student=$student AND copy=$copy',
                      {
                        $student: req.body.student,
                        $copy: req.body.copy,
                      },
                      () => {
                        db(
                          'run',
                          'DELETE FROM scoring_mark WHERE student=$student AND copy=$copy',
                          {
                            $student: req.body.student,
                            $copy: req.body.copy,
                          },
                          () => {
                            db(
                              'run',
                              'DELETE FROM scoring_code WHERE student=$student AND copy=$copy',
                              {
                                $student: req.body.student,
                                $copy: req.body.copy,
                              },
                              () => {
                                db(
                                  'run',
                                  'DELETE FROM association_association WHERE student=$student AND copy=$copy',
                                  {
                                    $student: req.body.student,
                                    $copy: req.body.copy,
                                  },
                                  async () => {
                                    await redisClient.HSET(
                                      'project:' +
                                        req.params.project +
                                        ':status',
                                      'scanned',
                                      new Date().getTime().toString(),
                                    );
                                    res.sendStatus(200);
                                  },
                                );
                              },
                            );
                          },
                        );
                      },
                    );
                  },
                );
              },
            );
          },
        );
      },
    );
  });
});

/* ZONES */

app.get(
  '/project/:project/zones/:student/:page::copy',
  aclProject,
  (req, res) => {
    database(req, res, (db) => {
      const query =
        'SELECT z.id_a AS question, z.id_b AS answer, z.total, z.black, ' +
        'z.manual, max(CASE WHEN p.corner = 1 THEN p.x END) as x0, ' +
        'max(CASE WHEN p.corner = 1 THEN p.y END) as y0, ' +
        'max(CASE WHEN p.corner = 2 THEN p.x END) as x1, ' +
        'max(CASE WHEN p.corner = 2 THEN p.y END) as y1, ' +
        'max(CASE WHEN p.corner = 3 THEN p.x END) as x2, ' +
        'max(CASE WHEN p.corner = 3 THEN p.y END) as y2, ' +
        'max(CASE WHEN p.corner = 4 THEN p.x END) as x3, ' +
        'max(CASE WHEN p.corner = 4 THEN p.y END) as y3 ' +
        'FROM capture_zone AS z ' +
        'JOIN capture_position as p ON z.zoneid=p.zoneid ' +
        'WHERE z.student=$student AND z.page=$page AND z.copy=$copy AND z.type=4 AND p.type=1 ' +
        'GROUP BY z.zoneid, z.id_a, z.id_b, z.total, z.black, z.manual ' +
        'ORDER BY min(p.y), min(p.y)';
      db(
        'all',
        query,
        {
          $student: req.params.student,
          $page: req.params.page,
          $copy: req.params.copy,
        },
        (rows) => {
          res.json(rows);
        },
      );
    });
  },
);

/* GRADES */

app.get('/project/:project/scoring', aclProject, (req, res) => {
  const PROJECT_FOLDER = PROJECTS_FOLDER + '/' + req.params.project + '/';
  const project = req.params.project;

  projectOptions(req.params.project, (_err, result) => {
    amcCommande(
      null,
      PROJECT_FOLDER,
      project,
      'computing scoring data',
      [
        'prepare',
        '--mode',
        'b',
        '--n-copies',
        result.project.nombre_copies,
        'source.tex',
        '--prefix',
        PROJECT_FOLDER,
        '--data',
        PROJECT_FOLDER + 'data',
        '--latex-stdout',
      ],
      (logScoring) => {
        res.json(logScoring);
      },
    );
  });
});

app.post('/project/:project/csv', aclProject, (req, res) => {
  const filename = path.resolve(
    PROJECTS_FOLDER,
    req.params.project + '/students.csv',
  );
  fs.writeFile(filename, req.body, function (err: any) {
    if (err) {
      res.sendStatus(500).end();
      return;
    } else {
      //try auto-match
      //TODO get 'etu' from scoring_code?
      amcCommande(
        res,
        PROJECTS_FOLDER + '/' + req.params.project,
        req.params.project,
        'matching students',
        [
          'association-auto',
          '--data',
          PROJECTS_FOLDER + '/' + req.params.project + '/data',
          '--notes-id',
          'etu',
          '--liste',
          filename,
          '--liste-key',
          'id',
        ],
        (log) => {
          res.json({log: log});
        },
      );
    }
  });
});

app.get('/project/:project/csv', aclProject, (req, res) => {
  if (!req.user) return res.sendStatus(403);
  userSaveVisit(req.user.username, req.params.project);
  res.sendFile(
    path.resolve(PROJECTS_FOLDER, req.params.project + '/students.csv'),
  );
});

app.get('/project/:project/gradefiles', aclProject, async (req, res) => {
  try {
    const data = await redisClient.GET(
      'project:' + req.params.project + ':gradefiles',
    );
    res.send(data);
  } catch {
    res.send([]);
  }
});

app.post('/project/:project/gradefiles', aclProject, async (req, res) => {
  await redisClient.SET(
    'project:' + req.params.project + ':gradefiles',
    JSON.stringify(req.body),
  );
  res.sendStatus(200);
});

//could do in db directly?
app.post('/project/:project/association/manual', aclProject, (req, res) => {
  amcCommande(
    res,
    PROJECTS_FOLDER + '/' + req.params.project,
    req.params.project,
    'matching students',
    [
      'association',
      '--data',
      PROJECTS_FOLDER + '/' + req.params.project + '/data',
      '--set',
      '--student',
      req.body.student,
      '--copy',
      req.body.copy,
      '--id',
      req.body.id,
    ],
    (log) => {
      res.json({log: log});
    },
  );
});

app.get('/project/:project/names', aclProject, (req, res) => {
  // LIST OF STUDENTS with their name field and if matched
  database(req, res, (db) => {
    const query =
      'SELECT p.student, p.page, p.copy, z.image, a.manual, a.auto ' +
      'FROM capture_page p JOIN layout.layout_zone l ON p.student=l.student AND p.page = l.page AND l.zone="__n"' +
      'LEFT JOIN capture_zone z ON z.type = 2 AND z.student = p.student AND z.page = p.page AND z.copy = p.copy ' +
      'LEFT JOIN assoc.association_association a ON a.student = p.student AND a.copy = p.copy';

    db('all', query, (rows) => {
      res.json(rows);
    });
  });
});

function calculateMarks(
  project: string,
  callback?: (log: string) => void,
): void {
  const PROJECT_FOLDER = PROJECTS_FOLDER + '/' + project + '/';
  projectOptions(project, (_err, result) => {
    projectThreshold(project, (_err2, threshold) => {
      amcCommande(
        null,
        PROJECT_FOLDER,
        project,
        'calculating marks',
        [
          'note',
          '--data',
          PROJECT_FOLDER + 'data',
          '--seuil',
          threshold,
          '--grain',
          result.project.note_grain,
          '--arrondi',
          result.project.note_arrondi,
          '--notemin',
          result.project.note_min,
          '--notenull',
          result.project.note_null,
          '--notemax',
          result.project.note_max,
          '--plafond',
          '--progression-id',
          'notation',
          '--progression',
          '1',
        ],
        async (log) => {
          await redisClient.HSET(
            'project:' + project + ':status',
            'marked',
            new Date().getTime().toString(),
          );
          if (callback) {
            callback(log);
          }
        },
      );
    });
  });
}

app.get('/project/:project/mark', aclProject, (req, res) => {
  calculateMarks(req.params.project, (log) => {
    res.json(log);
  });
});

app.get('/project/:project/scores', aclProject, async (req, res) => {
  function getScores(): void {
    database(req, res, (db) => {
      const query =
        'SELECT COALESCE(aa.manual, aa.auto) AS id, ss.*, st.title, lb.page ' +
        'FROM scoring_score ss ' +
        'JOIN scoring_title st ON ss.question = st.question ' +
        'JOIN scoring_question sq ON ss.question = sq.question AND ' +
        'ss.student = sq.student AND sq.indicative = 0 ' +
        'LEFT JOIN association_association aa ON aa.student = ss.student AND aa.copy = ss.copy ' +
        'LEFT JOIN (SELECT student, page, question FROM layout_box GROUP BY student, page, question) lb ON lb.student = ss.student AND lb.question = ss.question ' +
        'ORDER BY id, student, copy, title';

      db('all', query, (rows) => {
        res.json(rows);
      });
    });
  }

  //check if we need to update markings
  const results = await redisClient.HMGET(
    'project:' + req.params.project + ':status',
    ['scanned', 'marked'],
  );
  if (results[0] > results[1]) {
    calculateMarks(req.params.project, getScores);
  } else {
    getScores();
  }
});

/* REPORT */

app.get('/project/:project/ods', aclProject, (req, res) => {
  const filename = path.resolve(
    PROJECTS_FOLDER,
    req.params.project + '/students.csv',
  );
  const exportFile = path.resolve(
    PROJECTS_FOLDER,
    req.params.project + '/exports/export.ods',
  );
  amcCommande(
    res,
    PROJECTS_FOLDER + '/' + req.params.project,
    req.params.project,
    'generating ods',
    [
      'export',
      '--module',
      'ods',
      '--data',
      PROJECTS_FOLDER + '/' + req.params.project + '/data',
      '--useall',
      '1',
      '--sort',
      'l',
      '--fich-noms',
      filename,
      '--output',
      exportFile,
      '--option-out',
      'nom=' + req.params.project,
      '--option-out',
      'groupsums=1',
      '--option-out',
      'stats=1',
      '--option-out',
      'columns=student.copy,student.key,student.name',
      '--option-out',
      'statsindic=1',
    ],
    () => {
      res.attachment('export.ods');
      res.sendFile(exportFile);
    },
  );
});

/*
ANNOTATE

*/

app.post('/project/:project/annotate', aclProject, async (req, res) => {
  if (!req.user) return res.sendStatus(403);
  const locked = await redisClient.HGET(
    'project:' + req.params.project + ':status',
    'locked',
  );
  if (locked === '1') {
    return res.status(409).end('ALREADY WORKING!');
  }
  res.sendStatus(200);
  ws.to(req.params.project + '-notifications').emit('annotate', {
    action: 'start',
  });
  await redisClient.HSET('project:' + req.params.project + ':status', {
    locked: 1,
    annotated: '',
  });
  projectOptions(req.params.project, (_err, result) => {
    tmp.file((_err, tmpFile, _fd, cleanup) => {
      const filename = path.resolve(
        PROJECTS_FOLDER,
        req.params.project + '/students.csv',
      );

      const symbols =
        '0-0:' +
        result.project.symbole_0_0_type +
        '/' +
        result.project.symbole_0_0_color +
        ',0-1:' +
        result.project.symbole_0_1_type +
        '/' +
        result.project.symbole_0_1_color +
        ',1-0:' +
        result.project.symbole_1_0_type +
        '/' +
        result.project.symbole_1_0_color +
        ',1-1:' +
        result.project.symbole_1_1_type +
        '/' +
        result.project.symbole_1_1_color;
      // https://gitlab.com/jojo_boulix/auto-multiple-choice/-/blob/master/AMC-gui.pl.in
      const params = [
        'annotate',
        '--progression-id',
        'annotate',
        '--progression',
        '1',
        '--cr',
        PROJECTS_FOLDER + '/' + req.params.project + '/cr',
        '--project',
        PROJECTS_FOLDER + '/' + req.params.project,
        '--projects',
        PROJECTS_FOLDER,
        '--data',
        PROJECTS_FOLDER + '/' + req.params.project + '/data/',
        '--subject',
        PROJECTS_FOLDER + '/' + req.params.project + '/sujet.pdf',
        '--filename-model',
        result.project.modele_regroupement || '(ID)',
        '--force-ascii', //TODO  try without but fix url
        '--sort',
        result.project.export_sort || 'l',
        '--line-width',
        '2',
        '--font-name',
        'Lato Regular 12',
        '--symbols',
        symbols,
        '--no-indicatives', // symboles_indicatives
        '--position',
        result.project.annote_position,
        '--dist-to-box', // used for position = case
        '1cm', // TODO maybe as option
        '--dist-margin',
        '1cm',
        '--dist-margin-global',
        '1cm',
        '--n-digits',
        '2',
        '--verdict',
        result.project.verdict,
        '--verdict-question',
        result.project.verdict_q,
        'verdict-question-cancelled',
        result.project.verdict_qc,
        '--names-file',
        filename,
        '--csv-build-name',
        '(nom|surname) (prenom|name)',
        '--no-rtl',
        '--changes-only', // test if it works or generates problems
        '0',
        '--embedded-max-size',
        '1000x1500',
        'embedded-jpeg-quality',
        '90',
        '--embedded-format',
        'jpeg',
        '--with',
        'pdflatex',
        '--filter',
        'latex',
      ];
      if (req.body.ids) {
        req.body.ids.forEach((id: number) => {
          fs.writeFileSync(tmpFile, String(id));
        });
        params.push('--id-file');
        params.push(tmpFile);
      } else {
        // annotate all but clear folder first
        fs.emptyDirSync(
          PROJECTS_FOLDER + '/' + req.params.project + '/cr/corrections/pdf',
        );
      }
      amcCommande(
        null,
        PROJECTS_FOLDER + '/' + req.params.project,
        req.params.project,
        'annotating pages',
        params,
        async () => {
          cleanup();
          commitGit(req.params.project, req.user?.username || '', 'annotate');
          await redisClient.HSET('project:' + req.params.project + ':status', {
            locked: 0,
            annotated: new Date().getTime(),
          });

          function respond(filename?: string): void {
            ws.to(req.params.project + '-notifications').emit('annotate', {
              action: 'end',
              type: req.body.ids ? 'single' : 'all',
              file: filename,
            });
          }

          function databaseReport(
            project: string,
            student: number,
            copy: number,
            callback: (filename?: string) => void,
          ): void {
            const db = new sqlite3.Database(
              PROJECTS_FOLDER + '/' + project + '/data/report.sqlite',
              (err) => {
                if (err) {
                  callback(undefined);
                  return;
                }
                /*
                    type:
REPORT_ANNOTATED_PDF        => 1,
REPORT_SINGLE_ANNOTATED_PDF => 2,
REPORT_PRINTED_COPY         => 3,
REPORT_ANONYMIZED_PDF       => 4,
                    */
                db.all(
                  'SELECT file FROM report_student WHERE student=$student AND copy=$copy AND type=1',
                  {$student: student, $copy: copy},
                  (_err, rows: any[]) => {
                    let filename = undefined;
                    if (rows && rows.length > 0) {
                      filename = 'cr/corrections/pdf/' + rows[0].file;
                    }
                    db.close((error) => {
                      if (error) console.log(error);
                      callback(filename);
                    });
                  },
                );
              },
            );
          }

          if (req.body.ids) {
            req.body.ids.forEach((id: any) => {
              let student = id;
              let copy = 0;
              if (isNaN(id)) {
                [student, copy] = id.split(':');
              }
              databaseReport(
                req.params.project,
                Number(student),
                Number(copy),
                respond,
              );
            });
          } else {
            respond(undefined);
          }
        },
      );
    });
  });
});

app.get('/project/:project/zip/annotate', aclProject, (req, res) => {
  const zip = new ZipArchive();
  res.on('close', function () {
    return res.end();
  });
  res.attachment(req.params.project + '_annotate.zip');
  zip.pipe(res);
  zip.directory(
    PROJECTS_FOLDER + '/' + req.params.project + '/cr/corrections/pdf',
    'annotate',
  );
  zip.file(APP_FOLDER + '/assets/extractFirstPage.bat', {
    name: 'extractFirstPage.bat.txt',
  });
  zip.file(APP_FOLDER + '/assets/print.bat', {name: 'print.bat.txt'});
  zip.finalize();
});

function mergePdfs(
  project: string,
  correctionsFolder: string,
  destinationFile: string,
) {
  const params = [
    '-c',
    `find ${correctionsFolder} -type f -name '*.pdf' -print0 | sort -z | xargs -0 gs -q -dBATCH -dNOPAUSE -dSAFER -sDEVICE=pdfwrite -sOUTPUTFILE=${destinationFile}`,
  ];
  const cwd = `${PROJECTS_FOLDER}/${project}/cr/corrections`;
  return new Promise((resolve, reject) => {
    const ps = childProcess.spawn('sh', params, {cwd});

    ps.on('close', (code: number) => {
      if (code !== 0) {
        reject(`mergepdf process exited with code ${code}`);
      } else {
        resolve(destinationFile);
      }
    });
  });
}

app.get(
  '/project/:project/merged/all',
  aclProject,
  async (req: express.Request, res: express.Response) => {
    try {
      await mergePdfs(req.params.project, 'pdf', 'combined_all.pdf');
      res.sendFile(
        `${PROJECTS_FOLDER}/${req.params.project}/cr/corrections/combined_all.pdf`,
      );
    } catch (err) {
      console.log(err);
      res.sendStatus(500);
    }
  },
);

function extractFirstPage(project: string) {
  const params = [
    '-c',
    `for file in *.pdf; do gs -dBATCH -dNOPAUSE -dSAFER -sDEVICE=pdfwrite -dFirstPage=1 -dLastPage=1 -sOutputFile="../pdf_firstpage/$file" "$file"; done`,
  ];
  const cwd = `${PROJECTS_FOLDER}/${project}/cr/corrections/pdf`;
  return new Promise((resolve, reject) => {
    const ps = childProcess.spawn('sh', params, {cwd});

    ps.on('close', (code: number) => {
      if (code !== 0) {
        reject(`extractpdf process exited with code ${code}`);
      } else {
        resolve('done');
      }
    });
  });
}

app.get(
  '/project/:project/merged/firstpage',
  aclProject,
  async (req: express.Request, res: express.Response) => {
    try {
      fs.rmSync(
        `${PROJECTS_FOLDER}/${req.params.project}/cr/corrections/pdf_firstpage`,
        {recursive: true, force: true},
      );
      fs.mkdirSync(
        `${PROJECTS_FOLDER}/${req.params.project}/cr/corrections/pdf_firstpage`,
      );
      await extractFirstPage(req.params.project);
      await mergePdfs(
        req.params.project,
        'pdf_firstpage',
        'combined_firstpage.pdf',
      );
      res.sendFile(
        `${PROJECTS_FOLDER}/${req.params.project}/cr/corrections/combined_firstpage.pdf`,
      );
    } catch (err) {
      console.log(err);
      res.sendStatus(500);
    }
  },
);

/*

scoring_score
# * why is a small string that is used to know when special cases has
#   been encountered:
#
#     E means syntax error (several boxes ticked for a simple
#     question, or " none of the above" AND another box ticked for a
#     multiple question).
#
#     V means that no box are ticked.
#
#     P means that a floor has been applied.


*/

app.get('/project/:project/stats', aclProject, (req, res) => {
  //TODO check when updated in db vs options file?
  database(req, res, (db) => {
    let query =
      "SELECT value FROM scoring.scoring_variables WHERE name='darkness_threshold'";
    db('get', query, (setting: any) => {
      let threshold = 0.5; //TODO change?
      if (setting && setting.value) {
        threshold = setting.value;
      }
      database(req, res, (db) => {
        query =
          'SELECT t.question, t.title, q.indicative, q.type, s.max, AVG(s.score) / s.max AS avg ' +
          'FROM scoring.scoring_title t JOIN scoring.scoring_question q ON  t.question = q.question ' +
          'LEFT JOIN scoring.scoring_score s ON s.question = t.question ' +
          "WHERE q.strategy <> 'auto=0' " +
          'GROUP BY t.question, t.title, q.indicative, q.type, s.max ' +
          'ORDER BY t.question';

        db('all', query, (questionsList) => {
          const questions: any = {};
          questionsList.forEach((question: any) => {
            question.answers = [];
            questions[question.question] = question;
          });
          database(req, res, (db) => {
            query =
              "SELECT question, 'all' AS answer, COUNT(*) AS nb, " +
              '0 as correct ' +
              'FROM scoring.scoring_score ' +
              'GROUP BY question ' +
              'UNION ' +
              "SELECT question, 'invalid' AS answer, COUNT(*)-COUNT(NULLIF(why,'E')) AS nb, " +
              '3 as correct ' +
              'FROM scoring.scoring_score ' +
              'GROUP BY question ' +
              'UNION ' +
              "SELECT question, 'empty' AS answer, COUNT(*)-COUNT(NULLIF(why,'V')) AS nb, " +
              '2 as correct ' +
              'FROM scoring.scoring_score ' +
              'GROUP BY question ' +
              'UNION ' +
              'SELECT s.question AS question, z.id_b AS answer, ' +
              'SUM(CASE ' +
              "WHEN s.why='V' THEN 0 " +
              "WHEN s.why='E' THEN 0 " +
              'WHEN z.manual >= 0 THEN z.manual ' +
              'WHEN z.total<=0 THEN 0 ' +
              'WHEN z.black >= $threshold * z.total THEN 1 ' +
              'ELSE 0 ' +
              'END) AS nb, a.correct AS correct ' +
              'FROM capture_zone z JOIN scoring.scoring_score s ' +
              'ON z.student = s.student AND ' +
              'z.copy = s.copy AND ' +
              's.question = z.id_a ' +
              'AND z.type = 4 ' +
              'JOIN scoring.scoring_answer a ON a.student = s.student ' +
              'AND a.question = s.question ' +
              'AND z.id_b = a.answer ' +
              'GROUP BY z.id_a, z.id_b, a.correct';

            db('all', query, {$threshold: threshold}, (rows) => {
              rows.forEach((row: any) => {
                if (questions[row.question]) {
                  if (row.answer === 'all') {
                    questions[row.question].total = row.nb;
                  } else {
                    questions[row.question].answers.push(row);
                  }
                }
              });
              res.json(
                questionsList.map((q) => {
                  return questions[q.question];
                }),
              );
            });
          });
        });
      });
    });
  });
});

//for acl middlware we have to handle its custom httperror
app.use(
  (
    err: any,
    _req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    // Move on if everything is alright
    if (!err) {
      return next();
    }
    if (err instanceof AdminError)
      return res.status(err.status).json({error: err.message});
    if (err instanceof ZodError)
      return res
        .status(400)
        .json({error: err.issues[0]?.message || 'Invalid request'});
    // Something is wrong, inform user
    if (err.errorCode && err.message) {
      res.status(err.errorCode).json(err.message);
    } else if (err.status && err.name) {
      res.status(err.status).json(err.name);
    } else {
      console.log('custom_error_handler_skip:', err);
      console.log(Object.keys(err));
      Sentry.captureException(err);
      next(err);
    }
  },
);

if (env === 'development') {
  app.use(errorHandler({log: true}));
  // for coverage report
  app.get('/debug-exit', () => {
    process.exit();
  });
}

administration.start();
httpServer.listen(process.env.SERVER_PORT);
httpServer.on('listening', function () {
  const address = httpServer.address();
  console.log(
    'server listening on port %d in %s mode',
    typeof address === 'string' ? address : address?.port,
    app.settings.env,
  );
});

export const App = app;
