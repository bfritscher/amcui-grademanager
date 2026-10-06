# Security boundaries

Project file routes validate project names, graphics IDs, filenames and existing
filesystem components before reading, writing or deleting files. Paths cannot
traverse to another project, use Windows drive paths or follow symbolic links.
Legacy print and preview requests validate every code ID before changing working
files or queuing a job.

Rich text from saved projects and live updates passes through DOMPurify before
previewing or importing it into the editor. Formatting, tables, code metadata and
image IDs are retained; executable elements, event handlers and supplied image
URLs are removed. Image URLs are generated from project asset IDs.

Grade and CSV lookup formulas are interpreted as expressions. Supported syntax
includes `row.Grade`, `row["Project Grade"]`, arithmetic, comparisons, logical
operators, `??` and conditional expressions. Examples:

```js
row.Grade * 0.4 + row['Project Grade'] * 0.6;
Math.max(
  1,
  Math.min(6, Math.round(row.Grade * 2) / 2)
)(row['First Name'] + ' ' + row.last_name)
  .trim()
  .toLowerCase();
row.Grade >= 4 ? 'pass' : 'fail';
```

Supported Math functions are `abs`, `ceil`, `floor`, `round`, `trunc`, `min`,
`max`, `pow`, `sqrt`, `log`, `exp` and `sign`, with constants `PI` and `E`.
String methods are `toLowerCase`, `toUpperCase`, `trim`, `slice`, `substring`,
`charAt`, `includes`, `startsWith` and `endsWith`. Scalar conversions include
`Number`, `String`, `parseFloat`, `parseInt`, `isNaN` and `isFinite`.

JavaScript statements, assignments, arbitrary function calls, browser globals,
accessors and prototype access produce an `Error:` result. Existing formulas
using those features must be rewritten using supported expressions.

Document connections recheck token validity and project membership before each
incoming edit, outgoing update and initial handshake. Idle connections are also
checked every 30 seconds. Failed authorization closes the connection with code
1008, and no subsequent document or awareness updates are delivered.

Login requests validate credentials and MFA payloads before authentication.
Malformed requests return HTTP 400, and asynchronous authentication failures are
forwarded to Express error handling.

Sentry source-map uploads require `SENTRY_AUTH_TOKEN` in the build environment.
Without it, the Sentry build plugin is disabled. Set `AMCUI_DISABLE_SENTRY=true`
to disable the plugin explicitly. Any token previously embedded in the build
configuration should be revoked or rotated because it remains in Git history.

## API throttling and password guessing

HTTP requests are limited before body parsing. Redis stores the counters, so
limits are shared across server processes and survive application restarts.
Defaults are 600 API requests per IP per minute, 30 credential requests per IP
per 15 minutes, and 10 failed or incomplete authentication attempts per account
per 15 minutes. Account names are normalized to lowercase. IPv6 addresses share
a /56 subnet budget to prevent bypasses by rotating addresses.

The account budget is shared by login, password changes, and password-protected
MFA changes. Attempts reserve capacity before password/MFA verification, so
concurrent guesses cannot bypass the limit. Only completed authentication is
refunded; an HTTP 200 MFA challenge still counts. Successful authentication does
not erase earlier failures. Password hashing and comparisons use asynchronous
bcrypt calls to avoid blocking the server event loop.

Exceeded limits return HTTP 429 with `Retry-After` and `RateLimit` headers.
Requests are blocked with HTTP 503 if the limiter's Redis store is unavailable.
Limits expire automatically; there is no permanent account lockout. Because an
attacker can temporarily exhaust an account's budget, these limits complement
MFA and strong passwords.

Configure positive integer limits with `AMCUI_API_RATE_LIMIT`,
`AMCUI_AUTH_IP_RATE_LIMIT`, and `AMCUI_AUTH_ACCOUNT_RATE_LIMIT`. Adjust the API
and IP budgets for expected scan-upload bursts and shared school networks.

Forwarding headers are ignored by default. Behind a reverse proxy, set
`AMCUI_TRUST_PROXY` to a comma-separated list of the actual proxy IPs or CIDRs
(for example `172.20.0.2/32`). Keep direct server access restricted and configure
that proxy to overwrite forwarded headers. Do not use `true` or a hop count.

Redis integration tests can run with `AMCUI_TEST_REDIS_URL` pointing to a
disposable loopback Redis instance. Tests use a unique counter namespace and
remove it afterward.
