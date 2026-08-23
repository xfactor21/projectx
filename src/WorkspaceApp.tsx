import { useEffect, useMemo, useState } from 'react'
import { getDesktopHost } from './services/desktop'

type ProjectStatus = 'Live' | 'Building' | 'Concept' | 'Paused'
type ThemeMode = 'Grid' | 'Storefront' | 'Vending' | 'Comic' | '3D'
type NavMode = 'Projects' | 'Favorites' | 'Activity' | 'Archive'

type Project = {
  id: string
  name: string
  kicker?: string
  description?: string
  status?: ProjectStatus
  stack?: string[]
  accent?: string
  updated?: string
  progress?: number
  favorite?: boolean
  archived?: boolean
  repoUrl?: string
  liveUrl?: string
  notes?: string
  coverUrl?: string
  github?: { fullName?: string; language?: string; stars?: number; forks?: number; openIssues?: number; defaultBranch?: string; lastPush?: string }
}

type LocalSource = {
  projectId: string
  kind?: 'desktop' | 'browser' | 'managed' | 'zip' | 'generated'
  label?: string
  path?: string
  scripts?: string[]
  hasGit?: boolean
  gitBranch?: string
  source?: string
  linkedAt?: string
}

const PROJECTS_KEY = 'projectx.projects.v1'
const LOCAL_KEY = 'projectx.local.sources.v1'
const VIEW_KEY = 'projectx.view.v1'
const navItems: NavMode[] = ['Projects', 'Favorites', 'Activity', 'Archive']
const themes: Array<{ id: ThemeMode; label: string; sub: string }> = [
  { id: 'Grid', label: 'Command', sub: 'Developer control room' },
  { id: 'Storefront', label: 'Storefront', sub: 'Brick + glass showroom' },
  { id: 'Vending', label: 'Vending', sub: 'Machine cabinet' },
  { id: 'Comic', label: 'Comic', sub: 'Ink + panel universe' },
  { id: '3D', label: 'Gallery', sub: 'Spatial exhibit' },
]

function readProjects(): Project[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(PROJECTS_KEY) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}

function readSources(): LocalSource[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}

function readTheme(): ThemeMode {
  const saved = localStorage.getItem(VIEW_KEY) as ThemeMode | null
  return saved && themes.some((theme) => theme.id === saved) ? saved : 'Grid'
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'PX'
}

function sourceLabel(project: Project, source?: LocalSource) {
  if (source?.kind === 'managed') return 'MANAGED WINDOWS'
  if (source?.kind === 'zip') return 'INITIALIZED ZIP'
  if (source?.kind === 'generated') return 'PROJECT.X CREATED'
  if (source?.kind === 'desktop') return 'LOCAL WINDOWS'
  if (source?.kind === 'browser') return 'LOCAL BROWSER'
  if (project.github || project.repoUrl?.includes('github.com')) return 'GITHUB'
  return 'CLOUD / RECORD'
}

function dispatchLauncher() {
  window.dispatchEvent(new CustomEvent('projectx:open-add-project'))
}

export default function WorkspaceApp() {
  const desktop = getDesktopHost()
  const [projects, setProjects] = useState<Project[]>(readProjects)
  const [sources, setSources] = useState<LocalSource[]>(readSources)
  const [theme, setTheme] = useState<ThemeMode>(readTheme)
  const [nav, setNav] = useState<NavMode>('Projects')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Project | null>(null)
  const [statusMessage, setStatusMessage] = useState(desktop ? 'Windows host online' : 'Web workspace')

  useEffect(() => {
    const refresh = () => { setProjects(readProjects()); setSources(readSources()) }
    window.addEventListener('storage', refresh)
    window.addEventListener('projectx:projects-changed', refresh)
    return () => { window.removeEventListener('storage', refresh); window.removeEventListener('projectx:projects-changed', refresh) }
  }, [])

  useEffect(() => { localStorage.setItem(VIEW_KEY, theme) }, [theme])

  const sourceMap = useMemo(() => new Map(sources.map((source) => [source.projectId, source])), [sources])
  const visible = useMemo(() => projects.filter((project) => {
    if (nav === 'Favorites' && !project.favorite) return false
    if (nav === 'Archive' && !project.archived) return false
    if (nav !== 'Archive' && project.archived) return false
    const haystack = `${project.name} ${project.kicker || ''} ${project.description || ''} ${(project.stack || []).join(' ')}`.toLowerCase()
    return haystack.includes(query.trim().toLowerCase())
  }), [projects, nav, query])

  const active = projects.filter((project) => !project.archived)
  const localCount = active.filter((project) => sourceMap.has(project.id)).length
  const repoCount = active.filter((project) => Boolean(project.github || project.repoUrl)).length
  const liveCount = active.filter((project) => project.status === 'Live').length

  function setThemeMode(next: ThemeMode) {
    setTheme(next)
    setStatusMessage(`${themes.find((item) => item.id === next)?.label} environment loaded`)
    window.dispatchEvent(new CustomEvent('projectx:theme-changed', { detail: next }))
  }

  async function runProject(project: Project) {
    const source = sourceMap.get(project.id)
    if (!desktop || !source?.path) {
      setStatusMessage('This project is not available on this Windows host.')
      return
    }
    const script = source.scripts?.includes('dev') ? 'dev' : source.scripts?.includes('start') ? 'start' : ''
    if (!script) {
      setStatusMessage('No dev/start script is registered for this project.')
      return
    }
    try {
      const result = await desktop.runDevProject(source.path, script)
      setStatusMessage(result.output)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Unable to start project.')
    }
  }

  return <div className={`px-shell workspace-v2 theme-${theme.toLowerCase()}`}>
    <aside className="sidebar v2-sidebar">
      <button className="brand-lockup" type="button" onClick={() => setNav('Projects')}>
        <div className="brand-mark">X</div><div><div className="brand-name">project<span>.X</span></div><div className="brand-subtitle">PROJECT LIFECYCLE</div></div>
      </button>
      <nav className="primary-nav">
        {navItems.map((item) => <button key={item} type="button" className={nav === item ? 'nav-item active' : 'nav-item'} onClick={() => setNav(item)}><span className="nav-dot"/><span>{item}</span><span className="nav-count">{item === 'Projects' ? active.length : item === 'Favorites' ? active.filter((project) => project.favorite).length : item === 'Archive' ? projects.filter((project) => project.archived).length : '•'}</span></button>)}
      </nav>
      <div className="v2-source-status">
        <small>WORKSPACE SOURCE</small>
        <strong>{desktop ? 'Windows + Cloud' : 'Cloud / Web'}</strong>
        <span>{localCount} local · {repoCount} repos</span>
      </div>
      <div className="sidebar-spacer"/>
      <button className="v2-add-side" type="button" onClick={dispatchLauncher}>+ Add / Import</button>
      <div className="v2-host-state"><i className={desktop ? 'online' : ''}/><span>{desktop ? 'DESKTOP HOST ONLINE' : 'DESKTOP HOST OFFLINE'}</span></div>
    </aside>

    <main className="workspace v2-workspace">
      <header className="topbar v2-topbar">
        <div><p className="eyebrow">{themes.find((item) => item.id === theme)?.sub} / {nav}</p><h1>{nav === 'Projects' ? 'Your project universe.' : nav}</h1><p className="v2-status-line">{statusMessage}</p></div>
        <div className="topbar-actions"><label className="search-box"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search projects…"/></label><button className="add-primary" type="button" onClick={dispatchLauncher}>+ Add project</button></div>
      </header>

      <section className="v2-theme-deck" aria-label="Workspace environments">
        {themes.map((item) => <button key={item.id} type="button" className={theme === item.id ? 'active' : ''} onClick={() => setThemeMode(item.id)}><strong>{item.label}</strong><span>{item.sub}</span></button>)}
      </section>

      <section className="stats-strip v2-stats">
        <div><span>PROJECTS</span><strong>{String(active.length).padStart(2, '0')}</strong></div>
        <div><span>LOCAL</span><strong>{String(localCount).padStart(2, '0')}</strong></div>
        <div><span>REPOS</span><strong>{String(repoCount).padStart(2, '0')}</strong></div>
        <div><span>LIVE</span><strong>{String(liveCount).padStart(2, '0')}</strong></div>
      </section>

      {nav === 'Activity' ? <section className="v2-activity"><div className="section-heading"><div><p className="eyebrow">RECENT STATE</p><h3>Workspace activity</h3></div></div>{active.length ? active.map((project, index) => <button type="button" key={project.id} onClick={() => setSelected(project)}><b>{String(index + 1).padStart(2, '0')}</b><strong>{project.name}</strong><span>{sourceLabel(project, sourceMap.get(project.id))} · {project.updated || 'Unknown update'}</span></button>) : <p>No project activity yet.</p>}</section> : <>
        <section className="section-heading v2-heading"><div><p className="eyebrow">ENVIRONMENT / {theme.toUpperCase()}</p><h3>{nav === 'Archive' ? 'Archived projects' : nav === 'Favorites' ? 'Favorites' : 'Projects'}</h3></div><span className="result-count">{visible.length} SHOWN</span></section>
        <section className={`project-grid view-${theme.toLowerCase()} v2-project-grid`}>
          {visible.map((project, index) => {
            const source = sourceMap.get(project.id)
            return <article className={`project-card accent-${project.accent || 'cyan'} v2-card`} key={project.id}>
              <button className={`card-visual ${project.coverUrl ? 'has-cover' : ''}`} type="button" style={project.coverUrl ? { backgroundImage: `linear-gradient(rgba(3,5,9,.25),rgba(3,5,9,.82)),url(${project.coverUrl})` } : undefined} onClick={() => setSelected(project)}>
                <span className="project-index">{String(index + 1).padStart(2, '0')}</span><span className="v2-source-pill">{sourceLabel(project, source)}</span><div className="monogram">{initials(project.name)}</div>
              </button>
              <div className="card-body"><div className="project-title-row"><div><p>{project.kicker || 'Project'}</p><h4>{project.name}</h4></div><span className={`status-pill status-${(project.status || 'Building').toLowerCase()}`}>{project.status || 'Building'}</span></div>
                <p className="project-description">{project.description || 'No description yet.'}</p>
                <div className="v2-source-meta"><span>{source?.path ? desktop ? '● Available on this PC' : '○ PC offline' : 'Cloud / remote record'}</span>{source?.gitBranch && <span>Branch {source.gitBranch}</span>}</div>
                <div className="stack-row">{(project.stack || []).map((tech) => <span key={tech}>{tech}</span>)}</div>
                <div className="card-footer"><span>{project.updated || 'Unknown update'}</span><div><button type="button" disabled={!source?.path || !desktop} onClick={() => void runProject(project)}>Run</button><button type="button" disabled={!project.repoUrl} onClick={() => project.repoUrl && window.open(project.repoUrl, '_blank', 'noopener')}>Repo</button><button type="button" onClick={() => setSelected(project)}>Open</button></div></div>
              </div>
            </article>
          })}
          {visible.length === 0 && <div className="v2-empty-state"><span>PROJECT.X / EMPTY WORKSPACE</span><h2>{projects.length ? 'Nothing matches this view.' : 'Bring in your first real project.'}</h2><p>{projects.length ? 'Change your search or navigation.' : 'No demo catalog is being substituted. Add a Windows folder, initialize a ZIP, create a project, connect GitHub, or restore your cloud workspace.'}</p><button type="button" onClick={dispatchLauncher}>+ Add / Import Project</button></div>}
        </section>
      </>}
    </main>

    {selected && <div className="v2-detail-backdrop" onMouseDown={() => setSelected(null)}><aside className="v2-detail" onMouseDown={(event) => event.stopPropagation()}><button className="v2-detail-close" type="button" onClick={() => setSelected(null)}>×</button><small>{sourceLabel(selected, sourceMap.get(selected.id))}</small><h2>{selected.name}</h2><p>{selected.description || 'No description yet.'}</p><div className="v2-detail-facts"><span>Status <b>{selected.status || 'Building'}</b></span><span>Local <b>{sourceMap.get(selected.id)?.path ? desktop ? 'Online' : 'PC offline' : 'No'}</b></span><span>Git <b>{sourceMap.get(selected.id)?.hasGit ? 'Detected' : selected.repoUrl ? 'Remote' : 'None'}</b></span></div>{sourceMap.get(selected.id)?.path && <code>{sourceMap.get(selected.id)?.path}</code>}<div className="v2-detail-actions"><button type="button" disabled={!desktop || !sourceMap.get(selected.id)?.path} onClick={() => sourceMap.get(selected.id)?.path && desktop?.openInExplorer(sourceMap.get(selected.id)!.path!)}>Explorer</button><button type="button" disabled={!desktop || !sourceMap.get(selected.id)?.path} onClick={() => sourceMap.get(selected.id)?.path && desktop?.openInTerminal(sourceMap.get(selected.id)!.path!)}>Terminal</button><button type="button" disabled={!desktop || !sourceMap.get(selected.id)?.path} onClick={() => void runProject(selected)}>Run project</button></div></aside></div>}
  </div>
}
