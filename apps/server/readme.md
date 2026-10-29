## deployment

Account approval, SMTP settings, maintenance jobs, activity tracking and compact archive behavior are documented in [docs/admin.md](../../docs/admin.md). Existing accounts remain active. Configure SMTP before enabling new registrations; use the explicit bootstrap command for a fresh installation.

### frontend

```
git clone https://github.com/bfritscher/grademanager frontend
docker-compose build
docker-compose up
```

This will create the frontend/dist/spa folder

### backend

create and configure .env file

```
NODE_ENV=development|production
SERVER_PORT=9001
JWT_SECRET=
SENTRY_DSN=
ADMIN_USER= # default user which will be admin (more user can be added via the admin project)
FRONTEND_DOMAIN=
YPERSISTENCE=/data/db
# Behind a reverse proxy, list the actual trusted proxy IPs/CIDRs:
AMCUI_TRUST_PROXY=172.20.0.2/32
# Optional throttling defaults (positive integers):
AMCUI_API_RATE_LIMIT=600
AMCUI_AUTH_IP_RATE_LIMIT=30
AMCUI_AUTH_ACCOUNT_RATE_LIMIT=10
```

### production reverse proxy (Traefik v3)

Run the following commands from `apps/server` on the deployment host. Use Docker
Compose (`docker compose`) and Docker Engine 19.03 or newer (API 1.40 or newer),
as required by the Traefik Docker provider.

The production compose file pins Traefik to
[v3.7.16](https://github.com/traefik/traefik/releases/tag/v3.7.16). Set the ACME
contact email in `traefik/traefik.yml` and configure `FRONTEND_DOMAIN` and
`SERVER_PORT` in `.env`. Ports 80 and 443 must reach the proxy for HTTPS and the
ACME HTTP challenge.

```sh
docker network inspect web >/dev/null 2>&1 || docker network create web
test -f traefik/acme.json || touch traefik/acme.json
chmod 600 traefik/acme.json
docker compose -f docker-compose.production.yml config --quiet
docker compose -f docker-compose.production.yml pull
docker compose -f docker-compose.production.yml up -d
```

#### upgrading from Traefik v2

Before replacing the deployed files, back up `docker-compose.production.yml`,
`traefik/traefik.yml`, `traefik/conf.yml` and `traefik/acme.json`. Keep the existing
ACME email and certificate store; the same file remains mounted at `/acme.json`
with mode `600`, and the resolver is still named `myresolver`.

Apply the compose and Traefik configuration changes together, then run the
commands above. Recreate `amcuiserver` and `grademanager` as well as the proxy so
Docker receives the updated routing labels.

The `web` entrypoint now handles permanent HTTP-to-HTTPS redirects for all hosts,
replacing the duplicated redirect middleware and HTTP router labels. ACME HTTP
challenges remain on `web` and are compatible with this redirect. HTTPS routers
keep the frontend, `/api` (with the prefix stripped), and `/.well-known/oauth-*`
(without stripping) routes. TLS still requires at least version 1.2 through
`traefik/conf.yml`.

The `Host` and `PathPrefix` rules already use the v3 syntax, so no v2 `ruleSyntax`
or `core.defaultRuleSyntax` compatibility setting is needed. See the official
[v2-to-v3 configuration changes](https://doc.traefik.io/traefik/migrate/v2-to-v3-details/)
and [v3 migration notes](https://doc.traefik.io/traefik/migrate/v3/) for any local
customizations.

HTTPS requests have a five-minute read timeout, including the time spent uploading
the request body, to allow longer scan uploads and archive imports. This is set by
`entryPoints.websecure.transport.respondingTimeouts.readTimeout: 5m` in
`traefik/traefik.yml`, overriding Traefik's 60-second default. Restart the proxy
after changing this static configuration with
`docker compose -f docker-compose.production.yml restart reverse-proxy`. See the
[timeout migration note](https://doc.traefik.io/traefik/v2.11/migration/v2/#entrypointtransportrespondingtimeoutsreadtimeout).

Check startup logs and verify HTTP redirects, frontend access, API requests,
OAuth discovery and live document/WebSocket connections:

```sh
docker compose -f docker-compose.production.yml logs --tail=100 reverse-proxy
curl -I http://YOUR_FRONTEND_DOMAIN/
curl -f https://YOUR_FRONTEND_DOMAIN/
curl -f https://YOUR_FRONTEND_DOMAIN/.well-known/oauth-authorization-server/api
```

For rollback, stop the proxy, restore the backed-up compose and Traefik files
(including `acme.json` with mode `600`), then run `docker compose -f
docker-compose.production.yml up -d` to restore the previous image and labels.
