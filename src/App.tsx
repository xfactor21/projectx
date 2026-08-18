import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'

type ProjectStatus = 'Live' | 'Building' | 'Concept' | 'Paused'
type Accent = 'pink' | 'cyan' | 'violet'
type ViewMode = 'Grid' | 'Storefront' | 'Vending' | 'Comic' | '3D'
type NavMode = 'Projects' | 'Favorites' | 'Activity' | 'Archive'

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
}

type ProjectDraft = Omit<Project, 'id' | 'updated' | 'favorite' | 'archived'>

const STORAGE_KEY = 'projectx.projects.v1'
const VIEW_KEY = 'projectx.view.v1'

const seedProjects: Project[] = [
  {
    id: 'xos',
    name: 'xOS',
    kicker: 'Developer operating system',
    description: 'A modular creative and development environment built to make tools, code, projects and AI feel like one living workspace.',
    status: 'Live',
    stack: ['React', 'Tauri', 'Supabase'],
    accent: 'cyan',
    updated: 'Today',
    progress: 82,
    favorite: true,
    archived: false,
    repoUrl: 'https://github.com/xfactor21/xos-nexus',
    liveUrl: 'https://xos-nexus.vercel.app/',
    notes: 'Keep xOS separate from project.X until the app manager is mature enough to integrate deliberately.',
  },
  {
    id: 'voice-studio-x',
    name: 'Voice Studio X',
    kicker: 'AI voice creation suite',
    description: 'Voice cloning, transformation, text-to-speech and singing workflows in a creator-first studio.',
    status: 'Building',
    stack: ['TypeScript', 'Audio', 'AI'],
    accent: 'pink',
    updated: 'Recently',
    progress: 68,
    favorite: true,
    archived: false,
    repoUrl: 'https://github.com/xfactor21/Voice-Studio-X',
    liveUrl: '',
    notes: 'Primary focus: stable authentication, real xClone pipeline, storage, and premium creator workflow.',
  },
  {
    id: 'x-ide',
    name: 'X IDE',
    kicker: 'Mobile development environment',
    description: 'A high-capability coding workspace designed around fast creation, testing and project mobility.',
    status: 'Building',
    stack: ['Android', 'Editor', 'Runtime'],
    accent: 'violet',
    updated: 'Recently',
    progress: 54,
    favorite: false,
    archived: false,
    repoUrl: 'https://github.com/xfactor21/x-IDE',
    liveUrl: '',
    notes: '',
  },
  {
    id: 'solar-signal',
    name: 'Solar Signal',
    kicker: 'Pattern intelligence system',
    description: 'An anomaly and pattern analysis framework for solar activity, events and evolving evidence.',
    status: 'Concept',
    stack: ['Data', 'Research', 'ML'],
    accent: 'cyan',
    updated: 'Recently',
    progress: 31,
    favorite: false,
    archived: false,
    repoUrl: '',
    liveUrl: '',
    notes: 'Research-first project. Keep anomaly detection explainable and preserve evidence trails.',
  },
  {
    id: 'project-x',
    name: 'project.X',
    kicker: 'Visual app manager',
    description: 'The standalone command center for every app, repository, deployment, idea and build state across the planet.X universe.',
    status: 'Building',
    stack: ['React', 'TypeScript', 'Vite'],
    accent: 'pink',
    updated: 'Today',
    progress: 46,
    favorite: true,
    archived: false,
    repoUrl: 'https://github.com/xfactor21/projectx',
    liveUrl: '',
    notes: 'Standalone first. xOS integration comes later.',
  },
]

const emptyDraft: ProjectDraft = {
  name: '',
  kicker: '',
  description: '',
  status: 'Building',
  stack: [],
  accent: 'pink',
  progress: 10,
  repoUrl: '',
  liveUrl: '',
  notes: '',
}

const navItems: NavMode[] = ['Projects', 'Favorites', 'Activity', 'Archive']
const viewModes: ViewMode[] = ['Grid', 'Storefront', 'Vending', 'Comic', '3D']
const statuses: Array<'All' | ProjectStatus> = ['All', 'Live', 'Building', 'Concept', 'Paused']

function readProjects() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (!saved) return seedProjects
    const parsed = JSON.parse(saved) as Project[]
    return Array.isArray(parsed) && parsed.length ? parsed : seedProjects
  } catch {
    return seedProjects
  }
}

function readView(): ViewMode {
  try {
    const saved = localStorage.getItem(VIEW_KEY) as ViewMode | null
    return saved && viewModes.includes(saved) ? saved : 'Grid'
  } catch {
    return 'Grid'
  }
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return parts.map((part) => part[0]).join('').slice(0, 2).toUpperCase()
}

function safeOpen(url: string) {
  if (!url) return
  window.open(url, '_blank', 'noopener,noreferrer')
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

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects))
  }, [projects])

  useEffect(() => {
    localStorage.setItem(VIEW_KEY, viewMode)
  }, [viewMode])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        document.querySelector<HTMLInputElement>('#project-search')?.focus()
      }
      if (event.key === 'Escape') {
        setShowForm(false)
        setShowSettings(false)
        setSelectedId(null)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const visibleProjects = useMemo(() => {
    return projects.filter((project) => {
      if (activeNav === 'Favorites' && !project.favorite) return false
      if (activeNav === 'Archive' && !project.archived) return false
      if ((activeNav === 'Projects' || activeNav === 'Activity') && project.archived) return false

      const haystack = `${project.name} ${project.kicker} ${project.description} ${project.stack.join(' ')}`.toLowerCase()
      const matchesQuery = haystack.includes(query.trim().toLowerCase())
      const matchesStatus = status === 'All' || project.status === status
      return matchesQuery && matchesStatus
    })
  }, [projects, activeNav, query, status])

  const selectedProject = projects.find((project) => project.id === selectedId) ?? null
  const liveCount = projects.filter((project) => !project.archived && project.status === 'Live').length
  const buildingCount = projects.filter((project) => !project.archived && project.status === 'Building').length
  const favoriteCount = projects.filter((project) => !project.archived && project.favorite).length
  const averageProgress = Math.round(
    projects.filter((project) => !project.archived).reduce((sum, project) => sum + project.progress, 0) /
      Math.max(1, projects.filter((project) => !project.archived).length),
  )

  const activity = useMemo(() => {
    return projects
      .filter((project) => !project.archived)
      .sort((a, b) => b.progress - a.progress)
      .slice(0, 8)
      .map((project) => ({
        id: project.id,
        title: project.name,
        detail: `${project.status} · ${project.progress}% complete · ${project.updated}`,
      }))
  }, [projects])

  function openNewProject() {
    setEditingId(null)
    setDraft(emptyDraft)
    setStackInput('')
    setShowForm(true)
  }

  function openEdit(project: Project) {
    setEditingId(project.id)
    setDraft({
      name: project.name,
      kicker: project.kicker,
      description: project.description,
      status: project.status,
      stack: project.stack,
      accent: project.accent,
      progress: project.progress,
      repoUrl: project.repoUrl,
      liveUrl: project.liveUrl,
      notes: project.notes,
    })
    setStackInput(project.stack.join(', '))
    setShowForm(true)
  }

  function saveProject(event: FormEvent) {
    event.preventDefault()
    const cleanName = draft.name.trim()
    if (!cleanName) return

    const nextDraft = {
      ...draft,
      name: cleanName,
      kicker: draft.kicker.trim() || 'Untitled project',
      description: draft.description.trim(),
      stack: stackInput.split(',').map((item) => item.trim()).filter(Boolean).slice(0, 8),
      progress: Math.max(0, Math.min(100, Number(draft.progress) || 0)),
      repoUrl: draft.repoUrl.trim(),
      liveUrl: draft.liveUrl.trim(),
      notes: draft.notes.trim(),
    }

    if (editingId) {
      setProjects((current) => current.map((project) => (
        project.id === editingId
          ? { ...project, ...nextDraft, updated: 'Just now' }
          : project
      )))
    } else {
      const id = `${cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}-${Date.now().toString().slice(-5)}`
      setProjects((current) => [{
        id,
        ...nextDraft,
        favorite: false,
        archived: false,
        updated: 'Just now',
      }, ...current])
    }

    setShowForm(false)
  }

  function toggleFavorite(id: string) {
    setProjects((current) => current.map((project) => (
      project.id === id ? { ...project, favorite: !project.favorite, updated: 'Just now' } : project
    )))
  }

  function toggleArchive(id: string) {
    setProjects((current) => current.map((project) => (
      project.id === id ? { ...project, archived: !project.archived, updated: 'Just now' } : project
    )))
    setSelectedId(null)
  }

  function deleteProject(id: string) {
    if (!window.confirm('Delete this project from project.X? This only removes the local app-manager entry.')) return
    setProjects((current) => current.filter((project) => project.id !== id))
    setSelectedId(null)
  }

  function exportProjects() {
    const blob = new Blob([JSON.stringify(projects, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'project-x-backup.json'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  function resetWorkspace() {
    if (!window.confirm('Reset project.X to the starter project set?')) return
    setProjects(seedProjects)
    setShowSettings(false)
  }

  return (
    <div className="px-shell">
      <aside className="sidebar">
        <button className="brand-lockup" type="button" onClick={() => setActiveNav('Projects')}>
          <div className="brand-mark" aria-hidden="true">X</div>
          <div>
            <div className="brand-name">project<span>.X</span></div>
            <div className="brand-subtitle">APP MANAGER</div>
          </div>
        </button>

        <nav className="primary-nav" aria-label="Primary navigation">
          {navItems.map((item) => (
            <button
              key={item}
              className={activeNav === item ? 'nav-item active' : 'nav-item'}
              onClick={() => setActiveNav(item)}
              type="button"
            >
              <span className="nav-dot" />
              <span>{item}</span>
              <span className="nav-count">
                {item === 'Projects' ? projects.filter((p) => !p.archived).length :
                  item === 'Favorites' ? favoriteCount :
                    item === 'Archive' ? projects.filter((p) => p.archived).length : '•'}
              </span>
            </button>
          ))}
        </nav>

        <div className="sidebar-spacer" />

        <div className="system-card">
          <div className="system-card-topline"><span className="pulse-dot" />SYSTEM ONLINE</div>
          <strong>{projects.filter((project) => !project.archived).length} projects tracked</strong>
          <span>Saved locally on this device</span>
        </div>

        <button className="settings-button" type="button" onClick={() => setShowSettings(true)}>
          <span>⚙</span> Settings
        </button>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">COMMAND CENTER / {activeNav.toUpperCase()}</p>
            <h1>Your projects, <span>alive.</span></h1>
          </div>

          <div className="topbar-actions">
            <label className="search-box">
              <span>⌕</span>
              <input
                id="project-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search projects..."
                aria-label="Search projects"
              />
              <kbd>Ctrl K</kbd>
            </label>
            <button className="add-primary" type="button" onClick={openNewProject}>+ Add project</button>
          </div>
        </header>

        <section className="stats-strip" aria-label="Workspace statistics">
          <div><span>ACTIVE</span><strong>{projects.filter((p) => !p.archived).length.toString().padStart(2, '0')}</strong></div>
          <div><span>LIVE</span><strong>{liveCount.toString().padStart(2, '0')}</strong></div>
          <div><span>BUILDING</span><strong>{buildingCount.toString().padStart(2, '0')}</strong></div>
          <div><span>AVG. PROGRESS</span><strong>{averageProgress}%</strong></div>
        </section>

        <section className="hero-panel">
          <div className="hero-copy">
            <span className="hero-label">PROJECT UNIVERSE // {projects.filter((p) => !p.archived).length.toString().padStart(2, '0')} ACTIVE</span>
            <h2>Everything you’re building.<br /><em>One visual system.</em></h2>
            <p>Track, launch, organize and move between your apps without reducing them to a boring list. Your changes persist automatically in this browser.</p>
          </div>
          <div className="hero-orbit" aria-hidden="true">
            <span className="orbit orbit-one" />
            <span className="orbit orbit-two" />
            <span className="orbit-core">X</span>
            <span className="satellite sat-one" />
            <span className="satellite sat-two" />
            <span className="satellite sat-three" />
          </div>
        </section>

        <section className="controls-row">
          <div className="filter-group" aria-label="Project status filters">
            {statuses.map((item) => (
              <button
                key={item}
                type="button"
                className={status === item ? 'filter-chip active' : 'filter-chip'}
                onClick={() => setStatus(item)}
              >
                {item}
              </button>
            ))}
          </div>

          <div className="view-switcher" aria-label="View modes">
            {viewModes.map((mode) => (
              <button
                key={mode}
                type="button"
                className={viewMode === mode ? 'view-button active' : 'view-button'}
                onClick={() => setViewMode(mode)}
                title={`${mode} view`}
              >
                {mode}
              </button>
            ))}
          </div>
        </section>

        {activeNav === 'Activity' ? (
          <section className="activity-panel">
            <div className="section-heading">
              <div><p className="eyebrow">WORKSPACE PULSE</p><h3>Current build activity</h3></div>
              <span className="result-count">LOCAL SNAPSHOT</span>
            </div>
            <div className="activity-list">
              {activity.map((item, index) => (
                <button key={item.id} type="button" onClick={() => setSelectedId(item.id)}>
                  <span className="activity-number">{String(index + 1).padStart(2, '0')}</span>
                  <strong>{item.title}</strong>
                  <span>{item.detail}</span>
                  <b>↗</b>
                </button>
              ))}
            </div>
          </section>
        ) : (
          <>
            <section className="section-heading">
              <div>
                <p className="eyebrow">CURRENT VIEW / {viewMode.toUpperCase()}</p>
                <h3>{activeNav === 'Archive' ? 'Archived projects' : activeNav === 'Favorites' ? 'Favorite projects' : 'Project gallery'}</h3>
              </div>
              <span className="result-count">{visibleProjects.length.toString().padStart(2, '0')} PROJECTS</span>
            </section>

            <section className={`project-grid view-${viewMode.toLowerCase()}`}>
              {visibleProjects.map((project, index) => (
                <article className={`project-card accent-${project.accent}`} key={project.id}>
                  <div className="card-visual" onClick={() => setSelectedId(project.id)} role="button" tabIndex={0}>
                    <div className="visual-grid" />
                    <span className="project-index">{String(index + 1).padStart(2, '0')}</span>
                    <span className={`status-pill status-${project.status.toLowerCase()}`}>{project.status}</span>
                    <div className="monogram">{initials(project.name)}</div>
                    <div className="visual-x">X</div>
                  </div>

                  <div className="card-body">
                    <div className="project-title-row">
                      <div>
                        <p>{project.kicker}</p>
                        <h4>{project.name}</h4>
                      </div>
                      <div className="title-actions">
                        <button className={project.favorite ? 'icon-button favorite' : 'icon-button'} type="button" onClick={() => toggleFavorite(project.id)} aria-label="Toggle favorite">★</button>
                        <button className="icon-button" type="button" onClick={() => setSelectedId(project.id)} aria-label={`Open ${project.name}`}>↗</button>
                      </div>
                    </div>

                    <p className="project-description">{project.description}</p>
                    <div className="stack-row">{project.stack.map((tech) => <span key={tech}>{tech}</span>)}</div>
                    <div className="progress-block">
                      <div className="progress-meta"><span>Build progress</span><strong>{project.progress}%</strong></div>
                      <div className="progress-track"><span style={{ width: `${project.progress}%` }} /></div>
                    </div>
                    <div className="card-footer">
                      <span>Updated {project.updated}</span>
                      <div>
                        <button type="button" disabled={!project.repoUrl} onClick={() => safeOpen(project.repoUrl)}>Repo</button>
                        <button type="button" disabled={!project.liveUrl} onClick={() => safeOpen(project.liveUrl)}>Launch</button>
                        <button type="button" onClick={() => openEdit(project)}>Edit</button>
                      </div>
                    </div>
                  </div>
                </article>
              ))}

              {visibleProjects.length === 0 && (
                <div className="empty-state"><span>∅</span><strong>No projects found</strong><p>Change the filters or add something new.</p></div>
              )}

              {activeNav !== 'Archive' && (
                <button className="new-project-card" type="button" onClick={openNewProject}>
                  <span className="new-project-plus">+</span><strong>New project</strong><span>Connect a repo, URL, or start fresh</span>
                </button>
              )}
            </section>
          </>
        )}

        <footer className="workspace-footer">
          <span>project.X // local-first standalone build</span>
          <span>Cloud and xOS integration intentionally decoupled</span>
        </footer>
      </main>

      {selectedProject && (
        <div className="drawer-backdrop" onClick={() => setSelectedId(null)}>
          <aside className={`project-drawer accent-${selectedProject.accent}`} onClick={(event) => event.stopPropagation()}>
            <button className="drawer-close" type="button" onClick={() => setSelectedId(null)}>×</button>
            <div className="drawer-hero">
              <span>{selectedProject.status}</span>
              <div className="drawer-monogram">{initials(selectedProject.name)}</div>
              <p>{selectedProject.kicker}</p>
              <h2>{selectedProject.name}</h2>
            </div>
            <div className="drawer-content">
              <p className="drawer-description">{selectedProject.description || 'No description yet.'}</p>
              <div className="drawer-progress"><span>Progress</span><strong>{selectedProject.progress}%</strong><div><i style={{ width: `${selectedProject.progress}%` }} /></div></div>
              <div className="stack-row">{selectedProject.stack.map((tech) => <span key={tech}>{tech}</span>)}</div>
              <div className="drawer-section"><span>NOTES</span><p>{selectedProject.notes || 'No notes yet.'}</p></div>
              <div className="drawer-links">
                <button disabled={!selectedProject.repoUrl} onClick={() => safeOpen(selectedProject.repoUrl)} type="button">Open repository ↗</button>
                <button disabled={!selectedProject.liveUrl} onClick={() => safeOpen(selectedProject.liveUrl)} type="button">Open live app ↗</button>
              </div>
              <div className="drawer-actions">
                <button type="button" onClick={() => openEdit(selectedProject)}>Edit project</button>
                <button type="button" onClick={() => toggleFavorite(selectedProject.id)}>{selectedProject.favorite ? 'Remove favorite' : 'Favorite'}</button>
                <button type="button" onClick={() => toggleArchive(selectedProject.id)}>{selectedProject.archived ? 'Restore' : 'Archive'}</button>
                <button className="danger" type="button" onClick={() => deleteProject(selectedProject.id)}>Delete</button>
              </div>
            </div>
          </aside>
        </div>
      )}

      {showForm && (
        <div className="modal-backdrop" onClick={() => setShowForm(false)}>
          <form className="project-modal" onSubmit={saveProject} onClick={(event) => event.stopPropagation()}>
            <div className="modal-heading">
              <div><p className="eyebrow">PROJECT RECORD</p><h2>{editingId ? 'Edit project' : 'Add project'}</h2></div>
              <button type="button" onClick={() => setShowForm(false)}>×</button>
            </div>
            <div className="form-grid">
              <label><span>Name *</span><input required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="project.X" /></label>
              <label><span>Subtitle</span><input value={draft.kicker} onChange={(event) => setDraft({ ...draft, kicker: event.target.value })} placeholder="Visual app manager" /></label>
              <label className="wide"><span>Description</span><textarea rows={3} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
              <label><span>Status</span><select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as ProjectStatus })}>{statuses.filter((item) => item !== 'All').map((item) => <option key={item}>{item}</option>)}</select></label>
              <label><span>Accent</span><select value={draft.accent} onChange={(event) => setDraft({ ...draft, accent: event.target.value as Accent })}><option value="pink">Hot pink</option><option value="cyan">Cyan</option><option value="violet">Violet</option></select></label>
              <label><span>Progress ({draft.progress}%)</span><input type="range" min="0" max="100" value={draft.progress} onChange={(event) => setDraft({ ...draft, progress: Number(event.target.value) })} /></label>
              <label><span>Stack</span><input value={stackInput} onChange={(event) => setStackInput(event.target.value)} placeholder="React, Supabase, Vercel" /></label>
              <label className="wide"><span>Repository URL</span><input type="url" value={draft.repoUrl} onChange={(event) => setDraft({ ...draft, repoUrl: event.target.value })} placeholder="https://github.com/..." /></label>
              <label className="wide"><span>Live URL</span><input type="url" value={draft.liveUrl} onChange={(event) => setDraft({ ...draft, liveUrl: event.target.value })} placeholder="https://...vercel.app" /></label>
              <label className="wide"><span>Notes</span><textarea rows={4} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} placeholder="Decisions, blockers, next move..." /></label>
            </div>
            <div className="modal-actions"><button type="button" onClick={() => setShowForm(false)}>Cancel</button><button className="add-primary" type="submit">{editingId ? 'Save changes' : 'Create project'}</button></div>
          </form>
        </div>
      )}

      {showSettings && (
        <div className="modal-backdrop" onClick={() => setShowSettings(false)}>
          <div className="settings-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-heading"><div><p className="eyebrow">WORKSPACE</p><h2>Settings</h2></div><button type="button" onClick={() => setShowSettings(false)}>×</button></div>
            <div className="settings-grid">
              <button type="button" onClick={exportProjects}><strong>Export backup</strong><span>Download all project records as JSON.</span></button>
              <button type="button" onClick={resetWorkspace}><strong>Reset starter data</strong><span>Restore the built-in project set.</span></button>
              <div><strong>Storage</strong><span>Local browser storage. Cloud sync comes next.</span></div>
              <div><strong>xOS integration</strong><span>Deliberately disabled until project.X stands on its own.</span></div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
