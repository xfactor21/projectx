# project.X

A standalone visual app manager for the planet.X project universe.

project.X is intentionally being built **outside xOS first**. Once the manager is mature and stable, it can be integrated into xOS as a dedicated module rather than being coupled too early.

## Current build

project.X is now a functional local-first project manager with a real live-data integration layer.

### Working now

- Create, edit, delete, archive, restore, and favorite projects
- Search and filter projects
- Track status, stack, notes, and progress
- Project detail drawer
- Persistent browser storage
- JSON backup export **and import**
- Grid, Storefront, Vending, Comic, and 3D presentation modes
- Real public GitHub repository discovery/import
- GitHub metadata refresh: language, stars, forks, open issues, branch, last push
- Automatic GitHub Open Graph media covers
- Repository and live deployment actions
- Secure server-side Vercel deployment adapter
- Automatic Vercel-to-project deployment matching when connected
- Visible runtime recovery screen instead of silent blank-page failures
- Responsive desktop/mobile layout
- GitHub Actions build + lint verification

## Run locally

```bash
npm install
npm run dev -- --port 5175 --host 127.0.0.1
```

Build verification:

```bash
npm run build
npm run lint
```

## Phase 3 integrations

### GitHub

Public GitHub sync works without secrets. Set the GitHub owner in the app and choose **Sync GitHub**. Repositories are imported or matched to existing project records and refreshed with live metadata.

### Vercel

Vercel sync is intentionally proxied through `/api/vercel-projects` so a Vercel token is never shipped to the browser.

Configure these server-side environment values in the Vercel project:

```text
VERCEL_API_TOKEN=...
VERCEL_TEAM_ID=...
```

`VERCEL_TEAM_ID` is optional when the token only needs one scope. See `.env.example`.

## Deployment

The repository includes `vercel.json` with the Vite build/output settings and SPA fallback routing required for project.X.

## Architecture status

The app remains local-first while account/cloud synchronization is prepared as the next layer. GitHub is already live. Vercel becomes live as soon as its server-side environment token is configured.

## Repository

`xfactor21/projectx`
