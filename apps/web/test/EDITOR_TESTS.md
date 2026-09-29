# Editor regression tests

The component tests mount the real Lexical editor and Quasar controls. Stores are
mocked, but toolbar commands, selection, node plugins, and HTML import/export are
real. `lexical-controls.test.ts` clicks the controls and verifies formatting,
block conversions, image/code properties, inserts, and table actions survive
remounting from exported HTML. It also checks undo/redo and table dialog validation
and cancellation. Console errors fail each case; the upstream Lexical warning is
not suppressed or patched.

`excalidraw-save.test.ts` checks Save As success/failure/retry, saving an existing
drawing, and disabling duplicate submissions. React rendering, SVG export, and
upload are mocked in these unit tests.

Run all web unit tests from the repository root:

```sh
npm run test:web
```

## Browser workflows

`test/cypress/e2e/editor.spec.ts` uses Chrome and a real server. Each test creates
and deletes its own project, independently of the legacy `edit.spec.ts` suite.
It covers formatting/undo/redo, CSS padding and focus outline, table insertion
and actions, image upload/properties/DOM drag events, and opening/discarding the
real drawing canvas. Page reloads verify saved content. It does not call editor
internals or mock persistence. The image fixture is shared with server tests.

With a local development server and backend running (PowerShell):

```powershell
$env:AMCUI_E2E_API_URL = 'http://localhost:9001'
npx cypress run --project apps/web --browser chrome --spec apps/web/test/cypress/e2e/editor.spec.ts --config baseUrl=http://localhost:5173
```

For the built frontend, first build `@amcui/exam-core` and the web app, then run
`npm run test:e2e:editor --workspace=amcui-grademanager`. This starts/stops Vite
preview on port 4173. Set `AMCUI_E2E_API_URL` to a disposable backend URL.

CI runs this browser suite against the disposable services in
`compose.mcp-test.yml` with `compose.e2e.yml`, and uploads screenshots/videos on
failure. Backend project data is confined to those containers.

Remaining gaps include the real Excalidraw Save/upload/SVG-to-PDF pipeline,
keyboard-only accessibility, multi-cell table selection, and collaborative
editing between browsers. A passing unit test is not evidence for these flows.
