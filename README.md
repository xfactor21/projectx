# project.X

project.X is a standalone visual project manager built with React, TypeScript, and Vite. The current application is a browser-based, local-first manager for project records with public GitHub discovery, a server-side Vercel deployment adapter, manual Supabase cloud backup/restore, JSON import/export, multiple visual presentation modes, and a runtime recovery screen.

This README describes only functionality that exists in the current codebase.

## Requirements

- Node.js. GitHub Actions currently verifies the project with Node 22; the checked-in Vercel project configuration currently deploys on Node 24.x.
- npm, using the checked-in `package-lock.json`.
- A modern browser with `localStorage` for the local project store.
- Optional external accounts/configuration for Supabase and Vercel integrations.

## Install and run locally

Clone the repository and install the locked dependency set:

```bash
git clone https://github.com/xfactor21/projectx.git
cd projectx
npm ci
```

Start the Vite development server:

```bash
npm run dev -- --host 127.0.0.1 --port 5175
```

Then open the URL printed by Vite, normally `http://127.0.0.1:5175` with the command above.

### Verify a local checkout

```bash
npm run build
npm run lint
```

`npm run build` runs TypeScript project builds followed by the Vite production build. `npm run lint` runs Oxlint.

A production bundle can be previewed locally with:

```bash
npm run preview
```

## Environment configuration

Copy `.env.example` to `.env.local` for local Vite environment values. Do not commit private tokens.

### Supabase cloud backup/authentication

The browser client reads:

```text
VITE_SUPABASE_URL=https://lufvkrnwqbqdaqcgljxt.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=...
```

The client also accepts `VITE_SUPABASE_ANON_KEY` as a legacy fallback. Use a Supabase publishable/anon key only; never expose a service-role or secret key to the browser.

Before cloud project operations can work, apply:

```text
supabase/migrations/20260818_projectx_phase4.sql
```

The migration creates `projectx_projects` and `projectx_activity`, enables row-level security, and adds policies that scope rows to `auth.uid()`.

The current cloud UI supports email/password sign-up/sign-in, manual project backup, manual project restore, and sign-out. Restore replaces the browser's project array in `localStorage` and reloads the page.

### Vercel deployment sync

The Vercel token is intentionally server-side. Configure these in the Vercel project environment:

```text
VERCEL_API_TOKEN=...
VERCEL_TEAM_ID=...
```

`VERCEL_TEAM_ID` is optional in the API handler; when present it is sent as the Vercel API `teamId` query parameter.

The browser calls `/api/vercel-projects`. Plain `vite` development does not run the repository's Vercel `/api` function, so Vercel sync reports itself unavailable when the app is run only with `npm run dev`. The adapter is intended for the Vercel-hosted deployment (or another environment that runs that function).

### GitHub discovery

GitHub discovery requires no application secret. The browser calls GitHub's public REST API directly for the selected owner. The current implementation requests up to 100 owner repositories, filters out forks, and is subject to GitHub's unauthenticated public API rate limits.

## Core features implemented

- Create and edit project records.
- Delete projects with browser confirmation.
- Archive and restore projects.
- Favorite/unfavorite projects.
- Search project name, subtitle, description, stack, and synced GitHub full name.
- Filter by `Live`, `Building`, `Concept`, and `Paused` status.
- Track description, stack, accent, progress, repository URL, live URL, cover URL, and notes.
- Project detail drawer with GitHub metadata when available.
- Project counts, live count, connected-GitHub count, average progress, and an activity view derived from current local project data.
- Browser persistence using `localStorage`.
- JSON export and merge-style JSON import.
- Starter project reset.
- Keyboard shortcut: Ctrl/Cmd+K focuses search; Escape closes active overlays/drawers.
- Five presentation modes implemented through CSS: Grid, Storefront, Vending, Comic, and 3D.
- Public GitHub repository import/refresh with language, stars, forks, open issues, default branch, last push, topics, repository URL, homepage, archive state, and GitHub Open Graph cover image.
- Vercel deployment fetch through a server-side API function and name-based matching back to local projects.
- Supabase email/password authentication plus manual project backup/restore.
- React error boundary that renders a recovery screen instead of leaving a blank page.
- GitHub Actions build and lint verification on pushes and pull requests targeting `main`.

## Data storage

### Local project data

The main application stores project records at:

```text
projectx.projects.v1
```

The selected view and GitHub owner are stored separately:

```text
projectx.view.v1
projectx.github.owner.v1
```

`index.html` also uses `projectx.schema.v2` as a one-time local schema marker. On a browser profile where that marker does not yet exist, the bootstrap script clears the old project/view keys before mounting the React app and sets the marker.

### Supabase session

The custom Supabase client stores its auth session in:

```text
projectx.supabase.session.v1
```

The implementation uses Supabase Auth and PostgREST endpoints directly with `fetch`; the repository does not depend on `@supabase/supabase-js`.

## Project structure

```text
.
├── api/
│   └── vercel-projects.ts       # Server-side Vercel deployment proxy
├── public/
│   ├── favicon.svg              # App favicon
│   └── icons.svg                # SVG icon asset sheet
├── src/
│   ├── App.tsx                  # Main project manager state, CRUD, filters, GitHub/Vercel sync, import/export, UI
│   ├── CloudSyncDock.tsx        # Supabase auth and manual backup/restore controls
│   ├── ErrorBoundary.tsx        # Runtime failure UI and local-data recovery actions
│   ├── main.tsx                 # React entry point; mounts App + CloudSyncDock inside ErrorBoundary
│   ├── services/
│   │   ├── github.ts            # Public GitHub REST requests and relative-date helpers
│   │   ├── supabase.ts          # Direct Supabase Auth/PostgREST client and session persistence
│   │   └── vercel.ts            # Browser adapter for /api/vercel-projects
│   ├── App.css                  # Main shell/component styling
│   ├── viewModes.css            # Storefront/Vending/Comic/3D presentation overrides
│   ├── phase3.css               # Integration/live-data UI styling
│   ├── cloudSync.css            # Cloud dock styling
│   ├── errorBoundary.css        # Runtime recovery screen styling
│   └── index.css                # Global baseline styles
├── supabase/
│   └── migrations/
│       └── 20260818_projectx_phase4.sql  # Cloud schema, indexes, RLS policies, updated_at trigger
├── .github/workflows/ci.yml     # Node 22 npm ci/build/lint workflow
├── .env.example                 # Integration environment variable template
├── .oxlintrc.json               # Oxlint React/TypeScript configuration
├── index.html                   # Vite HTML entry and local schema bootstrap
├── package.json                 # Scripts and direct dependency declarations
├── package-lock.json            # Locked npm dependency graph
├── tsconfig*.json               # TypeScript project/reference configuration
├── vercel.json                  # Vercel install/build/output configuration
└── vite.config.ts               # Vite + React plugin configuration
```

The repository tree also currently contains a `projectx` gitlink entry without a `.gitmodules` file. It is not referenced by the application source. Some Vercel builds have consequently logged a submodule-fetch warning; this is a repository-structure issue rather than an application feature.

## Dependencies

### Runtime

- `react` `^19.2.8` — component model, state, effects, memoization, and rendering logic.
- `react-dom` `^19.2.8` — mounts the React application into the browser DOM.

### Development/build

- `vite` `^8.2.0` — local development server and production bundler.
- `@vitejs/plugin-react` `^6.0.4` — React integration for Vite.
- `typescript` `~6.0.2` — static type checking and project builds.
- `oxlint` `^1.75.0` — linting.
- `@types/node` `^24.13.3` — Node type declarations used by build/server-side TypeScript contexts.
- `@types/react` `^19.2.17` — React TypeScript declarations.
- `@types/react-dom` `^19.2.3` — React DOM TypeScript declarations.

No GitHub, Vercel, or Supabase JavaScript SDK is installed. Those integrations use `fetch` against HTTP APIs.

## Configuration files

- `vite.config.ts` enables the React Vite plugin.
- `vercel.json` sets Vite as the framework, `npm ci` as install command, `npm run build` as build command, and `dist` as output directory.
- `tsconfig.json` references the browser and Node TypeScript configs.
- `tsconfig.app.json` covers `src`; `noUnusedLocals` is currently disabled there.
- `tsconfig.node.json` covers `vite.config.ts` with Node types.
- `.oxlintrc.json` enables React, TypeScript, and Oxc plugins and enforces React hook rules.
- `.github/workflows/ci.yml` runs `npm ci`, `npm run build`, and `npm run lint` using Node 22 for pushes and PRs targeting `main`.

## Known limitations / work in progress

- GitHub sync only uses the public unauthenticated API: no private repositories, pagination beyond the first 100 repositories, organization-level authenticated discovery, or fork import.
- Vercel sync requires the deployed `/api/vercel-projects` function and a valid server-side token; it does not work under plain local Vite.
- Vercel-to-project matching is heuristic: it normalizes deployment names and compares them with the repository name/project name, so unusual naming can fail to match or potentially match incorrectly.
- Supabase cloud synchronization is manual backup/restore, not continuous two-way synchronization.
- Cloud restore replaces the local project array rather than merging it.
- `refreshSession`, cloud activity helpers, and cloud delete helpers exist in `src/services/supabase.ts`, but the current UI does not invoke them. Automatic token refresh and cloud activity presentation are therefore not implemented.
- The Supabase session is stored directly in browser `localStorage` by the custom client.
- The Activity view is generated from local project/GitHub fields; it is not currently backed by the `projectx_activity` table.
- The main Settings panel still contains copy saying cloud account sync is the "next layer" even though the separate CloudSyncDock now provides manual cloud backup/restore; that text is stale UI copy.
- There is no automated unit, integration, or end-to-end test suite in the repository. CI currently verifies build and lint only.
- `tsconfig.app.json` currently disables `noUnusedLocals`; the code includes at least one calculated value (`buildingCount`) that is not rendered.
- The `projectx` gitlink/submodule-style repository entry is not used by the application and can produce submodule-fetch warnings.

## Deployment

Vercel installs with `npm ci`, runs `npm run build`, and serves `dist` according to `vercel.json`. The serverless function under `api/` is deployed alongside the Vite output and keeps `VERCEL_API_TOKEN` out of the client bundle.

## Repository

`xfactor21/projectx`
