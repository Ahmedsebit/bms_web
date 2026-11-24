# Wallinde frontend

Standalone React/TypeScript project. Owns the browser dashboard and authenticated
role-specific `/live` workspace. No Python or Android build dependencies.

## Install, run and check

Run from this folder in PowerShell with Node.js 24:

```powershell
npm ci
npm run dev
```

The local server listens on `http://127.0.0.1:5174`.
The `/` dashboard uses simulated data; `/live` uses backend authentication and
the real API. The dev/preview server forwards `/api/v1` to `127.0.0.1:8000`.
Run the backend separately for live use; the simulated dashboard and mocked
browser tests do not require it.

```powershell
npm run lint
npm run build
npm run test:install
npm run test:e2e
```

Dependencies and pinned resolutions are in `package.json` and `package-lock.json`.
Browser tests are in `tests`; desktop and mobile layouts use Playwright.
For preview use `npm run preview -- --port 5174`.

Production output is `dist`. Deploy it behind approved HTTPS hosting, with
`/live` routed to `index.html` and `/api/v1` reverse-proxied to the backend.
The Node preview server is a local development convenience, not production
hosting. Do not put backend secrets or sensor reader/source tokens in browser
code. Sensor observations reach the live view only through backend APIs.
