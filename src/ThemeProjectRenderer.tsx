import type { CSSProperties } from 'react'

type Project = {
  id: string
  name: string
  kicker?: string
  description?: string
  status?: string
  stack?: string[]
  accent?: string
  updated?: string
  repoUrl?: string
  coverUrl?: string
}

type LocalSource = {
  projectId: string
  path?: string
  gitBranch?: string
}

type Props = {
  theme: 'Grid' | 'Storefront' | 'Vending' | 'Comic' | '3D'
  projects: Project[]
  sourceMap: Map<string, LocalSource>
  desktopOnline: boolean
  sourceLabel(project: Project, source?: LocalSource): string
  onOpen(project: Project): void
  onRun(project: Project): void
  onAdd(): void
}

function monogram(name: string) {
  return name.split(/\s+/).filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'PX'
}

function artStyle(project: Project): CSSProperties | undefined {
  return project.coverUrl ? ({ '--project-art': `url("${project.coverUrl.replace(/"/g, '%22')}")` } as CSSProperties) : undefined
}

function empty(onAdd: () => void) {
  return <div className="theme-empty"><span>PROJECT.X / EMPTY</span><h2>No projects in this environment.</h2><p>Bring in a folder, ZIP, GitHub repository or new project.</p><button type="button" onClick={onAdd}>+ Add / Import Project</button></div>
}

export default function ThemeProjectRenderer({ theme, projects, sourceMap, desktopOnline, sourceLabel, onOpen, onRun, onAdd }: Props) {
  if (!projects.length) return empty(onAdd)

  if (theme === 'Storefront') return <section className="storefront-street" aria-label="Project storefront">
    <div className="storefront-skyline" aria-hidden="true" />
    <div className="storefront-row">{projects.map((project, index) => {
      const source = sourceMap.get(project.id)
      return <article className={`store-unit ${project.coverUrl ? 'has-project-art' : ''}`} key={project.id} style={artStyle(project)}>
        <div className="store-awning"><span>{String(index + 1).padStart(2, '0')}</span><strong>{project.name}</strong></div>
        <button className="store-window project-art-surface" type="button" onClick={() => onOpen(project)}>
          <span className="store-neon">{sourceLabel(project, source)}</span><b>{monogram(project.name)}</b><small>{project.description || 'Open project'}</small>
        </button>
        <div className="store-door"><span>{project.status || 'Building'}</span><button type="button" disabled={!source?.path || !desktopOnline} onClick={() => onRun(project)}>Enter / Run</button></div>
      </article>
    })}</div>
    <div className="storefront-sidewalk" aria-hidden="true"><span>PROJECT.X DISTRICT</span><i/><i/><i/></div>
  </section>

  if (theme === 'Vending') return <section className="vending-machine" aria-label="Project vending machine">
    <header><span>PROJECT.X BUILD DISPENSER</span><strong>SELECT PROJECT</strong><em>{projects.length} SLOTS ACTIVE</em></header>
    <div className="vending-body"><div className="vending-slots">{projects.map((project, index) => {
      const source = sourceMap.get(project.id)
      return <button type="button" className={`vending-slot project-art-surface ${project.coverUrl ? 'has-project-art' : ''}`} style={artStyle(project)} key={project.id} onClick={() => onOpen(project)}>
        <span className="slot-code">{String.fromCharCode(65 + Math.floor(index / 9))}{(index % 9) + 1}</span>
        <b>{monogram(project.name)}</b><strong>{project.name}</strong><small>{sourceLabel(project, source)}</small><i className={source?.path && desktopOnline ? 'ready' : ''}>{source?.path && desktopOnline ? 'READY' : 'REMOTE'}</i>
      </button>
    })}</div><aside className="vending-console"><div className="vending-screen">CHOOSE A SLOT<br/><span>RUN DISPENSES THE LOCAL BUILD</span></div><div className="vending-keypad">{['A','B','C','1','2','3','4','5','6'].map((key) => <span key={key}>{key}</span>)}</div><button type="button" onClick={() => projects[0] && onRun(projects[0])}>DISPENSE ACTIVE</button></aside></div>
    <div className="vending-tray">BUILD OUTPUT / READY FOR PICKUP</div>
  </section>

  if (theme === 'Comic') return <section className="comic-book" aria-label="Project comic book">
    <header><span>PROJECT.X PRESENTS</span><h2>THE BUILD UNIVERSE!</h2><b>ISSUE #{String(projects.length).padStart(2, '0')}</b></header>
    <div className="comic-pages">{projects.map((project, index) => {
      const source = sourceMap.get(project.id)
      return <article className={`comic-panel panel-${(index % 4) + 1} ${project.coverUrl ? 'has-project-art' : ''}`} key={project.id} style={artStyle(project)}>
        <div className="comic-caption">{sourceLabel(project, source)} · {project.status || 'Building'}</div>
        <button type="button" className="project-art-surface" onClick={() => onOpen(project)}><b>{monogram(project.name)}</b><h3>{project.name}</h3><p>{project.description || 'A mysterious build waits inside…'}</p></button>
        <div className="comic-sfx">{index % 2 ? 'ZAP!' : 'BUILD!'}</div>
        <footer><span>{project.updated || 'NOW'}</span><button type="button" disabled={!source?.path || !desktopOnline} onClick={() => onRun(project)}>RUN →</button></footer>
      </article>
    })}</div>
  </section>

  if (theme === '3D') return <section className="gallery-room" aria-label="Project gallery">
    <div className="gallery-ceiling" aria-hidden="true"/><div className="gallery-floor" aria-hidden="true"/>
    <div className="gallery-exhibits">{projects.map((project, index) => {
      const source = sourceMap.get(project.id)
      const depthStyle = { '--gallery-depth': `${index % 3}`, ...(artStyle(project) || {}) } as CSSProperties
      return <article className={`gallery-exhibit ${project.coverUrl ? 'has-project-art' : ''}`} key={project.id} style={depthStyle}>
        <div className="gallery-light"/><button type="button" className="gallery-frame project-art-surface" onClick={() => onOpen(project)}><span>{String(index + 1).padStart(2, '0')}</span><b>{monogram(project.name)}</b></button>
        <div className="gallery-plaque"><strong>{project.name}</strong><span>{sourceLabel(project, source)}</span><small>{(project.stack || []).slice(0, 3).join(' · ') || project.status || 'Project'}</small><button type="button" disabled={!source?.path || !desktopOnline} onClick={() => onRun(project)}>Launch exhibit</button></div>
      </article>
    })}</div>
  </section>

  return <section className="command-project-grid" aria-label="Project command grid">{projects.map((project, index) => {
    const source = sourceMap.get(project.id)
    return <article className={`command-project ${project.coverUrl ? 'has-project-art' : ''}`} key={project.id} style={artStyle(project)}><button type="button" className="command-visual project-art-surface" onClick={() => onOpen(project)}><span>{String(index + 1).padStart(2, '0')}</span><b>{monogram(project.name)}</b><small>{sourceLabel(project, source)}</small></button><div><h3>{project.name}</h3><p>{project.description || 'No description yet.'}</p><div className="command-meta"><span>{project.status || 'Building'}</span><span>{source?.gitBranch || 'NO BRANCH'}</span><span>{source?.path && desktopOnline ? 'LOCAL READY' : 'REMOTE'}</span></div><footer><button type="button" disabled={!source?.path || !desktopOnline} onClick={() => onRun(project)}>Run</button><button type="button" disabled={!project.repoUrl} onClick={() => project.repoUrl && window.open(project.repoUrl, '_blank', 'noopener')}>Repo</button><button type="button" onClick={() => onOpen(project)}>Open</button></footer></div></article>
  })}</section>
}
