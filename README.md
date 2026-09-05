# project.X

project.X is a standalone Windows project manager built with Tauri, React, TypeScript, and Vite. It manages user-selected local projects, public GitHub imports, development servers, previews, optional cloud synchronization, and deployment tooling without shipping a preconfigured user account or starter workspace.

This README describes only functionality that exists in the current codebase.

## Requirements

- Node.js. GitHub Actions verifies the project with Node 22.
- npm, using the checked-in `package-lock.json`.
- Windows 10 or later for the full desktop host.
- A modern browser for the optional hosted/companion interface.
- Optional Supabase and Vercel configuration for cloud/deployment features.

## Install and run locally

```bash
git clone <project-x-repository-url>
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

### Android Companion build

The Android shell is generated from the same Companion interface. `resources/logo.png` is the checked-in source for the native launcher icon and Android launch surface; the in-app launch then displays the branded project.X splash used by Windows.

```bash
npm install --no-save @capacitor/core @capacitor/cli @capacitor/android @capacitor/assets
npm run build
npx cap add android
npx capacitor-assets generate --android --assetPath resources --iconBackgroundColor '#05060a' --splashBackgroundColor '#05060a'
npx cap sync android
cd android
./gradlew assembleDebug
```

The GitHub Android workflow runs these steps with Node 22 and publishes a versioned debug APK artifact. Production APKs include the managed project.X Cloud URL and browser-safe publishable key at build time; users only create an account or sign in.

## Environment configuration

Copy `.env.example` to `.env.local` for local Vite values. Never expose a Supabase service-role key or a Vercel API token to browser code.

Production installers do not ship with an account, workspace, private token, or local path. They do include the project.X Cloud URL and browser-safe publishable key, which are public client configuration rather than user credentials. Each user's access is controlled by Supabase Auth and row-level security. Secret and service-role keys are never included.

### Supabase

```text
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=...
```

The client also accepts `VITE_SUPABASE_ANON_KEY` as a legacy fallback. Release workflows refuse to publish consumer artifacts when the managed URL or publishable key is missing.

Required migrations:

```text
supabase/migrations/20260818_projectx_phase4.sql
supabase/migrations/20260821_projectx_companion.sql
supabase/migrations/20260824_projectx_companion_packages.sql
supabase/migrations/20260830_projectx_provider_connections.sql
```

Apply all migrations in order. They create the cloud project/activity model, per-user device/action tables, private package storage, and encrypted per-user provider connection records. Normal users never enter Supabase configuration. Administrators running their own deployment can opt into **Settings > Cloud > Advanced self-hosting** and provide a browser-safe publishable key; privileged keys are rejected.

### GitHub and Vercel provider connections

Server-side only:

```text
SUPABASE_SERVICE_ROLE_KEY=...
PROJECTX_API_ORIGIN=https://your-projectx-host.example
PROJECTX_OAUTH_STATE_SECRET=...random-secret...
PROJECTX_PROVIDER_ENCRYPTION_KEY=...base64-encoded-32-byte-key...
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
VERCEL_CLIENT_ID=...
VERCEL_CLIENT_SECRET=...
VERCEL_INTEGRATION_SLUG=...
```

Register a GitHub App and Vercel Integration whose callback is `PROJECTX_API_ORIGIN/api/provider-callback`. GitHub should receive repository Contents read/write, Metadata read, Deployments read/write, and Actions read permissions only for repositories the user selects. Add Workflows read/write only if a future release actually edits workflow files. Vercel should receive Project and Deployment read/write permissions. Do not request account administration, billing, team deletion, or provider-wide destructive permissions.

Provider tokens are encrypted with AES-256-GCM before service-role storage and are never returned to the browser. `VERCEL_API_TOKEN`, `VERCEL_TEAM_ID`, and `PROJECTX_ALLOWED_USER_IDS` remain supported only as a legacy, explicitly allowlisted owner fallback during migration. New users connect their own accounts from project.X and never enter provider secrets.

## Implemented product features

### Project workspace

- Create, edit, delete, archive, restore, and favorite project records.
- Search and status filtering.
- Notes, stack, progress, repository URL, live URL, cover URL, and project status.
- Detail drawer and workspace statistics.
- Grid, Storefront, Vending, Comic, and 3D presentation modes with a compact single-row selector.
- A categorized Control Center replaces the crowded bottom rail with Projects, Cloud, and System groups; Settings provides General, Cloud, Runtime, Data, and About sections.
- Vending mode uses project slot codes and only releases runnable local projects; Comic mode presents artwork as filtered portrait comic covers.
- The artwork manager saves uploads immediately and previews the selected cover using the active presentation mode.
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
5. Clones only the repositories explicitly selected by the user.
6. Marks a repository Ready only after the local clone succeeds; failed clones remain retryable and are not treated as completed imports.

The first project status circle means Run ready: package metadata, a supported script, and installed dependencies were verified locally. The second circle is independent and reflects the specifically linked Vercel deployment. A local development server never marks a deployment live.

Current GitHub metadata includes language, stars, forks, open issues, default branch, last push, topics, homepage, archive state, repository URL, and GitHub Open Graph artwork.

Without a provider connection, discovery falls back to the public GitHub API. A connected GitHub account can discover accessible private repositories. Local commit and push use the user's installed Git credentials; project.X never places provider tokens in clone URLs or command output.

### Local project onboarding

The Windows LOCAL dock supports explicit project-folder selection and authorizes only folders selected by the user.

For an authorized directory it can inspect:

- `package.json`
- common framework/dependency hints
- package scripts
- `.git` presence
- Git branch from `.git/HEAD` when readable

Hosted browser sessions do not receive unrestricted Windows paths.

When a local project is run, project.X manages the development-server process and exposes it in RUN / TASKS. Verified previews open inside the project.X WebView frame with reload, external-browser, stop, and close controls. Stop Server terminates the managed process tree. Starting the same project again replaces the prior project.X-owned process, and exiting the desktop app stops all development servers owned by that session.

`src/services/desktop.ts` defines the bridge implemented by the Tauri Windows host for:

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
- Register the corresponding GitHub Deployment and queued deployment status when the user connected GitHub and granted repository Deployments write access.
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

### Local backup, restore, and device reset

The DATA utility creates a versioned JSON backup containing project records, authorized local-source links, artwork, the selected workspace view, sound preference, and optional GitHub owner. Authentication sessions, passwords, access tokens, and cloud credentials are excluded.

Restore validates the complete backup before replacing local data. Clear personal data removes all `projectx.*` browser storage from the device without deleting project folders or repositories from disk. A new installation starts with an empty workspace and no GitHub owner.

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
projectx.supabase.config.v1
projectx.supabase.self-hosting.v1
projectx.settings.v1
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
│   ├── WorkspaceAppV3.tsx       # main project manager
│   ├── UtilityHub.tsx            # categorized project/cloud/system controls
│   ├── SettingsPanel.tsx         # general/cloud/runtime/data/about settings
│   ├── SupabaseSetup.tsx         # advanced self-hosted cloud configuration
│   ├── AppSplash.tsx             # branded launch surface
│   ├── DataBackupDock.tsx       # local backup, restore, and device reset
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

Release packaging produces separate archives: `projectX-08.30-v2.9-theme-connections-source.zip` contains the committed project tree under one top-level folder, while `projectX-08.30-v2.9-theme-connections-windows.zip` contains only the Windows installer. The Android workflow publishes `projectX-08.30-v2.9-theme-connections-android-debug.zip` with the companion APK.

GitHub, Vercel, and Supabase integrations use HTTP APIs directly; no vendor JavaScript SDK is required by the current app.

## Known limitations / remaining work

- A hosted browser cannot provide the full Windows experience. Git operations, terminal launch, process execution, and unrestricted path operations require the installed Windows host.
- Private GitHub repository discovery is available after the user connects a GitHub App installation with access to selected repositories. Public discovery remains available without a provider connection.
- Production Windows and Android packaging requires the managed project.X Supabase URL and publishable key in repository secrets.
- Vercel status, analytics and deploy actions use each signed-in user's encrypted Vercel connection. `VERCEL_API_TOKEN` is only a migration fallback for explicitly allowlisted legacy owner accounts.
- Deployment status is attached to an explicitly linked Vercel project/deployment. Name matching is used only to refresh a saved link when Vercel rotates a deployment identifier.
- Companion device/action tables and private package storage require all three Supabase migrations before those features become durable.
- Companion remote-action execution requires a running, signed-in Windows host to poll and claim authorized actions. ZIP handoff reports download/import/install stages and keeps packages private to the signed-in user.
- Companion Launch can open an embedded preview on the PC or a LAN preview on the phone. Mobile LAN preview requires the phone and PC to share a private network; off-network live development requires an independently configured authenticated HTTPS tunnel. A project's Published link remains available for deployed builds.
- Cloud sync is manual and conflict resolution is merge/replace based rather than a true timestamp/tombstone two-way engine.
- The Activity view is still local/GitHub derived rather than backed by the cloud activity table.
- Native timeout/deadlock and external-link safety tests are committed. Browser viewport/theme checks cover the five project environments; broader installed-app interaction automation remains future work.
- Traffic/performance/runtime-error/cost analytics providers are not yet connected.
- xConnect is not required. Its future adapter can implement the same capability boundaries without replacing project.X's independent GitHub/Vercel/local/companion contracts.

## CI

`.github/workflows/ci.yml` runs on pushes and pull requests targeting `main` and executes:

```text
npm ci
npm run build
npm run lint
```
