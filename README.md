# project.X

A standalone visual app manager for the planet.X project universe.

project.X is intentionally being built **outside xOS first**. Once the manager is mature and stable, it can be integrated into xOS as a dedicated module rather than being coupled too early.

## Current build

The current app is a functional local-first project manager, not a static mockup.

### Working now

- Create projects
- Edit projects
- Delete projects
- Archive and restore projects
- Favorite projects
- Search by project name, description, subtitle, or tech stack
- Filter by status
- Track build progress
- Store repository and live deployment URLs
- Launch repository/deployment links
- Store project notes
- Project detail drawer
- Favorites view
- Archive view
- Activity snapshot
- Persistent browser storage via `localStorage`
- JSON backup export/import
- Real public GitHub repository discovery and metadata sync
- Secure Vercel deployment adapter via server-side API route
- Repository media covers and live metadata
- Multiple visual modes:
  - Grid
  - Storefront
  - Vending
  - Comic
  - 3D
- Responsive desktop/mobile layout
- Automated GitHub Actions build + lint verification

## Visual direction

- Dark/graphite foundation
- Hot pink + cyan primary accents
- Violet secondary accent
- Subtle X motifs
- Futuristic developer-tool aesthetic without turning into a novelty UI

## Run locally

```bash
npm install
npm run dev
```

Build verification:

```bash
npm run build
npm run lint
```

## Integration environment

The GitHub public-repository integration requires no secret. Vercel deployment status is proxied server-side so tokens never enter the browser bundle.

For Vercel live deployment sync, configure:

```text
VERCEL_API_TOKEN=...
VERCEL_TEAM_ID=...   # optional when the token only needs one scope
```

## Architecture status

project.X remains local-first while live integrations are being layered in. Project records persist in the browser, GitHub metadata can be discovered and refreshed from the public API, and the Vercel adapter becomes active when its server-side environment token is configured.

## Repository

`xfactor21/projectx`

<!-- phase3-ci-verify -->
