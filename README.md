# AMCUI

AMCUI's Vue editor, backend and exam model are maintained in one npm workspace.
The backend's Git history is preserved through the monorepo merge; it remains a
separately deployed service.

| Directory | Responsibility |
| --- | --- |
| `apps/web` | Vue/Quasar editor, authentication and MCP consent UI |
| `apps/server` | Express, existing AMC workflows, live documents, OAuth and MCP |
| `packages/exam-core` | Domain types, factories, validation, typed operations, migrations and LaTeX renderer |

Use Node 24 LTS and run commands from this directory:

```sh
npm ci --legacy-peer-deps
npm run build:core
npm run dev
npm run dev:server
```

The server needs Redis, AMC, GraphicsMagick and the SVG converter. Its development
compose file is in `apps/server/docker-compose.yml`. Build the core after changing
it (`npm run build:core`, or `npm run build --workspace=@amcui/exam-core -- --watch`).
Configure the frontend's `window.AMCUI_API` for your local server before development.
Both Dockerfiles use the repository root as their build context:

```sh
docker build -f apps/web/Dockerfile -t amcui-web .
docker build -f apps/server/Dockerfile -t amcui-server .
```

Validation:

```sh
npm run lint:check
npm run format:check
npm run type-check
npm test
npm run test:web
```

Linting and formatting cover all workspaces, including backend tests and the SVG
converter. Run `npm run lint` to apply ESLint fixes and `npm run format` to format
files with Prettier. The `:check` commands report problems without editing files
and run in CI. To target one workspace, use e.g.
`npm run lint:check --workspace=amcui-server` or
`npm run format --workspace=@amcui/exam-core`.

Backend and shared-package lint rules live in `eslint.config.js`; the Vue app
keeps its own config. Prettier uses `.prettierrc.json`, with the backend's existing
style overrides in `apps/server/.prettierrc`. Generated output and runtime data
are excluded from these checks.

The root workflow builds the existing `amcui-grademanager`, `amcui-server` and
`amcui-svg2pdf` images. Earlier frontend documentation is in
[`apps/web/README.md`](apps/web/README.md).

See [MCP setup, tools and collaboration semantics](docs/mcp.md) for connecting an
LLM client and deploying this version with existing project data.
