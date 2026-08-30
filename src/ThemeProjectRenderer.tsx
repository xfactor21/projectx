import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import ComicProjectArt from './ComicProjectArt'

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

function playVendingRelease() {
  if (localStorage.getItem('projectx.theme.sound.v1') !== 'on') return
  const context = new AudioContext()
  const now = context.currentTime
  ;[[180, 0, .08], [390, .09, .1], [760, .2, .13]].forEach(([frequency, delay, duration]) => {
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = 'square'
    oscillator.frequency.value = frequency
    gain.gain.setValueAtTime(.0001, now + delay)
    gain.gain.exponentialRampToValueAtTime(.04, now + delay + .01)
    gain.gain.exponentialRampToValueAtTime(.0001, now + delay + duration)
    oscillator.connect(gain).connect(context.destination)
    oscillator.start(now + delay)
    oscillator.stop(now + delay + duration + .02)
  })
  window.setTimeout(() => void context.close(), 700)
}

function slotCode(index: number) {
  return `${String.fromCharCode(65 + Math.floor(index / 9))}${(index % 9) + 1}`
}

function VendingRenderer({ projects, sourceMap, desktopOnline, sourceLabel, onOpen, onRun }: Omit<Props, 'theme' | 'onAdd'>) {
  const [code, setCode] = useState('')
  const [dispensing, setDispensing] = useState('')
  const releaseTimer = useRef<number | null>(null)
  const rowKeys = useMemo(() => Array.from({ length: Math.ceil(projects.length / 9) }, (_, index) => String.fromCharCode(65 + index)), [projects.length])
  const selectionIndex = projects.findIndex((_, index) => slotCode(index) === code)
  const selected = selectionIndex >= 0 ? projects[selectionIndex] : undefined
  const selectedSource = selected ? sourceMap.get(selected.id) : undefined

  useEffect(() => () => { if (releaseTimer.current) window.clearTimeout(releaseTimer.current) }, [])

  function chooseKey(key: string) {
    setCode((current) => /[A-Z]/.test(key) ? key : `${current.match(/[A-Z]/)?.[0] || ''}${key}`)
  }

  function release() {
    if (!selected || !selectedSource?.path || !desktopOnline || dispensing) return
    setDispensing(selected.id)
    playVendingRelease()
    releaseTimer.current = window.setTimeout(() => {
      onRun(selected)
      setDispensing('')
    }, 1750)
  }

  return <section className={`vending-machine ${dispensing ? 'is-dispensing' : ''}`} aria-label="Project vending machine">
    <header><span>PROJECT.X BUILD DISPENSER</span><strong>SELECT PROJECT</strong><em>{projects.length} SLOTS ACTIVE</em></header>
    <div className="vending-body"><div className="vending-slots">{projects.map((project, index) => {
      const source = sourceMap.get(project.id)
      const projectCode = slotCode(index)
      const packageType = ['candy','chips','can','box'][index % 4]
      return <article className={`vending-slot ${code === projectCode ? 'selected' : ''} ${dispensing === project.id ? 'dispensing' : ''}`} key={project.id}>
        <span className="vending-coil" aria-hidden="true"/>
        <button type="button" className={`vending-product package-${packageType} project-art-surface ${project.coverUrl ? 'has-project-art' : ''}`} style={artStyle(project)} onClick={() => onOpen(project)} aria-label={`Open ${project.name}`}>
          <span className="vending-glass"/>{!project.coverUrl && <b>{monogram(project.name)}</b>}<strong>{project.name}</strong><small>{sourceLabel(project, source)}</small>
        </button>
        <button type="button" className="vending-dial" onClick={() => setCode(projectCode)} aria-label={`Enter code ${projectCode} for ${project.name}`}><i/><span>{projectCode}</span></button>
      </article>
    })}</div><aside className="vending-console">
      <div className="vending-screen"><span>ENTER SLOT CODE</span><strong>{code || '--'}</strong><small>{selected ? selected.name : 'Choose a letter and number'}</small></div>
      <div className="vending-keypad rows" aria-label="Vending row keys">{rowKeys.map((key) => <button type="button" className={code.startsWith(key) ? 'active' : ''} key={key} onClick={() => chooseKey(key)}>{key}</button>)}</div>
      <div className="vending-keypad digits" aria-label="Vending number keys">{['1','2','3','4','5','6','7','8','9'].map((key) => <button type="button" key={key} onClick={() => chooseKey(key)}>{key}</button>)}</div>
      <button type="button" className="vending-release" disabled={!selected || !selectedSource?.path || !desktopOnline || Boolean(dispensing)} onClick={release}>{dispensing ? 'RELEASING…' : selectedSource?.path && desktopOnline ? 'RELEASE + RUN' : 'LOCAL COPY REQUIRED'}</button>
    </aside></div>
    <div className={`vending-tray ${dispensing ? 'receiving' : ''}`}><span>{dispensing ? `${selected?.name || 'PROJECT'} DISPENSING` : 'BUILD OUTPUT / READY FOR PICKUP'}</span></div>
  </section>
}

export default function ThemeProjectRenderer({ theme, projects, sourceMap, desktopOnline, sourceLabel, onOpen, onRun, onAdd }: Props) {
  if (!projects.length) return empty(onAdd)

  if (theme === 'Storefront') return <section className="storefront-street" aria-label="Project storefront">
    <div className="storefront-skyline" aria-hidden="true" />
    <div className="storefront-row">{projects.map((project, index) => {
      const source = sourceMap.get(project.id)
      return <article className={`store-unit awning-${(index % 4) + 1} ${project.coverUrl ? 'has-project-art' : ''}`} key={project.id} style={{...artStyle(project),'--store-index':index} as CSSProperties}>
        <div className="store-awning"><span>{String(index + 1).padStart(2, '0')}</span><strong>{project.name}</strong></div>
        <button className="store-window project-art-surface" type="button" onClick={() => onOpen(project)}>
          <span className="store-neon">{sourceLabel(project, source)}</span>{!project.coverUrl && <b>{monogram(project.name)}</b>}<small>{project.description || 'Open project'}</small>
        </button>
        <div className="store-door"><span>{project.status || 'Building'}</span><button type="button" disabled={!source?.path || !desktopOnline} onClick={() => onRun(project)}>Enter / Run</button></div>
      </article>
    })}</div>
    <div className="storefront-sidewalk" aria-hidden="true"><span>PROJECT.X DISTRICT</span><i className="walker walker-one"/><i className="walker walker-two"/><i className="walker dog-walker"><b/></i></div>
  </section>

  if (theme === 'Vending') return <VendingRenderer projects={projects} sourceMap={sourceMap} desktopOnline={desktopOnline} sourceLabel={sourceLabel} onOpen={onOpen} onRun={onRun}/>

  if (theme === 'Comic') return <section className="comic-book" aria-label="Project comic shelf">
    <header><span>PROJECT.X PRESENTS</span><h2>THE BUILD UNIVERSE!</h2><b>ISSUE #{String(projects.length).padStart(2, '0')}</b></header>
    <div className="comic-shelf">{projects.map((project, index) => {
      const source = sourceMap.get(project.id)
      return <article className={`comic-volume volume-${(index % 4) + 1} ${project.coverUrl ? 'has-project-art' : ''}`} key={project.id}>
        <button type="button" className="comic-cover" onClick={() => onOpen(project)} aria-label={`Open ${project.name}`}>
          <span className="comic-cover-art">{project.coverUrl && <ComicProjectArt source={project.coverUrl} name={project.name}/>}</span><span className="comic-ink-screen"/>
          <small>{sourceLabel(project, source)}</small>{!project.coverUrl && <b>{monogram(project.name)}</b>}<h3>{project.name}</h3><em>{index % 2 ? 'ZAP!' : 'BUILD!'}</em><i>NO. {String(index + 1).padStart(2, '0')}</i>
        </button>
        <footer><span>{project.status || 'Building'}</span><button type="button" disabled={!source?.path || !desktopOnline} onClick={() => onRun(project)}>RUN</button></footer>
      </article>
    })}</div><div className="comic-shelf-edge" aria-hidden="true"><span>PROJECT.X COLLECTED BUILDS</span></div>
  </section>

  if (theme === '3D') return <section className="gallery-room" aria-label="Project gallery">
    <div className="gallery-ceiling" aria-hidden="true"/><div className="gallery-floor" aria-hidden="true"/>
    <div className="gallery-exhibits">{projects.map((project, index) => {
      const source = sourceMap.get(project.id)
      const depthStyle = { '--gallery-depth': `${index % 3}`, ...(artStyle(project) || {}) } as CSSProperties
      return <article className={`gallery-exhibit ${project.coverUrl ? 'has-project-art' : ''}`} key={project.id} style={depthStyle}>
        <div className="gallery-light"/><button type="button" className="gallery-frame project-art-surface" onClick={() => onOpen(project)}><span>{String(index + 1).padStart(2, '0')}</span>{!project.coverUrl && <b>{monogram(project.name)}</b>}</button>
        <div className="gallery-plaque"><strong>{project.name}</strong><span>{sourceLabel(project, source)}</span><small>{(project.stack || []).slice(0, 3).join(' · ') || project.status || 'Project'}</small><button type="button" disabled={!source?.path || !desktopOnline} onClick={() => onRun(project)}>Launch exhibit</button></div>
      </article>
    })}</div>
  </section>

  return <section className="command-project-grid" aria-label="Project command grid">{projects.map((project, index) => {
    const source = sourceMap.get(project.id)
    return <article className={`command-project ${project.coverUrl ? 'has-project-art' : ''}`} key={project.id} style={artStyle(project)}><button type="button" className="command-visual project-art-surface" onClick={() => onOpen(project)}><span>{String(index + 1).padStart(2, '0')}</span>{!project.coverUrl && <b>{monogram(project.name)}</b>}<small>{sourceLabel(project, source)}</small></button><div><h3>{project.name}</h3><p>{project.description || 'No description yet.'}</p><div className="command-meta"><span>{project.status || 'Building'}</span><span>{source?.gitBranch || 'NO BRANCH'}</span><span>{source?.path && desktopOnline ? 'LOCAL READY' : 'REMOTE'}</span></div><footer><button type="button" disabled={!source?.path || !desktopOnline} onClick={() => onRun(project)}>Run</button><button type="button" disabled={!project.repoUrl} onClick={() => project.repoUrl && window.open(project.repoUrl, '_blank', 'noopener')}>Repo</button><button type="button" onClick={() => onOpen(project)}>Open</button></footer></div></article>
  })}</section>
}
