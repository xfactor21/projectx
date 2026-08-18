import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'
import { fetchPublicRepos, relativeDate } from './services/github'
import type { GitHubRepo } from './services/github'
import { fetchVercelDeployments } from './services/vercel'

type ProjectStatus = 'Live' | 'Building' | 'Concept' | 'Paused'
type Accent = 'pink' | 'cyan' | 'violet'
type ViewMode = 'Grid' | 'Storefront' | 'Vending' | 'Comic' | '3D'
type NavMode = 'Projects' | 'Favorites' | 'Activity' | 'Archive'

type GitHubMeta = {
  fullName: string
  language: string
  stars: number
  forks: number
  openIssues: number
  defaultBranch: string
  lastPush: string
  syncedAt: string
}

type Project = {
  id: string
  name: string
  kicker: string
  description: string
  status: ProjectStatus
  stack: string[]
  accent: Accent
  updated: string
  progress: number
  favorite: boolean
  archived: boolean
  repoUrl: string
  liveUrl: string
  notes: string
  coverUrl?: string
  github?: GitHubMeta
}

type ProjectDraft = {
  name: string
  kicker: string
  description: string
  status: ProjectStatus
  stack: string[]
  accent: Accent
  progress: number
  repoUrl: string
  liveUrl: string
  notes: string
  coverUrl: string
}

type SyncState = 'idle' | 'syncing' | 'success' | 'error'

const STORAGE_KEY = 'projectx.projects.v1'
const VIEW_KEY = 'projectx.view.v1'
const GITHUB_OWNER_KEY = 'projectx.github.owner.v1'

const seedProjects: Project[] = [
  {
    id: 'xos', name: 'xOS', kicker: 'Developer operating system',
    description: 'A modular creative and development environment built to make tools, code, projects and AI feel like one living workspace.',
    status: 'Live', stack: ['React', 'Tauri', 'Supabase'], accent: 'cyan', updated: 'Today', progress: 82,
    favorite: true, archived: false, repoUrl: 'https://github.com/xfactor21/xos-nexus', liveUrl: 'https://xos-nexus.vercel.app/',
    notes: 'Keep xOS separate from project.X until the app manager is mature enough to integrate deliberately.',
  },
  {
    id: 'voice-studio-x', name: 'Voice Studio X', kicker: 'AI voice creation suite',
    description: 'Voice cloning, transformation, text-to-speech and singing workflows in a creator-first studio.',
    status: 'Building', stack: ['TypeScript', 'Audio', 'AI'], accent: 'pink', updated: 'Recently', progress: 68,
    favorite: true, archived: false, repoUrl: 'https://github.com/xfactor21/Voice-Studio-X', liveUrl: '',
    notes: 'Primary focus: stable authentication, real xClone pipeline, storage, and premium creator workflow.',
  },
  {
    id: 'x-ide', name: 'X IDE', kicker: 'Mobile development environment',
    description: 'A high-capability coding workspace designed around fast creation, testing and project mobility.',
    status: 'Building', stack: ['Android', 'Editor', 'Runtime'], accent: 'violet', updated: 'Recently', progress: 54,
    favorite: false, archived: false, repoUrl: 'https://github.com/xfactor21/x-IDE', liveUrl: '', notes: '',
  },
  {
    id: 'solar-signal', name: 'Solar Signal', kicker: 'Pattern intelligence system',
    description: 'An anomaly and pattern analysis framework for solar activity, events and evolving evidence.',
    status: 'Concept', stack: ['Data', 'Research', 'ML'], accent: 'cyan', updated: 'Recently', progress: 31,
    favorite: false, archived: false, repoUrl: '', liveUrl: '',
    notes: 'Research-first project. Keep anomaly detection explainable and preserve evidence trails.',
  },
  {
    id: 'project-x', name: 'project.X', kicker: 'Visual app manager',
    description: 'The standalone command center for every app, repository, deployment, idea and build state across the planet.X universe.',
    status: 'Building', stack: ['React', 'TypeScript', 'Vite'], accent: 'pink', updated: 'Today', progress: 52,
    favorite: true, archived: false, repoUrl: 'https://github.com/xfactor21/projectx', liveUrl: '',
    notes: 'Standalone first. xOS integration comes later.',
  },
]

const emptyDraft: ProjectDraft = {
  name: '', kicker: '', description: '', status: 'Building', stack: [], accent: 'pink', progress: 10,
  repoUrl: '', liveUrl: '', notes: '', coverUrl: '',
}

const navItems: NavMode[] = ['Projects', 'Favorites', 'Activity', 'Archive']
const viewModes: ViewMode[] = ['Grid', 'Storefront', 'Vending', 'Comic', '3D']
const statuses: Array<'All' | ProjectStatus> = ['All', 'Live', 'Building', 'Concept', 'Paused']

function normalizeProject(value: Partial<Project>): Project {
  return {
    id: value.id || `project-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: value.name || 'Untitled project', kicker: value.kicker || 'Project', description: value.description || '',
    status: value.status || 'Building', stack: Array.isArray(value.stack) ? value.stack : [], accent: value.accent || 'pink',
    updated: value.updated || 'Unknown', progress: Number.isFinite(value.progress) ? Number(value.progress) : 0,
    favorite: Boolean(value.favorite), archived: Boolean(value.archived), repoUrl: value.repoUrl || '', liveUrl: value.liveUrl || '',
    notes: value.notes || '', coverUrl: value.coverUrl || '', github: value.github,
  }
}

function readProjects() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (!saved) return seedProjects
    const parsed = JSON.parse(saved) as Partial<Project>[]
    return Array.isArray(parsed) && parsed.length ? parsed.map(normalizeProject) : seedProjects
  } catch { return seedProjects }
}

function readView(): ViewMode {
  try {
    const saved = localStorage.getItem(VIEW_KEY) as ViewMode | null
    return saved && viewModes.includes(saved) ? saved : 'Grid'
  } catch { return 'Grid' }
}

function readGitHubOwner() {
  try { return localStorage.getItem(GITHUB_OWNER_KEY) || 'xfactor21' } catch { return 'xfactor21' }
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  return (parts.length === 1 ? parts[0].slice(0, 2) : parts.map((part) => part[0]).join('').slice(0, 2)).toUpperCase()
}

function safeOpen(url: string) {
  if (url) window.open(url, '_blank', 'noopener,noreferrer')
}

function repoKey(url: string) {
  return url.toLowerCase().replace(/\.git$/i, '').replace(/\/$/, '')
}

function accentFor(index: number): Accent {
  return (['pink', 'cyan', 'violet'] as Accent[])[index % 3]
}

function repoToProject(repo: GitHubRepo, index: number): Project {
  const topics = repo.topics?.slice(0, 4) || []
  const stack = [repo.language, ...topics].filter(Boolean).slice(0, 6) as string[]
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

function App() {
  const [projects, setProjects] = useState<Project[]>(readProjects)
  const [activeNav, setActiveNav] = useState<NavMode>('Projects')
  const [viewMode, setViewMode] = useState<ViewMode>(readView)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'All' | ProjectStatus>('All')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<ProjectDraft>(emptyDraft)
  const [stackInput, setStackInput] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [githubOwner, setGithubOwner] = useState(readGitHubOwner)
  const [githubSync, setGithubSync] = useState<SyncState>('idle')
  const [vercelSync, setVercelSync] = useState<SyncState>('idle')
  const [syncMessage, setSyncMessage] = useState('Ready for live integrations.')
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(projects)) }, [projects])
  useEffect(() => { localStorage.setItem(VIEW_KEY, viewMode) }, [viewMode])
  useEffect(() => { localStorage.setItem(GITHUB_OWNER_KEY, githubOwner) }, [githubOwner])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault(); document.querySelector<HTMLInputElement>('#project-search')?.focus()
      }
      if (event.key === 'Escape') { setShowForm(false); setShowSettings(false); setSelectedId(null) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const visibleProjects = useMemo(() => projects.filter((project) => {
    if (activeNav === 'Favorites' && (!project.favorite || project.archived)) return false
    if (activeNav === 'Archive' && !project.archived) return false
    if ((activeNav === 'Projects' || activeNav === 'Activity') && project.archived) return false
    const haystack = `${project.name} ${project.kicker} ${project.description} ${project.stack.join(' ')} ${project.github?.fullName || ''}`.toLowerCase()
    return haystack.includes(query.trim().toLowerCase()) && (status === 'All' || project.status === status)
  }), [projects, activeNav, query, status])

  const selectedProject = projects.find((project) => project.id === selectedId) ?? null
  const activeProjects = projects.filter((project) => !project.archived)
  const liveCount = activeProjects.filter((project) => project.status === 'Live').length
  const buildingCount = activeProjects.filter((project) => project.status === 'Building').length
  const favoriteCount = activeProjects.filter((project) => project.favorite).length
  const connectedRepos = projects.filter((project) => project.github).length
  const averageProgress = Math.round(activeProjects.reduce((sum, project) => sum + project.progress, 0) / Math.max(1, activeProjects.length))

  const activity = useMemo(() => [...activeProjects]
    .sort((a, b) => (b.github?.lastPush || '').localeCompare(a.github?.lastPush || ''))
    .slice(0, 10)
    .map((project) => ({ id: project.id, title: project.name, detail: project.github
      ? `GitHub · ${relativeDate(project.github.lastPush)} · ${project.github.defaultBranch}`
      : `${project.status} · ${project.progress}% complete · ${project.updated}` })), [projects])

  function openNewProject() { setEditingId(null); setDraft(emptyDraft); setStackInput(''); setShowForm(true) }

  function openEdit(project: Project) {
    setEditingId(project.id)
    setDraft({ name: project.name, kicker: project.kicker, description: project.description, status: project.status,
      stack: project.stack, accent: project.accent, progress: project.progress, repoUrl: project.repoUrl,
      liveUrl: project.liveUrl, notes: project.notes, coverUrl: project.coverUrl || '' })
    setStackInput(project.stack.join(', ')); setShowForm(true)
  }

  function saveProject(event: FormEvent) {
    event.preventDefault()
    const cleanName = draft.name.trim(); if (!cleanName) return
    const nextDraft = { ...draft, name: cleanName, kicker: draft.kicker.trim() || 'Untitled project',
      description: draft.description.trim(), stack: stackInput.split(',').map((item) => item.trim()).filter(Boolean).slice(0, 8),
      progress: Math.max(0, Math.min(100, Number(draft.progress) || 0)), repoUrl: draft.repoUrl.trim(),
      liveUrl: draft.liveUrl.trim(), notes: draft.notes.trim(), coverUrl: draft.coverUrl.trim() }
    if (editingId) setProjects((current) => current.map((project) => project.id === editingId ? { ...project, ...nextDraft, updated: 'Just now' } : project))
    else setProjects((current) => [{ id: `${cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}-${Date.now().toString().slice(-5)}`,
      ...nextDraft, favorite: false, archived: false, updated: 'Just now' }, ...current])
    setShowForm(false)
  }

  async function syncGitHub() {
    setGithubSync('syncing'); setSyncMessage(`Scanning public repositories for ${githubOwner}…`)
    try {
      const repos = await fetchPublicRepos(githubOwner)
      setProjects((current) => {
        const next = [...current]
        const lookup = new Map(next.filter((p) => p.repoUrl).map((p, index) => [repoKey(p.repoUrl), index]))
        let imported = 0
        repos.forEach((repo, index) => {
          const incoming = repoToProject(repo, index)
          const existingIndex = lookup.get(repoKey(repo.html_url))
          if (existingIndex === undefined) { next.push(incoming); imported += 1 }
          else {
            const existing = next[existingIndex]
            next[existingIndex] = { ...existing,
              description: existing.description || incoming.description,
              stack: incoming.stack.length ? Array.from(new Set([...existing.stack, ...incoming.stack])).slice(0, 8) : existing.stack,
              updated: incoming.updated, repoUrl: repo.html_url, liveUrl: existing.liveUrl || incoming.liveUrl,
              coverUrl: existing.coverUrl || incoming.coverUrl, github: incoming.github,
              archived: existing.archived || repo.archived,
            }
          }
        })
        setSyncMessage(`GitHub synced: ${repos.length} repos found, ${imported} new projects imported.`)
        return next
      })
      setGithubSync('success')
    } catch (error) {
      setGithubSync('error'); setSyncMessage(error instanceof Error ? error.message : 'GitHub sync failed.')
    }
  }

  async function syncVercel() {
    setVercelSync('syncing'); setSyncMessage('Loading Vercel deployments…')
    const result = await fetchVercelDeployments()
    if (!result.connected) { setVercelSync('error'); setSyncMessage(result.message || 'Vercel is not connected yet.'); return }
    const latestByName = new Map<string, typeof result.deployments[number]>()
    result.deployments.forEach((deployment) => { if (!latestByName.has(deployment.name)) latestByName.set(deployment.name, deployment) })
    let matched = 0
    setProjects((current) => current.map((project) => {
      const repoName = project.github?.fullName.split('/').pop() || project.repoUrl.split('/').filter(Boolean).pop() || ''
      const candidates = [repoName, project.name].map((value) => value.toLowerCase().replace(/[^a-z0-9]/g, ''))
      const match = [...latestByName.values()].find((deployment) => candidates.includes(deployment.name.toLowerCase().replace(/[^a-z0-9]/g, '')))
      if (!match) return project
      matched += 1
      return { ...project, liveUrl: match.url, status: match.state === 'READY' ? 'Live' : project.status, updated: 'Just now' }
    }))
    setVercelSync('success'); setSyncMessage(`Vercel synced: ${result.deployments.length} deployments loaded, ${matched} projects matched.`)
  }

  function toggleFavorite(id: string) { setProjects((current) => current.map((p) => p.id === id ? { ...p, favorite: !p.favorite, updated: 'Just now' } : p)) }
  function toggleArchive(id: string) { setProjects((current) => current.map((p) => p.id === id ? { ...p, archived: !p.archived, updated: 'Just now' } : p)); setSelectedId(null) }
  function deleteProject(id: string) { if (window.confirm('Delete this project from project.X?')) { setProjects((current) => current.filter((p) => p.id !== id)); setSelectedId(null) } }

  function exportProjects() {
    const blob = new Blob([JSON.stringify({ version: 2, exportedAt: new Date().toISOString(), projects }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'project-x-backup.json'; anchor.click(); URL.revokeObjectURL(url)
  }

  async function importProjects(file: File) {
    try {
      const parsed = JSON.parse(await file.text()) as { projects?: Partial<Project>[] } | Partial<Project>[]
      const values = Array.isArray(parsed) ? parsed : parsed.projects
      if (!Array.isArray(values)) throw new Error('No project array found in backup.')
      const imported = values.map(normalizeProject)
      setProjects((current) => {
        const merged = [...current]
        imported.forEach((incoming) => {
          const index = merged.findIndex((p) => p.id === incoming.id || (incoming.repoUrl && repoKey(p.repoUrl) === repoKey(incoming.repoUrl)))
          if (index >= 0) merged[index] = { ...merged[index], ...incoming }
          else merged.push(incoming)
        })
        return merged
      })
      setSyncMessage(`Imported ${imported.length} project records from backup.`)
    } catch (error) { setSyncMessage(error instanceof Error ? error.message : 'Backup import failed.') }
  }

  function resetWorkspace() { if (window.confirm('Reset project.X to the starter project set?')) { setProjects(seedProjects); setShowSettings(false) } }

  return (
    <div className="px-shell">
      <aside className="sidebar">
        <button className="brand-lockup" type="button" onClick={() => setActiveNav('Projects')}>
          <div className="brand-mark" aria-hidden="true">X</div><div><div className="brand-name">project<span>.X</span></div><div className="brand-subtitle">APP MANAGER</div></div>
        </button>
        <nav className="primary-nav" aria-label="Primary navigation">
          {navItems.map((item) => <button key={item} className={activeNav === item ? 'nav-item active' : 'nav-item'} onClick={() => setActiveNav(item)} type="button">
            <span className="nav-dot"/><span>{item}</span><span className="nav-count">{item === 'Projects' ? activeProjects.length : item === 'Favorites' ? favoriteCount : item === 'Archive' ? projects.filter((p) => p.archived).length : '•'}</span>
          </button>)}
        </nav>
        <div className="sidebar-spacer"/>
        <div className="system-card"><div className="system-card-topline"><span className="pulse-dot"/>SYSTEM ONLINE</div><strong>{activeProjects.length} projects tracked</strong><span>{connectedRepos} connected to GitHub</span></div>
        <button className="settings-button" type="button" onClick={() => setShowSettings(true)}><span>⚙</span> Settings</button>
      </aside>

      <main className="workspace">
        <header className="topbar"><div><p className="eyebrow">COMMAND CENTER / {activeNav.toUpperCase()}</p><h1>Your projects, <span>alive.</span></h1></div>
          <div className="topbar-actions"><label className="search-box"><span>⌕</span><input id="project-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search projects..."/><kbd>Ctrl K</kbd></label><button className="add-primary" type="button" onClick={openNewProject}>+ Add project</button></div>
        </header>

        <section className="stats-strip" aria-label="Workspace statistics">
          <div><span>ACTIVE</span><strong>{String(activeProjects.length).padStart(2,'0')}</strong></div><div><span>LIVE</span><strong>{String(liveCount).padStart(2,'0')}</strong></div><div><span>GITHUB</span><strong>{String(connectedRepos).padStart(2,'0')}</strong></div><div><span>AVG. PROGRESS</span><strong>{averageProgress}%</strong></div>
        </section>

        <section className="integration-deck">
          <div className="integration-copy"><p className="eyebrow">PHASE 3 / LIVE DATA</p><h2>Connect the build universe.</h2><p>{syncMessage}</p></div>
          <div className="integration-actions">
            <label className="owner-field"><span>GitHub owner</span><input value={githubOwner} onChange={(e) => setGithubOwner(e.target.value)} /></label>
            <button className={`sync-button ${githubSync}`} type="button" onClick={syncGitHub} disabled={githubSync === 'syncing'}>{githubSync === 'syncing' ? 'Syncing GitHub…' : '↻ Sync GitHub'}</button>
            <button className={`sync-button ${vercelSync}`} type="button" onClick={syncVercel} disabled={vercelSync === 'syncing'}>{vercelSync === 'syncing' ? 'Syncing Vercel…' : '△ Sync Vercel'}</button>
          </div>
        </section>

        <section className="hero-panel"><div className="hero-copy"><span className="hero-label">PROJECT UNIVERSE // {String(activeProjects.length).padStart(2,'0')} ACTIVE</span><h2>Everything you’re building.<br/><em>One visual system.</em></h2><p>Track, sync, launch and inspect your apps with real repository metadata and deployment links.</p></div><div className="hero-orbit" aria-hidden="true"><span className="orbit orbit-one"/><span className="orbit orbit-two"/><span className="orbit-core">X</span><span className="satellite sat-one"/><span className="satellite sat-two"/><span className="satellite sat-three"/></div></section>

        <section className="controls-row"><div className="filter-group">{statuses.map((item) => <button key={item} type="button" className={status === item ? 'filter-chip active' : 'filter-chip'} onClick={() => setStatus(item)}>{item}</button>)}</div><div className="view-switcher">{viewModes.map((mode) => <button key={mode} type="button" className={viewMode === mode ? 'view-button active' : 'view-button'} onClick={() => setViewMode(mode)}>{mode}</button>)}</div></section>

        {activeNav === 'Activity' ? <section className="activity-panel"><div className="section-heading"><div><p className="eyebrow">WORKSPACE PULSE</p><h3>Current build activity</h3></div><span className="result-count">LIVE + LOCAL</span></div><div className="activity-list">{activity.map((item,index) => <button key={item.id} type="button" onClick={() => setSelectedId(item.id)}><span className="activity-number">{String(index+1).padStart(2,'0')}</span><strong>{item.title}</strong><span>{item.detail}</span><b>↗</b></button>)}</div></section> : <>
          <section className="section-heading"><div><p className="eyebrow">CURRENT VIEW / {viewMode.toUpperCase()}</p><h3>{activeNav === 'Archive' ? 'Archived projects' : activeNav === 'Favorites' ? 'Favorite projects' : 'Project gallery'}</h3></div><span className="result-count">{String(visibleProjects.length).padStart(2,'0')} PROJECTS</span></section>
          <section className={`project-grid view-${viewMode.toLowerCase()}`}>
            {visibleProjects.map((project,index) => <article className={`project-card accent-${project.accent}`} key={project.id}>
              <div className={`card-visual ${project.coverUrl ? 'has-cover' : ''}`} style={project.coverUrl ? { backgroundImage: `linear-gradient(rgba(3,5,9,.28),rgba(3,5,9,.82)),url(${project.coverUrl})` } : undefined} onClick={() => setSelectedId(project.id)} role="button" tabIndex={0}>
                <div className="visual-grid"/><span className="project-index">{String(index+1).padStart(2,'0')}</span><span className={`status-pill status-${project.status.toLowerCase()}`}>{project.status}</span><div className="monogram">{initials(project.name)}</div><div className="visual-x">X</div>
              </div>
              <div className="card-body"><div className="project-title-row"><div><p>{project.kicker}</p><h4>{project.name}</h4></div><div className="title-actions"><button className={project.favorite ? 'icon-button favorite' : 'icon-button'} type="button" onClick={() => toggleFavorite(project.id)}>★</button><button className="icon-button" type="button" onClick={() => setSelectedId(project.id)}>↗</button></div></div>
                <p className="project-description">{project.description}</p>
                {project.github && <div className="repo-metrics"><span>{project.github.language}</span><span>★ {project.github.stars}</span><span>⑂ {project.github.forks}</span><span>! {project.github.openIssues}</span><span>{project.github.defaultBranch}</span></div>}
                <div className="stack-row">{project.stack.map((tech) => <span key={tech}>{tech}</span>)}</div>
                <div className="progress-block"><div className="progress-meta"><span>{project.github ? `Last push ${relativeDate(project.github.lastPush)}` : 'Build progress'}</span><strong>{project.progress}%</strong></div><div className="progress-track"><span style={{width:`${project.progress}%`}}/></div></div>
                <div className="card-footer"><span>Updated {project.updated}</span><div><button type="button" disabled={!project.repoUrl} onClick={() => safeOpen(project.repoUrl)}>Repo</button><button type="button" disabled={!project.liveUrl} onClick={() => safeOpen(project.liveUrl)}>Launch</button><button type="button" onClick={() => openEdit(project)}>Edit</button></div></div>
              </div></article>)}
            {visibleProjects.length === 0 && <div className="empty-state"><span>∅</span><strong>No projects found</strong><p>Change the filters or sync GitHub.</p></div>}
            {activeNav !== 'Archive' && <button className="new-project-card" type="button" onClick={openNewProject}><span className="new-project-plus">+</span><strong>New project</strong><span>Connect a repo, URL, or start fresh</span></button>}
          </section></>}
        <footer className="workspace-footer"><span>project.X // Phase 3 integration build</span><span>{connectedRepos} GitHub-linked · Vercel {vercelSync === 'success' ? 'connected' : 'adapter ready'}</span></footer>
      </main>

      {selectedProject && <div className="drawer-backdrop" onClick={() => setSelectedId(null)}><aside className={`project-drawer accent-${selectedProject.accent}`} onClick={(e) => e.stopPropagation()}><button className="drawer-close" type="button" onClick={() => setSelectedId(null)}>×</button><div className="drawer-hero">{selectedProject.coverUrl && <img className="drawer-cover" src={selectedProject.coverUrl} alt=""/>}<span>{selectedProject.status}</span><div className="drawer-monogram">{initials(selectedProject.name)}</div><p>{selectedProject.kicker}</p><h2>{selectedProject.name}</h2></div><div className="drawer-content"><p className="drawer-description">{selectedProject.description || 'No description yet.'}</p>
        {selectedProject.github && <div className="drawer-section"><span>GITHUB / LIVE METADATA</span><p>{selectedProject.github.fullName}</p><div className="repo-metrics"><span>{selectedProject.github.language}</span><span>★ {selectedProject.github.stars}</span><span>Forks {selectedProject.github.forks}</span><span>Issues {selectedProject.github.openIssues}</span><span>{selectedProject.github.defaultBranch}</span></div><p>Last push {relativeDate(selectedProject.github.lastPush)}</p></div>}
        <div className="drawer-progress"><span>Progress</span><strong>{selectedProject.progress}%</strong><div><i style={{width:`${selectedProject.progress}%`}}/></div></div><div className="stack-row">{selectedProject.stack.map((tech) => <span key={tech}>{tech}</span>)}</div><div className="drawer-section"><span>NOTES</span><p>{selectedProject.notes || 'No notes yet.'}</p></div><div className="drawer-links"><button disabled={!selectedProject.repoUrl} onClick={() => safeOpen(selectedProject.repoUrl)} type="button">Open repository ↗</button><button disabled={!selectedProject.liveUrl} onClick={() => safeOpen(selectedProject.liveUrl)} type="button">Open live app ↗</button></div><div className="drawer-actions"><button type="button" onClick={() => openEdit(selectedProject)}>Edit project</button><button type="button" onClick={() => toggleFavorite(selectedProject.id)}>{selectedProject.favorite ? 'Remove favorite' : 'Favorite'}</button><button type="button" onClick={() => toggleArchive(selectedProject.id)}>{selectedProject.archived ? 'Restore' : 'Archive'}</button><button className="danger" type="button" onClick={() => deleteProject(selectedProject.id)}>Delete</button></div></div></aside></div>}

      {showForm && <div className="modal-backdrop" onClick={() => setShowForm(false)}><form className="project-modal" onSubmit={saveProject} onClick={(e) => e.stopPropagation()}><div className="modal-heading"><div><p className="eyebrow">PROJECT RECORD</p><h2>{editingId ? 'Edit project' : 'Add project'}</h2></div><button type="button" onClick={() => setShowForm(false)}>×</button></div><div className="form-grid">
        <label><span>Name *</span><input required value={draft.name} onChange={(e) => setDraft({...draft,name:e.target.value})}/></label><label><span>Subtitle</span><input value={draft.kicker} onChange={(e) => setDraft({...draft,kicker:e.target.value})}/></label><label className="wide"><span>Description</span><textarea rows={3} value={draft.description} onChange={(e) => setDraft({...draft,description:e.target.value})}/></label><label><span>Status</span><select value={draft.status} onChange={(e) => setDraft({...draft,status:e.target.value as ProjectStatus})}>{statuses.filter((item)=>item!=='All').map((item)=><option key={item}>{item}</option>)}</select></label><label><span>Accent</span><select value={draft.accent} onChange={(e) => setDraft({...draft,accent:e.target.value as Accent})}><option value="pink">Hot pink</option><option value="cyan">Cyan</option><option value="violet">Violet</option></select></label><label><span>Progress ({draft.progress}%)</span><input type="range" min="0" max="100" value={draft.progress} onChange={(e)=>setDraft({...draft,progress:Number(e.target.value)})}/></label><label><span>Stack</span><input value={stackInput} onChange={(e)=>setStackInput(e.target.value)} placeholder="React, Supabase, Vercel"/></label><label className="wide"><span>Repository URL</span><input type="url" value={draft.repoUrl} onChange={(e)=>setDraft({...draft,repoUrl:e.target.value})}/></label><label className="wide"><span>Live URL</span><input type="url" value={draft.liveUrl} onChange={(e)=>setDraft({...draft,liveUrl:e.target.value})}/></label><label className="wide"><span>Cover / screenshot URL</span><input type="url" value={draft.coverUrl} onChange={(e)=>setDraft({...draft,coverUrl:e.target.value})}/></label><label className="wide"><span>Notes</span><textarea rows={4} value={draft.notes} onChange={(e)=>setDraft({...draft,notes:e.target.value})}/></label>
      </div><div className="modal-actions"><button type="button" onClick={()=>setShowForm(false)}>Cancel</button><button className="add-primary" type="submit">{editingId ? 'Save changes' : 'Create project'}</button></div></form></div>}

      {showSettings && <div className="modal-backdrop" onClick={()=>setShowSettings(false)}><div className="settings-modal" onClick={(e)=>e.stopPropagation()}><div className="modal-heading"><div><p className="eyebrow">WORKSPACE</p><h2>Settings & data</h2></div><button type="button" onClick={()=>setShowSettings(false)}>×</button></div><div className="settings-grid"><button type="button" onClick={exportProjects}><strong>Export backup</strong><span>Download all project records as JSON.</span></button><button type="button" onClick={()=>fileInputRef.current?.click()}><strong>Import backup</strong><span>Merge a project.X JSON backup.</span></button><button type="button" onClick={syncGitHub}><strong>Sync GitHub</strong><span>Discover and refresh public repositories.</span></button><button type="button" onClick={syncVercel}><strong>Sync Vercel</strong><span>Load deployment data when connected.</span></button><button type="button" onClick={resetWorkspace}><strong>Reset starter data</strong><span>Restore the built-in starter set.</span></button><div><strong>Storage</strong><span>Local-first; cloud account sync is the next layer.</span></div></div><input ref={fileInputRef} hidden type="file" accept="application/json,.json" onChange={(e)=>{const file=e.target.files?.[0]; if(file) void importProjects(file); e.target.value=''}}/></div></div>}
    </div>
  )
}

export default App
