# Administration, account approval and compact archives

The admin page loads cached project measurements, with server pagination and name search. It never parses student CSVs, walks folders, counts Git commits or runs maintenance during a list request. A persisted job queue runs disk work in a Node worker thread. Inventory is refreshed at startup, daily, and through the refresh controls. The tables show measurement time, missing folders, failures, job progress and reclaimed bytes. Measurements may be stale until the relevant inventory job finishes.

## Deployment

Account emails include HTML and plain-text versions, personalized greetings and an AMCUI signature. After successful email verification, every address in `AMCUI_ADMIN_EMAILS` receives the requester's name, username, email and a link to administration. Set this list to your administrators' real addresses in production; an empty list sends no admin notifications. The local Docker Compose Mailpit setup defaults to `admin@example.org` (override with `AMCUI_ADMIN_EMAILS`). Activation emails include a direct sign-in link.

Use Node 24, Redis with persistence enabled, and the existing production image with AMC, GraphicsMagick and Ghostscript. Run **one server instance** against a project directory: HTTP/AMC operation tracking and Yjs document locks are process local. The Redis job lease coordinates jobs but does not make the rest of the application safe for multiple server processes. Jobs resume from Redis after a restart; failed jobs expose their error and a Retry action. Back up Redis, the project directory and `YPERSISTENCE` together before rollout and before the first destructive maintenance run. This change does not deploy or archive production data automatically.

Configure `AMCUI_SMTP_HOST`, `AMCUI_MAIL_FROM`, and `AMCUI_WEB_URL` to enable public registration. `AMCUI_WEB_URL` is the externally reachable frontend base URL. Set `AMCUI_SMTP_PORT` (default 587), `AMCUI_SMTP_SECURE=true` for implicit TLS on port 465, and optional `AMCUI_SMTP_USER`/`AMCUI_SMTP_PASSWORD`. STARTTLS is required on other ports. `AMCUI_ADMIN_EMAILS` is a comma-separated notification list. Without SMTP configuration, registration is unavailable and existing users can still sign in. The admin page reports delivery configuration, queued messages and retry failures; message bodies and verification links are never returned by that endpoint. Failed delivery retries with backoff; expired and superseded verification messages are discarded.

Existing credentials are grandfathered as active, with unknown creation/activity dates. There is no migration that disables existing accounts. New users request an account, verify a single-use email link within 24 hours, and wait for admin approval. Verification never signs them in. Admins approve, reject, disable and enable through the admin interface. Account state and session version are checked by HTTP authentication, collaboration connections and MCP. Revoking an account or changing its password/MFA invalidates existing JWTs and MCP grants. Account merges transfer project memberships and activity to the surviving login, preserve its password and MFA, revoke both accounts' sessions/grants, and retire the source login. Administrator roles are not transferred and the last active admin is protected. Historical Git/exam attribution is preserved. A failed merge keeps affected accounts inaccessible until the job is retried; its journal makes retries safe.

For a fresh installation without an existing administrator, run the explicit bootstrap command inside the backend container:

```sh
node /amc/apps/server/dist/admin/bootstrap.js
```

Use an interactive terminal. It asks for a username and a hidden password of at least 12 characters, grants the admin role, and refuses to overwrite an existing account or replace an existing administrator. `AMCUI_REDIS_URL` can override the default `redis://redis:6379` for this operator command. It never runs at server startup. Configure MFA after the first login.

## Activity and operational information

Successful login and human project use are recorded separately from MCP access. Admins can review last login, human activity, MCP activity and project membership. The inactive filter means **24 months since known human activity**; missing history is displayed as Unknown and never proves an account unused. Deactivation, merging and archiving remain explicit actions. Audit entries contain actor, action, target, time and outcome, are kept for 365 days, and exclude exam content, credentials and tokens. Jobs keep their own actor/outcome records. The admin metrics endpoint reports request counts, errors, throttled requests, average/maximum HTTP latency, inventory freshness, pending approvals and mail delivery state. Request counters restart with the process; they are operational diagnostics, not a historical monitoring system.

Configure `AMCUI_TRUST_PROXY` with the actual trusted proxy IPs/CIDRs before relying on per-IP throttles behind a proxy. Defaults are 600 API requests/IP/minute, 30 authentication requests/IP/15 minutes, and 10 unsuccessful or incomplete authentication attempts/account/15 minutes. Redis unavailability makes request protection fail closed. See [security.md](security.md).

## Compact archive

Archive is irreversible exam finalization. It freezes editing, printing, scanning, association changes, regrading and live exports. It preserves:

- Reusable questions, answers, source assets and exam settings.
- Final subject/reference PDFs and one combined PDF of all corrected papers, indexed by AMC student/copy and student ID.
- Unrecognized submitted pages as a separate PDF when conversion succeeds.
- A static results snapshot containing student columns, imported values, final totals/grades, associations and per-question scores, plus downloadable grades CSV/PDF.

The archive viewer has Questions, Documents and Grades tabs. It reads saved results; it never recalculates grades, reads AMC databases or autosaves a student CSV. The project library uses Active/Archived/All filters and name search. Whole-project copying creates an active project with reusable questions/assets/settings and a fresh student list. Selected questions can be copied to another active project. Student records, grades, scans and history are excluded from the new project. Archived document reads and question copying do not repopulate persistent Yjs history.

If cleanup is interrupted after publication, final documents and results stay available and the viewer shows the unfinished cleanup state. Copying remains blocked until an administrator completes or retries cleanup. CSV/JSON preserve full Unicode student text; the standalone grades PDF uses Helvetica and substitutes unsupported characters.

The archive worker waits for in-flight operations, previews and Git work. It checks database integrity, stale grading/annotation flags, saved grades against the same safe formula/rounding rules used by the live UI, student identifiers, copy associations, captured-versus-scored copy coverage, and PDF page counts. Unreferenced scan files, ambiguous multiple copies per student, duplicate question titles, missing final documents, unsupported schemas and conversion failures stop the archive for review. No raw scan or database is deleted in that case; reopen the project, resolve the reported issue, finalize grades/annotations, then retry.

The worker writes `.archive-staging`, hashes its files, verifies every saved document, and publishes `.archive` before deleting anything. It then removes `.git`, `scans`, `cr`, `data` (all AMC SQLite databases), `exports`, `out`, `pdf`, known root build outputs and the external preview cache. Unknown root files and reusable source assets remain. SHA-256 checks and PDF page counts run again before/after cleanup. A published archive stays frozen if cleanup fails; retry completes cleanup from that snapshot. There is no automatic return to grading mode and no deletion grace period. Keep external backups according to your exam retention requirements.

AMC analysis was checked against upstream commit `d4a689c25b2b47bfe31f1beddef67c374bfbac30` (2026-09-25), particularly [`capture.pm`, `scoring.pm`, `association.pm` and `report.pm`](https://gitlab.com/auto-multiple-choice/auto-multiple-choice/-/tree/d4a689c25b2b47bfe31f1beddef67c374bfbac30/AMC-perl/AMC/DataModule). Capture schema 2 can store checkbox zooms in `capture_zone.imagedata` BLOBs; deleting scan files alone does not reclaim that data. The compact archive removes the complete grading databases after producing independent PDFs/results. It does not selectively delete SQLite tables and hope live grading remains usable. Older or customized AMC schemas fail closed if the expected data cannot be read; validate an archived copy of a representative production project before bulk use.

Manual `cleanup_scans.sh` and `gitgc.sh` should no longer be run concurrently with the server. Use queued Git GC for active projects and verified archiving for finalized projects. Git GC compacts retained history; archive removes it entirely.

## Validation

Run `npm run type-check`, `npm test` and `npm run test:web`. Set `AMCUI_TEST_REDIS_URL` to a disposable Redis instance to include account/mail/job integration tests; those tests flush their isolated database and must never point at production Redis. Fixtures cover SQLite image BLOBs, PDF completeness, orphan scans, formula validation, corrupted snapshots, account approval, revocation, interrupted merges, failed email and job recovery. Production builds need `SENTRY_AUTH_TOKEN` only when uploading sourcemaps; set `AMCUI_DISABLE_SENTRY=true` for local build verification.

`container-smoke.mjs` verifies real AMC PDF generation, OAuth and collaboration inside disposable Linux infrastructure. Run `container-admin-smoke.mjs` **inside its disposable server container** to verify the complete archive HTTP flow, database/scan deletion, static downloads, fresh copying, malformed login handling, MFA session revocation and last-admin protection. Both scripts seed synthetic test accounts; neither should run against production. The archive HTTP fixture uses a synthetic AMC database schema, so it does not replace validation with a representative project from your installed AMC version.
