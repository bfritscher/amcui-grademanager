
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

```
touch traefik/acme.json
chmod 600 traefik/acme.json
docker-compose -f docker-compose.production.yml pull
docker-compose -f docker-compose.production.yml build
docker-compose -f docker-compose.production.yml up -d
```

