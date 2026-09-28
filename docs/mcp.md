# MCP exam editing

The backend exposes a model-independent Streamable HTTP MCP endpoint. An LLM
client must support remote MCP, OAuth authorization code flow with PKCE (S256), and
resource indicators. The server does not call an LLM or need an LLM API key.

## Guidance for editors

The server introduction directs models to call `exam_help` before first editing.
The same guide is available at `amcui://help/exam-editing`. It explains the exam
hierarchy, question and section settings, editing workflow, assets, and retries.
Tool input schemas also describe individual fields.

HTML content uses `<code>identifier</code>` for short inline monospace text.
Multiline code uses `code_block_upsert` with plain text and newlines, language,
border, and line-number options. Markdown fences are not interpreted in content
fields. The guide includes examples exercised through an MCP client in tests.

## Deployment

Keep the existing frontend/backend images and project, template, Redis and Yjs
volumes. Deploy the new frontend and backend together: document initialization and
legacy migrations now belong to the server. The existing `/api` and `/api/ws/...`
URLs remain unchanged. Back up Redis, the `YPERSISTENCE` directory and project
files before upgrading. Do not rebuild Yjs state from `data.json`: persisted live
edits can be newer than that export.

Set these backend variables in addition to its existing `JWT_SECRET`,
`SERVER_PORT` and other settings:

```dotenv
MCP_ENABLED=true
MCP_PUBLIC_API_URL=https://exam.example/api
MCP_WEB_URL=https://exam.example/
YPERSISTENCE=/data/db
AMCUI_PROJECTS_DIR=/amc/projects
AMCUI_TEMPLATES_DIR=/amc/templates
```

`MCP_ENABLED` defaults to disabled. Enabling it requires durable Yjs persistence.
Use one backend process for a given set of project/Yjs volumes. Document ownership,
write queues and preview queues are process-local; horizontal replication needs a
shared coordination layer first.

Configure the reverse proxy to route both `/api` and `/.well-known/oauth-*` to
the backend, stripping only `/api`. The production compose file includes these
rules. With the example URLs, discovery is available at:

* `/.well-known/oauth-protected-resource/api/mcp`
* `/.well-known/oauth-authorization-server/api`

Connect the LLM client to `https://exam.example/api/mcp`. It opens the existing
AMCUI login (including configured MFA), then a consent screen to select projects.
Project access is checked again on every tool/resource request. Profile → MCP
connections revokes a grant immediately. Grants last 30 days, access tokens 15
minutes, and refresh tokens rotate. Browser JWTs are not MCP bearer tokens.

Clients can use dynamic registration, HTTPS client metadata documents, or operator
configured `MCP_CLIENTS_JSON` containing an array of OAuth client metadata with
`client_id`, `client_name`, `redirect_uris` and `token_endpoint_auth_method`.
Redirects must use HTTPS or a loopback HTTP URL. Metadata document fetching blocks
private addresses, pins DNS, limits size/time and refuses redirects.

## Tools

| Tools | Purpose |
| --- | --- |
| `projects_list`, `exam_get` | Discover consented projects and exam structure |
| `questions_search`, `question_get` | Find and read questions, choices and solutions |
| `exam_validate` | Report incomplete choice questions and duplicate answer wording |
| `exam_apply_changes` | Apply typed section/question/answer operations atomically |
| `code_blocks_list`, `code_block_get`, `code_block_upsert`, `code_block_delete` | Edit inline and legacy code blocks |
| `graphics_list`, `graphics_get`, `graphics_upload`, `graphics_update`, `graphics_delete` | Manage graphics and references |
| `exam_preview`, `preview_get`, `preview_download` | Capture an exam and compile/download its preview PDF |

Read tools require `exam:read`; mutation/preview tools require `exam:write`.
There are no MCP tools for printing, grading, accounts, project administration,
templates, arbitrary paths, raw Yjs updates or bulk exam replacement.

The usual editing loop is: read the exam, read the target question, apply changes,
validate, then request and poll a preview. Use IDs, not displayed question numbers.
Operations support creating, updating, moving and deleting sections/questions/
answers, plus question duplication. `afterId: null` moves an entity first.
Creation returns generated IDs; use a subsequent request to target a new entity.

Example `exam_apply_changes` arguments:

```json
{
  "projectId": "demo-exam",
  "requestId": "revise-question-17-once",
  "operations": [
    {"op": "question.update", "id": "q-existing-id", "fields": {"content": "<p>What is 2 + 2?</p>"}},
    {"op": "answer.update", "id": "a-existing-id", "fields": {"content": "<p>4</p>", "correct": true}}
  ]
}
```

A batch is limited to 100 operations and validated in a temporary document before
changing live state. Safe rich-text HTML is accepted; scripts, external image URLs
and unsupported attributes are rejected. Graphic references must already exist.
Incomplete SINGLE questions are allowed as drafts and return warnings. MULTIPLE
questions may have no explicit correct choice. Changing a question's type preserves
its existing choices and solution.

Reuse a `requestId` only for an exact retry. The last 200 edit receipts per project
are persisted with the document and scoped to user/client. Reusing an existing ID
with different operations fails. Outside this retained window, read state before
retrying. Asset/code creation and preview submission do not have this retry
guarantee; inspect their results before repeating a timed-out request.

## Live browser collaboration

Browser WebSockets and MCP use the same cached Y.Doc and the same LevelDB document
name (`ws/<project>`). MCP completes only after its updates are persisted. Idle
documents are unloaded after 60 seconds; edits work with no browser connected.
The server migrates legacy JSON only when no section data is present in persisted
Yjs state. Project renames preserve live state; deletion clears persistence without
reinitializing the removed project.

Rich text remains a whole HTML field in a Y.Map. Concurrent edits follow existing
Yjs conflict resolution; this is not character-level collaborative Lexical editing.
Different fields merge independently. For simultaneous edits to one field, clients
converge on the CRDT winner. There is no stale-version rejection or review queue.
Mounted Lexical editors load remote content without echoing it back and reset local
undo history at that boundary; an active caret moves to the end. Browser awareness
locks remain advisory and do not prevent MCP writes.

The shared package owns defaults, serialization, typed operations, legacy
migrations and LaTeX conversion. Vue-specific selection, drag/drop adapters,
notifications and import format parsers stay in the web application. Snapshot
import validates before replacing maps and does not mutate the supplied object.
Project copying and ZIP downloads capture live state. ZIP imports stage and
validate the model before publishing, reject path traversal/symlinks/duplicate
paths, and exclude `.git`. Archives are limited to 10,000 entries, 64 MiB per file
and 512 MiB decompressed total. Import and Git revert update connected clients
through the shared document manager.

## Assets and previews

Upload PNG, JPEG, SVG or PDF as base64 (maximum 16 MiB). SVG can carry an Excalidraw
JSON companion. Upload converts/stages files before publishing metadata and returns
an image reference. Raster/PDF signatures are checked; active SVG content and
external SVG dependencies are rejected. A successful upload returns
an `<img id="...">` reference. Deletion fails while HTML or template source refers
to the asset. Originals/thumbnails are authenticated MCP resources. Inline code
blocks belong to a question, answer or section field; generated code files are
materialized in the render snapshot without mutating the live exam.

Previews capture the current exam and assets into
`<projects>/.previews/<project>/<jobId>`, outside the project's Git directory.
Jobs run sequentially per project (maximum 20 queued/running), with a 120-second
compiler timeout and 64 KiB diagnostic tail. TeX shell escape is disabled and TeX
file access is restricted. This retains the existing trusted-template model;
the worker is not a separate container sandbox.

Poll `preview_get`; on success, `preview_download` returns a resource URI for that
job's immutable PDF. A failed job does not replace a successful PDF. Successful
jobs also update the existing browser preview unless printing is locked. Jobs
interrupted by restart are reported as failed. Artifacts older than seven days are
removed when that project submits its next preview. Existing rendered-body browser
preview requests remain supported with HTTP 200; current browser requests use the
server's live snapshot.

MCP audit entries (identity, client, project, tool, time, outcome) are bounded to
10,000 entries in Redis `mcp:audit`; exam text and tokens are excluded. Audit sink
failures are logged without changing the success result of an already durable edit.

## Verification

`npm test` covers shared operations, atomic failure, conflict convergence, OAuth
grants/revocation, MCP SDK and raw HTTP interoperability, live WebSocket sync,
headless persistence, assets and preview isolation. `npm run test:web` includes a
mounted Lexical remote-update/no-echo test. A real compiler/server smoke test is
available as `apps/server/test-mcp/container-smoke.mjs` and must only target an
isolated local server (`MCP_SMOKE_URL`, default `http://127.0.0.1:9001`). It creates
and removes its own test project/account grant. Vendor-specific hosted LLM client
onboarding should also be checked against the final HTTPS deployment.

Run the complete smoke test in disposable Docker infrastructure with no host data
mounts or published ports:

```sh
docker compose -p amcui-mcp-test -f compose.mcp-test.yml up --build --abort-on-container-exit --exit-code-from smoke
docker compose -p amcui-mcp-test -f compose.mcp-test.yml down -v
```
