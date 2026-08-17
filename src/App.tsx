import { useMemo, useState } from 'react'
import './App.css'

type ProjectStatus = 'Live' | 'Building' | 'Concept'

type Project = {
  name: string
  kicker: string
  description: string
  status: ProjectStatus
  stack: string[]
  accent: 'pink' | 'cyan' | 'violet'
  updated: string
  progress: number
}

const projects: Project[] = [
  {
    name: 'xOS',
    kicker: 'Developer operating system',
    description: 'A modular creative and development environment built to make tools, code, projects and AI feel like one living workspace.',
    status: 'Live',
    stack: ['React', 'Tauri', 'Supabase'],
    accent: 'cyan',
    updated: 'Today',
    progress: 82,
  },
  {
    name: 'Voice Studio X',
    kicker: 'AI voice creation suite',
    description: 'Voice cloning, transformation, text-to-speech and singing workflows in a creator-first studio.',
    status: 'Building',
    stack: ['TypeScript', 'Audio', 'AI'],
    accent: 'pink',
    updated: '2d ago',
    progress: 68,
  },
  {
    name: 'X IDE',
    kicker: 'Mobile development environment',
    description: 'A high-capability coding workspace designed around fast creation, testing and project mobility.',
    status: 'Building',
    stack: ['Android', 'Editor', 'Runtime'],
    accent: 'violet',
    updated: '4d ago',
    progress: 54,
  },
  {
    name: 'Solar Signal',
    kicker: 'Pattern intelligence system',
    description: 'An anomaly and pattern analysis framework for solar activity, events and evolving evidence.',
    status: 'Concept',
    stack: ['Data', 'Research', 'ML'],
    accent: 'cyan',
    updated: '1w ago',
    progress: 31,
  },
]

const navItems = ['Projects', 'Favorites', 'Activity', 'Archive']
const viewModes = ['Grid', 'Storefront', 'Vending', 'Comic', '3D']

function App() {
  const [activeNav, setActiveNav] = useState('Projects')
  const [viewMode, setViewMode] = useState('Grid')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'All' | ProjectStatus>('All')

  const filteredProjects = useMemo(() => {
    return projects.filter((project) => {
      const matchesQuery = `${project.name} ${project.kicker} ${project.description}`
        .toLowerCase()
        .includes(query.toLowerCase())
      const matchesStatus = status === 'All' || project.status === status
      return matchesQuery && matchesStatus
    })
  }, [query, status])

  return (
    <div className="px-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">X</div>
          <div>
            <div className="brand-name">project<span>.X</span></div>
            <div className="brand-subtitle">APP MANAGER</div>
          </div>
        </div>

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
              {item === 'Projects' && <span className="nav-count">04</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-spacer" />

        <div className="system-card">
          <div className="system-card-topline">
            <span className="pulse-dot" />
            SYSTEM ONLINE
          </div>
          <strong>4 projects tracked</strong>
          <span>Workspace sync ready</span>
        </div>

        <button className="settings-button" type="button">
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
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search projects..."
                aria-label="Search projects"
              />
              <kbd>⌘ K</kbd>
            </label>
            <button className="add-primary" type="button">+ Add project</button>
          </div>
        </header>

        <section className="hero-panel">
          <div className="hero-copy">
            <span className="hero-label">PROJECT UNIVERSE // 04 ACTIVE</span>
            <h2>Everything you’re building.<br /><em>One visual system.</em></h2>
            <p>Track, launch, organize and move between your apps without reducing them to a boring list.</p>
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
            {(['All', 'Live', 'Building', 'Concept'] as const).map((item) => (
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

        <section className="section-heading">
          <div>
            <p className="eyebrow">CURRENT VIEW / {viewMode.toUpperCase()}</p>
            <h3>Project gallery</h3>
          </div>
          <span className="result-count">{filteredProjects.length.toString().padStart(2, '0')} PROJECTS</span>
        </section>

        <section className="project-grid">
          {filteredProjects.map((project, index) => (
            <article className={`project-card accent-${project.accent}`} key={project.name}>
              <div className="card-visual">
                <div className="visual-grid" />
                <span className="project-index">0{index + 1}</span>
                <span className={`status-pill status-${project.status.toLowerCase()}`}>{project.status}</span>
                <div className="monogram">{project.name.includes(' ') ? project.name.split(' ').map((part) => part[0]).join('').slice(0, 2) : project.name.charAt(0)}</div>
                <div className="visual-x">X</div>
              </div>

              <div className="card-body">
                <div className="project-title-row">
                  <div>
                    <p>{project.kicker}</p>
                    <h4>{project.name}</h4>
                  </div>
                  <button className="icon-button" type="button" aria-label={`Open ${project.name}`}>↗</button>
                </div>

                <p className="project-description">{project.description}</p>

                <div className="stack-row">
                  {project.stack.map((tech) => <span key={tech}>{tech}</span>)}
                </div>

                <div className="progress-block">
                  <div className="progress-meta">
                    <span>Build progress</span>
                    <strong>{project.progress}%</strong>
                  </div>
                  <div className="progress-track"><span style={{ width: `${project.progress}%` }} /></div>
                </div>

                <div className="card-footer">
                  <span>Updated {project.updated}</span>
                  <div>
                    <button type="button">Repo</button>
                    <button type="button">Launch</button>
                  </div>
                </div>
              </div>
            </article>
          ))}

          <button className="new-project-card" type="button">
            <span className="new-project-plus">+</span>
            <strong>New project</strong>
            <span>Connect a repo, URL, or start fresh</span>
          </button>
        </section>

        <footer className="workspace-footer">
          <span>project.X // standalone build</span>
          <span>Designed to plug into xOS later — not yet coupled</span>
        </footer>
      </main>
    </div>
  )
}

export default App
