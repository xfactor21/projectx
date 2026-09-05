import { useEffect, useMemo, useState } from 'react'
import { GITHUB_DISCOVERY_EVENT, relativeDate } from './services/github'
import type { GitHubRepo } from './services/github'
import { getDesktopHost } from './services/desktop'

const STORAGE_KEY = 'projectx.projects.v1'
const LOCAL_KEY = 'projectx.local.sources.v1'

type StoredProject = {
  id: string
  name: string
  kicker: string
  description: string
  status: 'Live' | 'Ready' | 'Building' | 'Concept' | 'Paused'
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
  github?: { fullName: string; language: string; stars: number; forks: number; openIssues: number; defaultBranch: string; lastPush: string; syncedAt: string }
}

type LocalSource = { projectId: string; kind?: string; label?: string; path?: string; scripts?: string[] }

function readArray<T>(key: string): T[] {
  try { const value = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(value) ? value : [] }
  catch { return [] }
}

function accentFor(index: number): StoredProject['accent'] { return (['pink', 'cyan', 'violet'] as const)[index % 3] }

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
    github: { fullName: repo.full_name, language: repo.language || 'Unknown', stars: repo.stargazers_count, forks: repo.forks_count, openIssues: repo.open_issues_count, defaultBranch: repo.default_branch, lastPush: repo.pushed_at, syncedAt: new Date().toISOString() },
  }
}

export default function GitHubDiscoveryModal() {
  const desktop = getDesktopHost()
  const [repos, setRepos] = useState<GitHubRepo[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [completed, setCompleted] = useState(false)

  useEffect(() => {
    const onDiscovery = (event: Event) => {
      const detail = (event as CustomEvent<GitHubRepo[]>).detail || []
      setRepos(detail); setSelected(new Set()); setMessage(''); setBusy(false); setCompleted(false); setOpen(detail.length > 0)
    }
    window.addEventListener(GITHUB_DISCOVERY_EVENT, onDiscovery)
    return () => window.removeEventListener(GITHUB_DISCOVERY_EVENT, onDiscovery)
  }, [])

  const selectedCount = selected.size
  const allSelected = repos.length > 0 && selectedCount === repos.length
  const sortedRepos = useMemo(() => [...repos].sort((a, b) => (b.pushed_at || b.updated_at).localeCompare(a.pushed_at || a.updated_at)), [repos])

  function toggleRepo(id: number) {
    if (busy) return
    setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next })
  }
  function toggleAll() { if (!busy) setSelected(allSelected ? new Set() : new Set(repos.map((repo) => repo.id))) }

  async function importSelected() {
    if (!selectedCount || busy) return
    setBusy(true)
    const chosen = sortedRepos.filter((repo) => selected.has(repo.id))
    const current = readArray<StoredProject>(STORAGE_KEY)
    const sources = readArray<LocalSource>(LOCAL_KEY)
    const imported: StoredProject[] = []
    const nextSources = [...sources]
    const failures: string[] = []

    for (let index = 0; index < chosen.length; index += 1) {
      const repo = chosen[index]
      let project = toProject(repo, index)
      if (desktop && !repo.archived) {
        setMessage(`Importing ${index + 1}/${chosen.length}: ${repo.name} - cloning from GitHub…`)
        try {
          const initialized = await desktop.cloneGitHubProject(repo.html_url, repo.name)
          setMessage(`Importing ${index + 1}/${chosen.length}: ${repo.name} - inspecting scripts and local runtime…`)
          project = {
            ...project,
            kicker: 'GitHub + local Windows project',
            status: 'Ready',
            stack: initialized.summary.frameworkHints?.length ? initialized.summary.frameworkHints : project.stack,
            notes: `GitHub repository cloned to ${initialized.summary.path}. Missing dependencies will install automatically on first Run.`,
            progress: 55,
            updated: 'Just now',
          }
          const local: LocalSource = { projectId: project.id, kind: 'managed', label: initialized.summary.path, path: initialized.summary.path, scripts: initialized.summary.scripts || [] }
          const existingIndex = nextSources.findIndex((item) => item.projectId === project.id)
          if (existingIndex >= 0) nextSources[existingIndex] = local
          else nextSources.push(local)
        } catch (error) {
          const reason = error instanceof Error ? error.message : 'Unknown install failure.'
          failures.push(`${repo.name}: ${reason}`)
          continue
        }
      } else if (!desktop) {
        project = { ...project, kicker: 'GitHub remote — open Windows app to install locally' }
      }
      imported.push(project)
    }

    const importedIds = new Set(imported.map((project) => project.id))
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...current.filter((project) => !importedIds.has(project.id)), ...imported]))
    localStorage.setItem(LOCAL_KEY, JSON.stringify(nextSources))
    window.dispatchEvent(new CustomEvent('projectx:projects-changed'))

    if (failures.length) {
      const failedNames = new Set(failures.map((failure) => failure.split(':', 1)[0]))
      setSelected(new Set(chosen.filter((repo) => failedNames.has(repo.name)).map((repo) => repo.id)))
      setMessage(`${imported.length}/${chosen.length} installed locally. ${failures.length} failed and were not marked complete, so you can retry. ${failures[0]}`)
      setBusy(false)
      return
    }
    setMessage(desktop ? `${imported.length} GitHub project${imported.length === 1 ? '' : 's'} cloned and Ready. A project becomes Live only after Run confirms its local dev server is healthy. Select Done to return to the workspace.` : `${imported.length} GitHub remote record${imported.length === 1 ? '' : 's'} added. Select Done to return to the workspace.`)
    setSelected(new Set())
    setCompleted(true)
    setBusy(false)
  }

  if (!open) return null

  return (
    <div className="github-discovery-backdrop" role="presentation" onClick={() => !busy && setOpen(false)}>
      <section className="github-discovery-modal" role="dialog" aria-modal="true" aria-labelledby="github-discovery-title" onClick={(event) => event.stopPropagation()}>
        <header className="github-discovery-head">
          <div><p>GITHUB / NEW REPOSITORIES</p><h2 id="github-discovery-title">Choose what belongs in project.X</h2><span>{repos.length} available {repos.length === 1 ? 'repository' : 'repositories'} found. {desktop ? 'A repository is marked Ready only after its local clone succeeds. It becomes Live only after Run confirms a healthy dev server.' : 'Nothing will be added until you choose it.'}</span></div>
          <button type="button" disabled={busy} onClick={() => setOpen(false)} aria-label="Close discovery">×</button>
        </header>

        {message && <p className="github-install-message">{message}</p>}
        <div className="github-discovery-toolbar"><button type="button" disabled={busy} onClick={toggleAll}>{allSelected ? 'Clear all' : 'Select all'}</button><span>{selectedCount} selected</span></div>
        <div className="github-discovery-list">
          {sortedRepos.map((repo) => {
            const checked = selected.has(repo.id)
            return <button key={repo.id} disabled={busy} type="button" className={checked ? 'github-discovery-row selected' : 'github-discovery-row'} onClick={() => toggleRepo(repo.id)}>
              <span className="github-check" aria-hidden="true">{checked ? '✓' : ''}</span>
              <span className="github-repo-copy"><strong>{repo.name}</strong><small>{repo.description || 'No repository description.'}</small><span className="github-repo-meta"><b>{repo.language || 'Unknown'}</b><i>Last push {relativeDate(repo.pushed_at || repo.updated_at)}</i>{repo.archived && <em>Archived</em>}</span></span>
            </button>
          })}
        </div>
        <footer className="github-discovery-actions">{completed ? <button className="github-import-primary" type="button" onClick={() => setOpen(false)}>Done - view projects</button> : <><button type="button" disabled={busy} onClick={() => setOpen(false)}>Not now</button><button className="github-import-primary" type="button" disabled={!selectedCount || busy} onClick={() => void importSelected()}>{busy ? 'Cloning selected projects…' : `${desktop ? 'Clone' : 'Add'} ${selectedCount || ''} selected ${selectedCount === 1 ? 'project' : 'projects'}`}</button></>}</footer>
      </section>
    </div>
  )
}
