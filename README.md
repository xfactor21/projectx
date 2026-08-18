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
- JSON backup export
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

## Architecture status

The current version is deliberately **local-first**. Project data is stored in the browser so the UX and data model can stabilize without blocking on backend infrastructure.

The next production layer is real account/cloud synchronization plus authenticated integrations for GitHub and deployment providers. Those integrations should be implemented as real services; project.X should not display fake sync states or simulated repository/deployment data.

## Planned production integrations

1. Supabase authentication + project sync
2. GitHub repository discovery and metadata sync
3. Vercel deployment/status integration
4. Project screenshots and media
5. Rich activity history
6. Optional xOS module adapter after the standalone product is stable

## Repository

`xfactor21/projectx`

<!-- CI debug branch: verifies build without changing application code. -->
