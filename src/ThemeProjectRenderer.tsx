import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import ComicProjectArt from './ComicProjectArt'
import ProjectStatusBar from './ProjectStatusBar'
import { healthFor, type ProjectHealth } from './services/projectHealth'

type Project = {
  id: string
  name: string
  kicker?: string
  detectedVersion?: string
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
  hasGit?: boolean
  gitBranch?: string
}

type Props = {
  theme: 'Grid' | 'Storefront' | 'Vending' | 'Comic' | '3D' | 'XFactor' | 'PlanetX'
  projects: Project[]
  sourceMap: Map<string, LocalSource>
  desktopOnline: boolean
  sourceLabel(project: Project, source?: LocalSource): string
  onOpen(project: Project): void
  onRun(project: Project): void
  onDeployment(project: Project): void
  onAdd(): void
  healthMap: Record<string, ProjectHealth>
}

type WorldHeaderProps = {
  eyebrow: string
  title: string
  description: string
  count: number
  detail: string
  marker: string
}

function monogram(name: string) {
  return name.split(/\s+/).filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'PX'
}

function artStyle(project: Project): CSSProperties | undefined {
  return project.coverUrl ? ({ '--project-art': `url("${project.coverUrl.replace(/"/g, '%22')}")` } as CSSProperties) : undefined
}

function WorldHeader({ eyebrow, title, description, count, detail, marker }: WorldHeaderProps) {
  return <header className="theme-world-header">
    <div className="theme-world-marker" aria-hidden="true">{marker}</div>
    <div className="theme-world-heading"><span>{eyebrow}</span><h2>{title}</h2><p>{description}</p></div>
    <div className="theme-world-readout"><span>ACTIVE COLLECTION</span><strong>{String(count).padStart(2, '0')}</strong><small>{detail}</small></div>
  </header>
}

function ProjectActions({ project, source, desktopOnline, onOpen, onRun, onDeployment, runLabel = 'Run project' }: {
  project: Project
  source?: LocalSource
  desktopOnline: boolean
  onOpen(project: Project): void
  onRun(project: Project): void
  onDeployment(project: Project): void
  runLabel?: string
}) {
  return <div className="theme-project-actions">
    <button type="button" className="primary" disabled={!source?.path || !desktopOnline} onClick={() => onRun(project)}>{runLabel}</button>
    <button type="button" onClick={() => onOpen(project)}>Open details</button>
    <button type="button" onClick={() => onDeployment(project)}>Deploy</button>
  </div>
}

function ProjectIdentity({ project, sourceText, index }: { project: Project; sourceText: string; index: number }) {
  return <div className="theme-project-identity">
    <span>{String(index + 1).padStart(2, '0')} · {sourceText}</span>
    <strong>{project.name}</strong>
    <p>{project.description || 'A project waiting for its next build note.'}</p>
    <div>{project.detectedVersion && <b>v{project.detectedVersion}</b>}{(project.stack || []).slice(0, 3).map((item) => <b key={item}>{item}</b>)}</div>
  </div>
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

function VendingRenderer({ projects, sourceMap, desktopOnline, sourceLabel, onOpen, onRun, onDeployment, healthMap }: Omit<Props, 'theme' | 'onAdd'>) {
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

  return <section className={`theme-world vending-machine ${dispensing ? 'is-dispensing' : ''}`} aria-label="Project vending machine">
    <WorldHeader eyebrow="AUTOMATED BUILD MARKET" title="Build Dispenser" description="Choose a project package, inspect its source, then release it directly into the local runtime." count={projects.length} detail="MACHINE READY" marker="V" />
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
        <ProjectStatusBar name={project.name} repoUrl={project.repoUrl} source={source} health={healthFor(project.id, healthMap)} onOpen={() => onOpen(project)} onDeployment={() => onDeployment(project)}/>
      </article>
    })}</div><aside className="vending-console">
      <div className="vending-screen"><span>ENTER SLOT CODE</span><strong>{code || '--'}</strong><small>{selected ? selected.name : 'Choose a letter and number'}</small>{selected && <i>{selected.detectedVersion ? `BUILD ${selected.detectedVersion}` : 'VERSION UNREAD'} · {sourceLabel(selected, selectedSource)}</i>}</div>
      <div className="vending-keypad rows" aria-label="Vending row keys">{rowKeys.map((key) => <button type="button" className={code.startsWith(key) ? 'active' : ''} key={key} onClick={() => chooseKey(key)}>{key}</button>)}</div>
      <div className="vending-keypad digits" aria-label="Vending number keys">{['1','2','3','4','5','6','7','8','9'].map((key) => <button type="button" key={key} onClick={() => chooseKey(key)}>{key}</button>)}</div>
      <button type="button" className="vending-release" disabled={!selected || !selectedSource?.path || !desktopOnline || Boolean(dispensing)} onClick={release}>{dispensing ? 'RELEASING…' : selectedSource?.path && desktopOnline ? 'DISPENSE + RUN' : 'LOCAL COPY REQUIRED'}</button>
      {selected && <button type="button" className="vending-open" onClick={() => onOpen(selected)}>Inspect selected package</button>}
    </aside></div>
    <div className={`vending-tray ${dispensing ? 'receiving' : ''}`}><span>{dispensing ? `${selected?.name || 'PROJECT'} DISPENSING` : 'BUILD OUTPUT / READY FOR PICKUP'}</span></div>
  </section>
}

export default function ThemeProjectRenderer({ theme, projects, sourceMap, desktopOnline, sourceLabel, onOpen, onRun, onDeployment, onAdd, healthMap }: Props) {
  const [coverAspects,setCoverAspects] = useState<Record<string,'portrait'|'square'|'landscape'>>({})
  const rememberAspect = (id:string,width:number,height:number) => {
    if(!width||!height)return
    const aspect=width/height<.85?'portrait':width/height>1.25?'landscape':'square'
    setCoverAspects(previous=>previous[id]===aspect?previous:{...previous,[id]:aspect})
  }
  if (!projects.length) return empty(onAdd)

  if (theme === 'Storefront') return <section className="theme-world storefront-street" aria-label="Project storefront">
    <div className="storefront-skyline" aria-hidden="true"><i/><i/><i/><i/></div>
    <div className="storefront-atmosphere" aria-hidden="true"/>
    <WorldHeader eyebrow="PROJECT.X DISTRICT" title="Independent Build Studios" description="Every project has its own address, illuminated window and direct route into the local runtime." count={projects.length} detail="NIGHT DISTRICT · OPEN" marker="⌂" />
    <div className="storefront-row">{projects.map((project, index) => {
      const source = sourceMap.get(project.id)
      return <article className={`store-unit awning-${(index % 4) + 1} ${project.coverUrl ? 'has-project-art' : ''}`} key={project.id} style={{...artStyle(project),'--store-index':index} as CSSProperties}>
        <div className="store-roof-trim"><i/><span>PROJECT.X · {String(index + 1).padStart(2, '0')}</span><i/></div>
        <div className="store-awning"><span>{String(index + 1).padStart(2, '0')}</span><strong>{project.name}</strong></div>
        <button className="store-window project-art-surface" type="button" onClick={() => onOpen(project)}>
          <span className="store-neon">{sourceLabel(project, source)}</span><span className="store-window-frame" aria-hidden="true"/>{!project.coverUrl && <b>{monogram(project.name)}</b>}<span className="store-window-copy"><strong>{project.name}</strong><small>{project.description || 'Open project studio'}</small></span>
        </button>
        <div className="store-door"><span>{project.detectedVersion ? `BUILD ${project.detectedVersion}` : 'BUILD STUDIO'}</span><button type="button" disabled={!source?.path || !desktopOnline} onClick={() => onRun(project)}>Enter + Run</button></div>
        <ProjectStatusBar name={project.name} repoUrl={project.repoUrl} source={source} health={healthFor(project.id, healthMap)} onOpen={() => onOpen(project)} onDeployment={() => onDeployment(project)}/>
      </article>
    })}</div>
    <div className="storefront-sidewalk" aria-hidden="true"><i/><span>PROJECT.X DISTRICT · INDEPENDENT BUILD STUDIOS</span><i/></div>
    <div className="storefront-road" aria-hidden="true"><span className="road-line line-one"/><span className="road-line line-two"/><div className="district-car car-cyan"><b/><i/><i/></div><div className="district-car car-pink"><b/><i/><i/></div><div className="district-pedestrian walker-one"><i/><b/></div><div className="district-pedestrian walker-two"><i/><b/></div><div className="district-pedestrian walker-three"><i/><b/></div></div>
  </section>

  if (theme === 'Vending') return <VendingRenderer projects={projects} sourceMap={sourceMap} desktopOnline={desktopOnline} sourceLabel={sourceLabel} onOpen={onOpen} onRun={onRun} onDeployment={onDeployment} healthMap={healthMap}/>

  if (theme === 'Comic') return <section className="theme-world comic-book" aria-label="Project comic collection">
    <WorldHeader eyebrow="PROJECT.X PRESENTS" title="The Build Universe" description="A collected edition where every project is a readable panel—not a novelty card hiding essential actions." count={projects.length} detail="DELUXE DIGITAL ISSUE" marker="✦" />
    <div className="comic-spread">{projects.map((project, index) => {
      const source = sourceMap.get(project.id)
      return <article className={`comic-volume comic-panel-${(index % 6) + 1} volume-${(index % 4) + 1} ${project.coverUrl ? 'has-project-art' : ''}`} key={project.id}>
        <div className="comic-panel-label">PANEL {String(index + 1).padStart(2, '0')} · {sourceLabel(project, source)}</div>
        <button type="button" className="comic-cover" onClick={() => onOpen(project)} aria-label={`Open ${project.name}`}>
          <span className="comic-cover-art">{project.coverUrl && <ComicProjectArt source={project.coverUrl} name={project.name}/>}</span><span className="comic-ink-screen"/>
          {!project.coverUrl && <b>{monogram(project.name)}</b>}<h3>{project.name}</h3><p>{project.description || 'The next chapter starts here.'}</p><em>{index % 3 === 0 ? 'BUILD!' : index % 3 === 1 ? 'SHIP!' : 'RUN!'}</em><i>NO. {String(index + 1).padStart(2, '0')}</i>
        </button>
        <ProjectActions project={project} source={source} desktopOnline={desktopOnline} onOpen={onOpen} onRun={onRun} onDeployment={onDeployment} runLabel="Run chapter" />
        <ProjectStatusBar name={project.name} repoUrl={project.repoUrl} source={source} health={healthFor(project.id, healthMap)} onOpen={() => onOpen(project)} onDeployment={() => onDeployment(project)}/>
      </article>
    })}</div><div className="comic-shelf-edge" aria-hidden="true"><span>PROJECT.X · COLLECTED BUILDS · PLANET.X PRESS</span></div>
  </section>

  if (theme === '3D') return <section className="theme-world gallery-room" aria-label="Project gallery">
    <div className="gallery-ceiling" aria-hidden="true"/><div className="gallery-floor" aria-hidden="true"/>
    <WorldHeader eyebrow="PROJECT.X DIGITAL EXHIBITION" title="The Spatial Gallery" description="A calm, navigable exhibition with framed project artwork, museum-scale labels and dependable launch controls." count={projects.length} detail="ROOM 05 · OPEN" marker="◇" />
    <div className="gallery-exhibits">{projects.map((project, index) => {
      const source = sourceMap.get(project.id)
      const depthStyle = { '--gallery-depth': `${index % 3}`, ...(artStyle(project) || {}) } as CSSProperties
      return <article className={`gallery-exhibit ${project.coverUrl ? 'has-project-art' : ''}`} key={project.id} style={depthStyle}>
        <div className="gallery-light"/><button type="button" className="gallery-frame project-art-surface" onClick={() => onOpen(project)}><span>{String(index + 1).padStart(2, '0')}</span>{!project.coverUrl && <b>{monogram(project.name)}</b>}</button>
        <div className="gallery-plaque"><span>EXHIBIT {String(index + 1).padStart(2, '0')}</span><strong>{project.name}</strong><small>{sourceLabel(project, source)} · {(project.stack || []).slice(0, 2).join(' · ') || 'Project'}</small><ProjectActions project={project} source={source} desktopOnline={desktopOnline} onOpen={onOpen} onRun={onRun} onDeployment={onDeployment} runLabel="Launch" /></div>
        <ProjectStatusBar name={project.name} repoUrl={project.repoUrl} source={source} health={healthFor(project.id, healthMap)} onOpen={() => onOpen(project)} onDeployment={() => onDeployment(project)}/>
      </article>
    })}</div>
  </section>

  if (theme === 'XFactor') return <section className="theme-world xfactor-district" aria-label="Neon project district">
    <div className="xfactor-streetline" aria-hidden="true"/>
    <WorldHeader eyebrow="xFACTOR // AFTER DARK" title="X District" description="High-energy project signals, readable control decks and neon billboards tuned to the planet.X spectrum." count={projects.length} detail="SIGNAL GRID · LIVE" marker="X" />
    <div className="xfactor-projects">{projects.map((project,index)=>{
      const source=sourceMap.get(project.id)
      const health=healthFor(project.id,healthMap)
      return <article key={project.id} className={`xfactor-project xfactor-${index%3} ${project.coverUrl?'has-project-art':''}`} style={artStyle(project)}>
        <button type="button" className="xfactor-billboard project-art-surface" onClick={()=>onOpen(project)}><span>XF-{String(index+1).padStart(2,'0')}</span>{!project.coverUrl&&<b>{monogram(project.name)}</b>}<strong>{project.name}</strong><small>{sourceLabel(project,source)}</small></button>
        <div className="xfactor-console"><ProjectIdentity project={project} sourceText={sourceLabel(project,source)} index={index}/><ProjectActions project={project} source={source} desktopOnline={desktopOnline} onOpen={onOpen} onRun={onRun} onDeployment={onDeployment} runLabel="Run signal" /></div>
        <ProjectStatusBar name={project.name} repoUrl={project.repoUrl} source={source} health={health} onOpen={()=>onOpen(project)} onDeployment={()=>onDeployment(project)}/>
      </article>
    })}</div>
  </section>

  if (theme === 'PlanetX') return <section className="theme-world planetx-command" aria-label="Orbital project command">
    <WorldHeader eyebrow="PLANET.X ORBITAL SYSTEM" title="Project Universe" description="A flagship command space mapping each project as a live orbital system around the planet.X core." count={projects.length} detail="ORBITAL NETWORK · NOMINAL" marker="◎" />
    <div className="planetx-core" aria-hidden="true"><span>planet.X</span><i/><b>COMMAND</b><small>{projects.length} SYSTEMS</small></div>
    <div className="planetx-projects">{projects.map((project,index)=>{
      const source=sourceMap.get(project.id)
      const health=healthFor(project.id,healthMap)
      return <article key={project.id} className={`planetx-node planetx-node-${index%6}`} style={{'--planetx-index':index,...(artStyle(project)||{})} as CSSProperties}>
        <button type="button" className={`planetx-planet project-art-surface ${project.coverUrl?'has-project-art':''}`} onClick={()=>onOpen(project)}>{!project.coverUrl&&<b>{monogram(project.name)}</b>}<span>{String(index+1).padStart(2,'0')}</span></button>
        <div className="planetx-label"><span>ORBIT {String(index+1).padStart(2,'0')}</span><strong>{project.name}</strong><small>{sourceLabel(project,source)}</small><ProjectActions project={project} source={source} desktopOnline={desktopOnline} onOpen={onOpen} onRun={onRun} onDeployment={onDeployment} runLabel="Run" /></div>
        <ProjectStatusBar name={project.name} repoUrl={project.repoUrl} source={source} health={health} onOpen={()=>onOpen(project)} onDeployment={()=>onDeployment(project)}/>
      </article>
    })}</div>
  </section>

  return <section className="theme-world command-world" aria-label="Project command grid"><WorldHeader eyebrow="PROJECT.X COMMAND" title="Project Operations" description="A focused operational view for scanning build identity, artwork and the next useful action without visual noise." count={projects.length} detail="COMMAND · STABLE" marker="X" /><div className="command-project-grid">{projects.map((project, index) => {
    const source = sourceMap.get(project.id)
    return <article className={`command-project command-project-v304 aspect-${coverAspects[project.id]||'square'} ${project.coverUrl ? 'has-project-art' : ''}`} key={project.id} style={artStyle(project)} onClick={()=>onOpen(project)}><button type="button" className="command-visual project-art-surface" aria-label={`View ${project.name} details`} onClick={(event)=>{event.stopPropagation();onOpen(project)}}><span className="command-index">{String(index+1).padStart(2,'0')}</span>{project.coverUrl?<img className="command-cover-image" src={project.coverUrl} alt="" onLoad={event=>rememberAspect(project.id,event.currentTarget.naturalWidth,event.currentTarget.naturalHeight)}/>:<b>{monogram(project.name)}</b>}</button><div className="command-console"><header><span>{project.detectedVersion ? 'BUILD v' + project.detectedVersion : 'BUILD NOT DETECTED'}</span><small>{sourceLabel(project,source)}</small></header><h3>{project.name}</h3><p>{project.description || 'Add a description in project details.'}</p><footer><button type="button" disabled={!source?.path || !desktopOnline} onClick={(event)=>{event.stopPropagation();onRun(project)}}>▶ Run</button><button type="button" onClick={(event)=>{event.stopPropagation();window.dispatchEvent(new CustomEvent('projectx:card-git',{detail:{projectId:project.id}}))}}>⑂ Git</button><button type="button" onClick={(event)=>{event.stopPropagation();window.dispatchEvent(new CustomEvent('projectx:card-files',{detail:{projectId:project.id}}))}}>▤ Files</button><button type="button" onClick={(event)=>{event.stopPropagation();window.dispatchEvent(new CustomEvent('projectx:card-workbook',{detail:{projectId:project.id}}))}}>▣ Workbook</button></footer></div></article>
  })}</div></section>
}
