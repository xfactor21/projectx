import { useEffect, useMemo, useState } from 'react'
import { GITHUB_DISCOVERY_EVENT, relativeDate } from './services/github'
import type { GitHubRepo } from './services/github'

const STORAGE_KEY = 'projectx.projects.v1'

type StoredProject = {
  id: string
  name: string
  kicker: string
  description: string
  status: 'Live' | 'Building' | 'Concept' | 'Paused'
  stack: string[]
  accent: 'pink' | 'cyan' | 'violet'
  updated: string
  progress: number
  favorite: boolean
  archived: boolean
  repoUrl: string
  liveUrl: string
  notes: string
  coverUrl?: string
  github?: {
    fullName: string
    language: string
    stars: number
    forks: number
    openIssues: number
    defaultBranch: string
    lastPush: string
    syncedAt: string
  }
}

function readProjects(): StoredProject[] {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}

function accentFor(index: number): StoredProject['accent'] {
  return (['pink', 'cyan', 'violet'] as const)[index % 3]
}

function toProject(repo: GitHubRepo, index: number): StoredProject {
  const stack = [repo.language, ...(repo.topics || []).slice(0, 4)].filter(Boolean).slice(0, 6) as string[]
  return {
    id: `gh-${repo.id}`,
    name: repo.name,
    kicker: 'GitHub repository',
    description: repo.description || 'Imported from GitHub.',
    status: repo.archived ? 'Paused' : 'Building',
    stack,
    accent: accentFor(index),
    updated: relativeDate(repo.pushed_at || repo.updated_at),
    progress: repo.archived ? 100 : 35,
    favorite: false,
    archived: repo.archived,
    repoUrl: repo.html_url,
    liveUrl: repo.homepage || '',
    notes: '',
    coverUrl: `https://opengraph.githubassets.com/1/${repo.full_name}`,
    github: {
      fullName: repo.full_name,
      language: repo.language || 'Unknown',
      stars: repo.stargazers_count,
      forks: repo.forks_count,
      openIssues: repo.open_issues_count,
      defaultBranch: repo.default_branch,
      lastPush: repo.pushed_at,
      syncedAt: new Date().toISOString(),
    },
  }
}

export default function GitHubDiscoveryModal() {
  const [repos, setRepos] = useState<GitHubRepo[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onDiscovery = (event: Event) => {
      const detail = (event as CustomEvent<GitHubRepo[]>).detail || []
      setRepos(detail)
      setSelected(new Set())
      setOpen(detail.length > 0)
    }
    window.addEventListener(GITHUB_DISCOVERY_EVENT, onDiscovery)
    return () => window.removeEventListener(GITHUB_DISCOVERY_EVENT, onDiscovery)
  }, [])

  const selectedCount = selected.size
  const allSelected = repos.length > 0 && selectedCount === repos.length
  const sortedRepos = useMemo(() => [...repos].sort((a, b) => (b.pushed_at || b.updated_at).localeCompare(a.pushed_at || a.updated_at)), [repos])

  function toggleRepo(id: number) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(repos.map((repo) => repo.id)))
  }

  function importSelected() {
    if (!selectedCount) return
    const current = readProjects()
    const imports = sortedRepos.filter((repo) => selected.has(repo.id)).map(toProject)
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...current, ...imports]))
    setOpen(false)
    window.location.reload()
  }

  if (!open) return null

  return (
    <div className="github-discovery-backdrop" role="presentation" onClick={() => setOpen(false)}>
      <section className="github-discovery-modal" role="dialog" aria-modal="true" aria-labelledby="github-discovery-title" onClick={(event) => event.stopPropagation()}>
        <header className="github-discovery-head">
          <div>
            <p>GITHUB / NEW REPOSITORIES</p>
            <h2 id="github-discovery-title">Choose what belongs in project.X</h2>
            <span>{repos.length} untracked {repos.length === 1 ? 'repository' : 'repositories'} found. Nothing will be added until you choose it.</span>
          </div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close discovery">×</button>
        </header>

        <div className="github-discovery-toolbar">
          <button type="button" onClick={toggleAll}>{allSelected ? 'Clear all' : 'Select all'}</button>
          <span>{selectedCount} selected</span>
        </div>

        <div className="github-discovery-list">
          {sortedRepos.map((repo) => {
            const checked = selected.has(repo.id)
            return (
              <button key={repo.id} type="button" className={checked ? 'github-discovery-row selected' : 'github-discovery-row'} onClick={() => toggleRepo(repo.id)}>
                <span className="github-check" aria-hidden="true">{checked ? '✓' : ''}</span>
                <span className="github-repo-copy">
                  <strong>{repo.name}</strong>
                  <small>{repo.description || 'No repository description.'}</small>
                  <span className="github-repo-meta">
                    <b>{repo.language || 'Unknown'}</b>
                    <i>Last push {relativeDate(repo.pushed_at || repo.updated_at)}</i>
                    {repo.archived && <em>Archived</em>}
                  </span>
                </span>
              </button>
            )
          })}
        </div>

        <footer className="github-discovery-actions">
          <button type="button" onClick={() => setOpen(false)}>Not now</button>
          <button className="github-import-primary" type="button" disabled={!selectedCount} onClick={importSelected}>
            Add {selectedCount || ''} selected {selectedCount === 1 ? 'project' : 'projects'}
          </button>
        </footer>
      </section>
    </div>
  )
}
