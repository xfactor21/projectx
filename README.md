# project.X

project.X is a standalone visual project manager built with React, TypeScript, and Vite. The current application is a browser-based, local-first manager for project records with curated public GitHub discovery, server-side Vercel status/deployment actions, optional deployment analytics, manual Supabase cloud backup/merge/restore, browser-authorized local-folder onboarding, project attention scanning, a mobile companion mode, tester diagnostics, JSON import/export, multiple visual presentation modes, and a runtime recovery screen.

This README describes only functionality that exists in the current codebase.

## Requirements

- Node.js. GitHub Actions verifies the project with Node 22.
- npm, using the checked-in `package-lock.json`.
- A modern browser with `localStorage`.
- Chrome/Edge or another File System Access API browser for browser-based local-folder selection.
- Optional Supabase and Vercel configuration for cloud/deployment features.

## Install and run locally

```bash
git clone https://github.com/xfactor21/projectx.git
cd projectx
npm ci
npm run dev -- --host 127.0.0.1 --port 5175
```

Build/lint verification:

```bash
npm run build
npm run lint
```

Production preview:

```bash
npm run preview
```

## Environment configuration

Copy `.env.example` to `.env.local` for local Vite values. Never expose a Supabase service-role key or a Vercel API token to browser code.

### Supabase

```text
VITE_SUPABASE_URL=https://lufvkrnwqbqdaqcgljxt.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=...
```

The client also accepts `VITE_SUPABASE_ANON_KEY` as a legacy fallback.

Required migrations:

```text
supabase/migrations/20260818_projectx_phase4.sql
supabase/migrations/20260821_projectx_companion.sql
```

The first migration creates the cloud project/activity model with RLS. The companion migration adds per-user device registration and the remote-action queue used by the mobile/Windows-host contract.

### Vercel

Server-side only:

```text
VERCEL_API_TOKEN=...
VERCEL_TEAM_ID=...
```

The browser never receives `VERCEL_API_TOKEN`. `/api/vercel-projects` fetches deployment status/history and `/api/vercel-deploy` creates explicit GitHub-backed Vercel deployments. Plain `vite` does not run these `/api` functions.

## Implemented product features

### Project workspace

- Create, edit, delete, archive, restore, and favorite project records.
- Search and status filtering.
- Notes, stack, progress, repository URL, live URL, cover URL, and project status.
- Detail drawer and workspace statistics.
- Grid, Storefront, Vending, Comic, and 3D presentation modes.
- Activity view derived from local/GitHub metadata.
- Ctrl/Cmd+K search shortcut and Escape overlay dismissal.
- Local-first browser persistence.
- JSON export/import and starter-data reset.
- Error boundary with visible recovery controls.

### Curated GitHub discovery

GitHub sync no longer automatically enrolls every public repository. It now:

1. Fetches public owner repositories.
2. Refreshes metadata for repositories already tracked by project.X.
3. Separates repositories that are not yet tracked.
4. Opens a discovery/review modal for the new repositories.
5. Adds only the repositories explicitly selected by the user.

Current GitHub metadata includes language, stars, forks, open issues, default branch, last push, topics, homepage, archive state, repository URL, and GitHub Open Graph artwork.

Current limitation: public unauthenticated API only, first 100 owner repositories, no private-repository flow yet.

### Local project onboarding

The LOCAL dock supports explicit project-folder selection.

In a compatible browser it can inspect an authorized directory for:

- `package.json`
- common framework/dependency hints
- package scripts
- `.git` presence
- Git branch from `.git/HEAD` when readable

The browser intentionally does not receive an unrestricted Windows path.

`src/services/desktop.ts` defines the host bridge that the Windows build will implement for:

- folder selection/inspection
- Explorer/terminal launch
- Git status
- Git commit
- Git push
- project script/build execution

`desktop/capabilities.json` defines the least-privilege permission model for that host. Folder access is scoped to directories explicitly authorized by the user and write/process/network actions are capability-gated.

### Vercel deployment lifecycle

- Read recent Vercel deployments through a server-side adapter.
- Match deployment names back to tracked project/repository names.
- Explicitly create preview or production deployments from tracked GitHub repositories through `/api/vercel-deploy`.
- Production is never selected automatically just because GitHub metadata changes.

The Vercel Git connection/token must have access to the target GitHub repository.

### Deployment analytics

The optional ANALYTICS dock derives a first deployment-health layer from Vercel history:

- recent deployment count
- number of Vercel projects represented
- latest deployment state
- latest deployment timestamp
- READY percentage
- link to the latest deployment

Traffic, runtime-error, performance, and cost adapters are deliberately separate future data providers; deployment health does not depend on them.

### Cloud sync hardening

Supabase cloud functionality supports:

- email/password sign-up and sign-in
- token refresh when an existing session is near expiry
- manual cloud backup/upsert
- safe merge from cloud
- explicit replace-from-cloud with confirmation
- automatic local pre-restore recovery snapshot
- sign-out

Cloud sync is still intentionally manual; it is not a background two-way synchronization engine yet.

### Project intelligence

The ATTENTION scanner is deterministic and local. Current checks include:

- project marked Live with no launch URL
- project with no repository connected
- Building GitHub project with no push for 30+ days
- high open-issue count
- near-complete project still marked Building

Provider-backed deployment drift/runtime error signals can be added later without changing this local scanner.

### Companion mode

A real mobile-first companion client exists in the same build. Open the hosted app with:

```text
?mode=companion
```

The companion supports:

- Supabase sign-in
- cloud-project browsing
- project search
- project/live counts
- repo and live-app launch actions
- device registration when the companion migration exists
- active remote-action count

The shared cloud contract includes `projectx_devices` and `projectx_remote_actions`. The remote-action lifecycle is:

```text
pending -> approved -> running -> succeeded | failed | canceled
```

The current companion is intentionally a mobile command/read surface rather than a clone of desktop filesystem management.

### Beta diagnostics

The BETA diagnostics dock checks the tester environment and can export a support JSON bundle containing non-secret operational information such as:

- app mode/origin
- browser/user-agent and online state
- local project/source counts
- Supabase configured/signed-in state
- Vercel connected state and deployment count
- browser-folder-picker support
- Windows-host presence

It deliberately excludes credentials, auth tokens, project notes, local paths, source code, and cloud row contents.

## Storage keys

```text
projectx.projects.v1
projectx.view.v1
projectx.github.owner.v1
projectx.local.sources.v1
projectx.supabase.session.v1
projectx.projects.pre-restore.v1
projectx.companion.device.v1
projectx.schema.v2
```

## Major project structure

```text
.
├── api/
│   ├── vercel-projects.ts       # server-side deployment status/history adapter
│   └── vercel-deploy.ts         # explicit GitHub-backed deployment action
├── desktop/
│   └── capabilities.json        # Windows host permission/capability manifest
├── public/                      # static SVG assets
├── src/
│   ├── App.tsx                  # main project manager
│   ├── GitHubDiscoveryModal.tsx # curated repository import review
│   ├── LocalProjectDock.tsx     # local folder onboarding
│   ├── ProjectIntelDock.tsx     # deterministic attention scanner
│   ├── DeploymentAnalyticsDock.tsx # deployment health analytics
│   ├── DeployDock.tsx           # explicit Vercel deployment controls
│   ├── CloudSyncDock.tsx        # auth/backup/merge/restore
│   ├── BetaDiagnosticsDock.tsx  # tester support bundle
│   ├── CompanionApp.tsx         # mobile-first companion mode
│   ├── ErrorBoundary.tsx        # runtime recovery
│   ├── main.tsx                 # main/companion entry selection
│   └── services/
│       ├── github.ts
│       ├── vercel.ts
│       ├── vercelDeploy.ts
│       ├── supabase.ts
│       ├── localProject.ts
│       ├── desktop.ts
│       └── companion.ts
├── supabase/migrations/
├── .github/workflows/ci.yml
├── .env.example
├── package.json
├── vercel.json
└── vite.config.ts
```

## Dependencies

Runtime:

- `react` — component/state model.
- `react-dom` — browser rendering.

Development/build:

- `vite` — development server and production bundler.
- `@vitejs/plugin-react` — React integration for Vite.
- `typescript` — type checking/build.
- `oxlint` — linting.
- `@types/node`, `@types/react`, `@types/react-dom` — TypeScript declarations.

GitHub, Vercel, and Supabase integrations use HTTP APIs directly; no vendor JavaScript SDK is required by the current app.

## Known limitations / remaining work

- A browser cannot provide the full Windows experience. Actual Git commit/push, terminal launch, process execution, durable filesystem handles, and unrestricted path operations require the Windows host implementation of the existing bridge/permission contracts.
- Private GitHub repository authentication is not implemented.
- `VERCEL_API_TOKEN` must be configured for Vercel status, analytics, and deploy actions to work.
- Vercel project matching remains name-based for the existing sync surface.
- Companion device/action tables require the companion migration to be applied before those features become durable.
- Companion remote-action execution requires the future Windows host to poll/claim authorized actions.
- Cloud sync is manual and conflict resolution is merge/replace based rather than a true timestamp/tombstone two-way engine.
- The Activity view is still local/GitHub derived rather than backed by the cloud activity table.
- There is no automated unit/E2E suite yet; CI currently verifies install/build/lint.
- Traffic/performance/runtime-error/cost analytics providers are not yet connected.
- xConnect is not required. Its future adapter can implement the same capability boundaries without replacing project.X's independent GitHub/Vercel/local/companion contracts.

## CI

`.github/workflows/ci.yml` runs on pushes and pull requests targeting `main` and executes:

```text
npm ci
npm run build
npm run lint
```

## Repository

`xfactor21/projectx`
