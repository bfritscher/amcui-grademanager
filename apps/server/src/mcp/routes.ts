import express, {type RequestHandler} from 'express';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {
  McpServer,
  ResourceTemplate,
} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {authorizationHandler} from '@modelcontextprotocol/sdk/server/auth/handlers/authorize.js';
import {tokenHandler} from '@modelcontextprotocol/sdk/server/auth/handlers/token.js';
import {clientRegistrationHandler} from '@modelcontextprotocol/sdk/server/auth/handlers/register.js';
import {revocationHandler} from '@modelcontextprotocol/sdk/server/auth/handlers/revoke.js';
import {requireBearerAuth} from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import type {AuthInfo} from '@modelcontextprotocol/sdk/server/auth/types.js';
import {
  applyChanges,
  readExam,
  validateExam,
  plainText,
  operationsSchema,
  patchEntity,
  referencesTo,
} from '@amcui/exam-core';
import {ExamDocuments} from '../exam/documents.js';
import {ExamAssets} from '../exam/assets.js';
import {ExamPreviews} from '../exam/previews.js';
import {ExamOAuth} from './oauth.js';
import {examGuide, examGuideUri, examInstructions} from './guide.js';

const projectId = z.string().min(1).max(200);
const id = z.string().regex(/^[\w-]{1,200}$/);
const owner = {
  entityId: id.describe('Stable ID of the section, question, or answer choice that owns the code block.'),
  field: z.enum(['content', 'answer']).describe('content for section/question/choice HTML; answer only for an OPEN question model solution.'),
};
const page = {
  offset: z.number().int().min(0).default(0),
  limit: z.number().int().min(1).max(100).default(50),
};
const dataResult = (data: any) => ({
  content: [{type: 'text' as const, text: JSON.stringify(data)}],
  structuredContent:
    data && typeof data === 'object' && !Array.isArray(data)
      ? data
      : {items: data},
});
export interface McpDependencies {
  oauth: ExamOAuth;
  documents: ExamDocuments;
  assets: ExamAssets;
  previews: ExamPreviews;
  publicApiUrl: string;
  webUrl: string;
  secure: RequestHandler;
  projects: (username: string) => Promise<string[]>;
  allowed: (username: string, project: string) => Promise<boolean>;
  audit: (event: Record<string, unknown>) => Promise<void>;
}
export function createExamMcp(deps: McpDependencies, auth: AuthInfo) {
  const server = new McpServer(
    {name: 'amcui', version: '1.0.0'},
    {
      instructions: examInstructions,
    },
  );
  const username = String(auth.extra?.username || '');
  const grants = (auth.extra?.projects as string[]) || [];
  const access = async (project: string, write = false) => {
    ExamDocuments.projectName(project);
    if (
      !auth.scopes.includes(write ? 'exam:write' : 'exam:read') ||
      !grants.includes(project) ||
      !(await deps.allowed(username, project))
    )
      throw new Error('FORBIDDEN: project or scope');
  };
  function tool(
    name: string,
    description: string,
    schema: z.ZodObject<any>,
    write: boolean,
    run: (args: any) => Promise<any>,
  ) {
    if (!auth.scopes.includes(write ? 'exam:write' : 'exam:read')) return;
    server.registerTool(
      name,
      {
        description,
        inputSchema: schema.shape,
        annotations: {
          readOnlyHint: !write,
          destructiveHint: write,
          openWorldHint: false,
        },
      },
      async (args: any) => {
        try {
          if (args.projectId) await access(args.projectId, write);
          if (
            JSON.stringify(args).length > 2_000_000 &&
            name !== 'graphics_upload'
          )
            throw new Error('REQUEST_TOO_LARGE');
          const result = await run(args);
          if (write) {
            // The edit is already durable. An unavailable audit sink must not invite
            // a client to repeat a non-idempotent upload or code-block creation.
            try {
              await deps.audit({
                username,
                clientId: auth.clientId,
                project: args.projectId,
                tool: name,
                result: 'success',
                at: new Date().toISOString(),
              });
            } catch (error) {
              console.error('MCP audit write failed', name, error);
            }
          }
          return dataResult(result);
        } catch (error) {
          if (write) {
            await deps
              .audit({
                username,
                clientId: auth.clientId,
                project: args.projectId,
                tool: name,
                result: 'failed',
                at: new Date().toISOString(),
              })
              .catch(() => {});
          }
          const message =
            error instanceof Error ? error.message : 'Operation failed';
          return {
            isError: true,
            content: [{type: 'text' as const, text: message}],
          };
        }
      },
    );
  }
  tool(
    'exam_help',
    'Read before first editing: exam structure, section/question settings, HTML inline monospace, multiline code blocks, examples, and editing workflow. No project data is accessed.',
    z.object({}),
    false,
    async () => ({guide: examGuide}),
  );
  server.registerResource(
    'exam-editing-guide',
    examGuideUri,
    {mimeType: 'text/markdown', description: 'AMCUI exam model, formatting, settings, and tool examples. Also available through exam_help.'},
    async (uri) => ({
      contents: [{uri: uri.href, mimeType: 'text/markdown', text: examGuide}],
    }),
  );
  tool(
    'projects_list',
    'List authorized projects.',
    z.object({}),
    false,
    async () => ({
      projects: (await deps.projects(username)).filter((p) =>
        grants.includes(p),
      ),
    }),
  );
  tool(
    'exam_get',
    'Read exam structure, settings and question summaries. Use question_get for full content.',
    z.object({projectId}),
    false,
    async ({projectId}) =>
      deps.documents.withDocument(projectId, (doc) => {
        const exam = readExam(doc);
        return {
          sections: exam.sections.map((s) => ({
            ...s,
            questions: s.questions.map((q) => ({
              id: q.id,
              number: q.number,
              type: q.type,
              text: plainText(q.content),
              isValid: q.isValid,
            })),
          })),
          properties: exam.properties,
          warnings: validateExam(exam),
        };
      }),
  );
  tool(
    'questions_search',
    'Search question and answer text.',
    z.object({
      projectId,
      query: z.string().max(1000),
      sectionId: id.optional(),
      ...page,
    }),
    false,
    async (args) =>
      deps.documents.withDocument(args.projectId, (doc) => {
        const questions = readExam(doc)
          .sections.filter((s) => !args.sectionId || s.id === args.sectionId)
          .flatMap((s) => s.questions)
          .filter((q) =>
            [
              q.content,
              q.answer || '',
              ...q.answers.map((a) => a.content),
            ].some((text) =>
              plainText(text).toLowerCase().includes(args.query.toLowerCase()),
            ),
          );
        return {
          total: questions.length,
          questions: questions
            .slice(args.offset, args.offset + args.limit)
            .map((q) => ({
              id: q.id,
              sectionId: q.section,
              number: q.number,
              type: q.type,
              text: plainText(q.content),
            })),
        };
      }),
  );
  tool(
    'question_get',
    'Read a question, its answer choices and open solution.',
    z.object({projectId, questionId: id}),
    false,
    async (args) =>
      deps.documents.withDocument(args.projectId, (doc) => {
        const exam = readExam(doc),
          question = exam.sections
            .flatMap((s) => s.questions)
            .find((q) => q.id === args.questionId);
        if (!question) throw new Error('NOT_FOUND: question');
        return {
          question,
          text: plainText(question.content),
          graphics: Object.values(exam.graphics).filter((g) =>
            referencesTo(exam, g.id).some(
              (f) =>
                f.entityId === question.id ||
                question.answers.some((a) => a.id === f.entityId),
            ),
          ),
        };
      }),
  );
  tool(
    'exam_validate',
    'Check pedagogical consistency without changing the exam.',
    z.object({projectId, questionIds: z.array(id).optional()}),
    false,
    async (args) =>
      deps.documents.withDocument(args.projectId, (doc) => ({
        warnings: validateExam(readExam(doc)).filter(
          (d) => !args.questionIds || args.questionIds.includes(d.entityId),
        ),
      })),
  );
  tool(
    'exam_apply_changes',
    'Apply typed operations in one transaction. Read exam_help before first editing. Content is HTML: inline <code> for monospace; code_block_upsert for multiline code. afterId:null moves to the beginning. Supply the same requestId only for an exact retry.',
    z.object({
      projectId,
      requestId: z.string().min(1).max(128),
      operations: operationsSchema,
    }),
    true,
    async (args) =>
      deps.documents.withDocument(args.projectId, (doc) => {
        const key = createHash('sha256')
          .update(`${username}\0${auth.clientId}\0${args.requestId}`)
          .digest('hex');
        const fingerprint = createHash('sha256')
          .update(JSON.stringify(args.operations))
          .digest('hex');
        const receipts = doc.getMap<any>('_mcpReceipts');
        const previous = receipts.get(key);
        if (previous) {
          if (previous.fingerprint !== fingerprint)
            throw new Error('REQUEST_ID_REUSED');
          return previous.result;
        }
        let result: any;
        doc.transact(
          () => {
            const change = applyChanges(doc, args.operations, {
              username,
              clientId: auth.clientId,
            });
            const ids = new Set(change.affectedIds);
            result = {
              affectedIds: change.affectedIds,
              sections: change.exam.sections
                .filter((s) => ids.has(s.id))
                .map((s) => ({
                  ...s,
                  questions: s.questions.map((q) => ({
                    id: q.id,
                    number: q.number,
                  })),
                })),
              questions: change.exam.sections
                .flatMap((s) => s.questions)
                .filter(
                  (q) => ids.has(q.id) || q.answers.some((a) => ids.has(a.id)),
                ),
              warnings: change.warnings,
            };
            receipts.set(key, {fingerprint, result, timestamp: Date.now()});
            if (receipts.size > 200)
              [...receipts.entries()]
                .sort((a, b) => a[1].timestamp - b[1].timestamp)
                .slice(0, receipts.size - 200)
                .forEach(([id]) => receipts.delete(id));
          },
          {username, clientId: auth.clientId},
        );
        return result;
      }),
  );
  tool(
    'code_blocks_list',
    'List inline and legacy code blocks with their owning fields.',
    z.object({projectId}),
    false,
    async (args) =>
      deps.documents.withDocument(args.projectId, (doc) => ({
        blocks: deps.assets.codeBlocks(doc),
      })),
  );
  tool(
    'code_block_get',
    'Read a code block by owner and ID.',
    z.object({projectId, ...owner, id}),
    false,
    async (args) =>
      deps.documents.withDocument(args.projectId, (doc) => {
        const block = deps.assets
          .codeBlocks(doc)
          .find(
            (b) =>
              b.id === args.id &&
              b.entityId === args.entityId &&
              b.field === args.field,
          );
        if (!block) throw new Error('NOT_FOUND: code block');
        return block;
      }),
  );
  tool(
    'code_block_upsert',
    'Create or update a formatted code block for multiline source. Send plain text with newlines, not HTML or Markdown fences. Omit id to append; provide the existing id to update. For inline monospace use <code>text</code> in HTML via exam_apply_changes.',
    z.object({
      projectId,
      ...owner,
      id: id.optional(),
      content: z.string().max(500_000).describe('Plain source code. Preserve indentation and actual newlines; JSON encodes newlines as \\n. Do not HTML-escape or include Markdown fences.'),
      mode: z.string().max(100).optional().describe('Syntax highlighting language, e.g. python or javascript. New blocks default to javascript.'),
      border: z.boolean().optional().describe('Draw a frame around the code block; new blocks default to true.'),
      numbers: z.boolean().optional().describe('Show line numbers; new blocks default to false.'),
    }),
    true,
    async (args) =>
      deps.documents.withDocument(args.projectId, (doc) =>
        deps.assets.upsertCode(doc, args, {
          id: args.id,
          content: args.content,
          mode: args.mode,
          border: args.border,
          numbers: args.numbers,
        }),
      ),
  );
  tool(
    'code_block_delete',
    'Remove a code block from its owning content field.',
    z.object({projectId, ...owner, id}),
    true,
    async (args) =>
      deps.documents.withDocument(args.projectId, (doc) =>
        deps.assets.deleteCode(doc, args, args.id),
      ),
  );
  tool(
    'graphics_list',
    'List graphics and where they are referenced.',
    z.object({projectId}),
    false,
    async (args) =>
      deps.documents.withDocument(args.projectId, (doc) => {
        const exam = readExam(doc);
        return {
          graphics: Object.values(exam.graphics).map((g) => ({
            ...g,
            references: referencesTo(exam, g.id),
          })),
        };
      }),
  );
  tool(
    'graphics_get',
    'Read graphic metadata and a resource URI for downloading the original or thumbnail.',
    z.object({projectId, id, thumbnail: z.boolean().default(false)}),
    false,
    async (args) =>
      deps.documents.withDocument(args.projectId, (doc) => {
        const graphic = readExam(doc).graphics[args.id];
        if (!graphic) throw new Error('NOT_FOUND: graphic');
        return {
          graphic,
          uri: `amcui://projects/${args.projectId}/graphics/${args.id}/${args.thumbnail ? 'thumbnail' : 'original'}`,
        };
      }),
  );
  tool(
    'graphics_upload',
    'Upload JPEG, PNG, SVG or PDF as base64 (max 16 MiB). SVG may include an Excalidraw JSON companion. Returns an HTML reference to insert with exam_apply_changes.',
    z.object({
      projectId,
      name: z.string().max(255),
      mimeType: z.enum([
        'image/jpeg',
        'image/png',
        'image/svg+xml',
        'application/pdf',
      ]),
      base64: z.string().max(22_369_624),
      excalidraw: z.string().max(5_000_000).optional(),
    }),
    true,
    async (args) =>
      deps.documents.withDocument(args.projectId, (doc) =>
        deps.assets.upload(args.projectId, doc, args),
      ),
  );
  tool(
    'graphics_update',
    'Update graphic display defaults.',
    z.object({
      projectId,
      id,
      fields: z
        .object({
          border: z.boolean().optional(),
          width: z.number().positive().max(2).optional(),
          options: z.string().max(1000).optional(),
        })
        .strict(),
    }),
    true,
    async (args) =>
      deps.documents.withDocument(args.projectId, (doc) => {
        patchEntity(doc, 'graphics', args.id, {
          ...args.fields,
          updatedAt: String(Date.now()),
        });
        return {graphic: readExam(doc).graphics[args.id]};
      }),
  );
  tool(
    'graphics_delete',
    'Delete an unreferenced graphic and its files. Fails while it is referenced.',
    z.object({projectId, id}),
    true,
    async (args) =>
      deps.documents.withDocument(args.projectId, (doc) =>
        deps.assets.deleteGraphic(args.projectId, doc, args.id),
      ),
  );
  tool(
    'exam_preview',
    'Capture the current exam and render a PDF asynchronously. Does not print an exam.',
    z.object({projectId}),
    true,
    async (args) => deps.previews.enqueue(args.projectId, username),
  );
  tool(
    'preview_get',
    'Read preview job status and compiler diagnostics.',
    z.object({projectId, jobId: id}),
    false,
    async (args) => deps.previews.get(args.projectId, args.jobId),
  );
  tool(
    'preview_download',
    'Get the resource URI for a completed preview PDF.',
    z.object({projectId, jobId: id}),
    false,
    async (args) => {
      const job = await deps.previews.get(args.projectId, args.jobId);
      if (job.status !== 'succeeded') throw new Error('PREVIEW_NOT_READY');
      return {
        mimeType: 'application/pdf',
        uri: `amcui://projects/${args.projectId}/previews/${args.jobId}`,
      };
    },
  );
  server.registerResource(
    'graphics',
    new ResourceTemplate('amcui://projects/{project}/graphics/{id}/{variant}', {
      list: undefined,
    }),
    {description: 'Graphic original or thumbnail'},
    async (uri, variables) => {
      const project = String(variables.project);
      await access(project);
      if (!['original', 'thumbnail'].includes(String(variables.variant)))
        throw new Error('INVALID_VARIANT');
      const asset = await deps.documents.withDocument(project, (doc) =>
        deps.assets.getGraphic(
          project,
          doc,
          String(variables.id),
          variables.variant === 'thumbnail',
        ),
      );
      return {
        contents: [{uri: uri.href, mimeType: asset.mimeType, blob: asset.data}],
      };
    },
  );
  server.registerResource(
    'preview',
    new ResourceTemplate('amcui://projects/{project}/previews/{id}', {
      list: undefined,
    }),
    {mimeType: 'application/pdf'},
    async (uri, variables) => {
      const project = String(variables.project);
      await access(project);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/pdf',
            blob: await deps.previews.download(project, String(variables.id)),
          },
        ],
      };
    },
  );
  return server;
}

export function installMcp(app: express.Express, deps: McpDependencies) {
  const base = deps.publicApiUrl.replace(/\/$/, ''),
    issuer = new URL(base),
    resource = `${base}/mcp`;
  if (
    issuer.protocol !== 'https:' &&
    !['localhost', '127.0.0.1'].includes(issuer.hostname)
  )
    throw new Error('MCP_PUBLIC_API_URL must use HTTPS');
  const metadataPath = `/.well-known/oauth-protected-resource${issuer.pathname === '/' ? '' : issuer.pathname}/mcp`;
  const metadataUrl = new URL(metadataPath, issuer).href;
  const oauthMetadata = {
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    registration_endpoint: `${base}/oauth/register`,
    revocation_endpoint: `${base}/oauth/revoke`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
    scopes_supported: ['exam:read', 'exam:write'],
    client_id_metadata_document_supported: true,
  };
  app.get(
    [
      '/.well-known/oauth-authorization-server',
      `/.well-known/oauth-authorization-server${issuer.pathname === '/' ? '' : issuer.pathname}`,
    ],
    (_req, res) => res.json(oauthMetadata),
  );
  app.get(metadataPath, (_req, res) =>
    res.json({
      resource,
      authorization_servers: [base],
      scopes_supported: ['exam:read', 'exam:write'],
      resource_name: 'AMCUI Exam Editor',
    }),
  );
  app.use('/oauth/authorize', authorizationHandler({provider: deps.oauth}));
  app.use('/oauth/token', tokenHandler({provider: deps.oauth}));
  app.use(
    '/oauth/register',
    clientRegistrationHandler({clientsStore: deps.oauth.clientsStore}),
  );
  app.use('/oauth/revoke', revocationHandler({provider: deps.oauth}));
  const browser =
    (run: (req: express.Request) => Promise<unknown>): RequestHandler =>
    (req, res, next) => {
      res.setHeader('Cache-Control', 'no-store');
      void run(req)
        .then((result) => res.json(result))
        .catch(next);
    };
  app.get(
    '/profile/mcp/authorize/:ticket',
    deps.secure,
    browser((req) => deps.oauth.pending(req.params.ticket, req.user!.username)),
  );
  app.post(
    '/profile/mcp/authorize/:ticket',
    deps.secure,
    browser(async (req) => {
      const input = z
        .object({projects: z.array(projectId).max(200), allow: z.boolean()})
        .parse(req.body);
      return {
        redirect: await deps.oauth.consent(
          req.params.ticket,
          req.user!.username,
          input.projects,
          input.allow,
        ),
      };
    }),
  );
  app.get(
    '/profile/mcp/grants',
    deps.secure,
    browser((req) => deps.oauth.grants(req.user!.username)),
  );
  app.delete(
    '/profile/mcp/grants/:id',
    deps.secure,
    browser(async (req) => {
      await deps.oauth.revokeGrant(req.user!.username, req.params.id);
      return {revoked: true};
    }),
  );
  const bearer = requireBearerAuth({
    verifier: deps.oauth,
    resourceMetadataUrl: metadataUrl,
  });
  app.all('/mcp', bearer, (req, res, next) => {
    if (
      req.headers.origin &&
      req.headers.origin !== new URL(deps.webUrl).origin
    ) {
      res.status(403).json({error: 'Origin not allowed'});
      return;
    }
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      res.status(405).end();
      return;
    }
    const server = createExamMcp(deps, req.auth!);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    void server
      .connect(transport)
      .then(() => transport.handleRequest(req, res, req.body))
      .catch(next);
  });
}
