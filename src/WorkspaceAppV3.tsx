import { useEffect, useMemo, useState } from 'react'
import ThemeProjectRenderer from './ThemeProjectRenderer'
import { getDesktopHost } from './services/desktop'

type ThemeMode = 'Grid' | 'Storefront' | 'Vending' | 'Comic' | '3D'
type NavMode = 'Projects' | 'Favorites' | 'Activity' | 'Archive'
type Project = { id:string; name:string; kicker?:string; description?:string; status?:string; stack?:string[]; updated?:string; progress?:number; favorite?:boolean; archived?:boolean; repoUrl?:string; liveUrl?:string; coverUrl?:string; github?:unknown }
type LocalSource = { projectId:string; kind?:'desktop'|'browser'|'managed'|'zip'|'generated'; path?:string; scripts?:string[]; hasGit?:boolean; gitBranch?:string }

const PROJECTS_KEY='projectx.projects.v1'
const LOCAL_KEY='projectx.local.sources.v1'
const VIEW_KEY='projectx.view.v1'
const themes:Array<{id:ThemeMode;label:string;sub:string}>=[
  {id:'Grid',label:'Command',sub:'Developer control room'},
  {id:'Storefront',label:'Storefront',sub:'Walkable project district'},
  {id:'Vending',label:'Vending',sub:'Build dispenser machine'},
  {id:'Comic',label:'Comic',sub:'Sequential project universe'},
  {id:'3D',label:'Gallery',sub:'Spatial project exhibit'},
]

function readArray<T>(key:string):T[]{try{const value=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(value)?value:[]}catch{return[]}}
function readTheme():ThemeMode{const saved=localStorage.getItem(VIEW_KEY) as ThemeMode|null;return saved&&themes.some((item)=>item.id===saved)?saved:'Grid'}
function sourceLabel(project:Project,source?:LocalSource){if(source?.kind==='managed')return'MANAGED WINDOWS';if(source?.kind==='zip')return'INITIALIZED ZIP';if(source?.kind==='generated')return'PROJECT.X CREATED';if(source?.kind==='desktop')return'LOCAL WINDOWS';if(source?.kind==='browser')return'LOCAL BROWSER';if(project.github||project.repoUrl?.includes('github.com'))return'GITHUB';return'CLOUD / RECORD'}
function openLauncher(){window.dispatchEvent(new CustomEvent('projectx:open-add-project'))}

export default function WorkspaceAppV3(){
  const desktop=getDesktopHost()
  const [projects,setProjects]=useState<Project[]>(()=>readArray(PROJECTS_KEY))
  const [sources,setSources]=useState<LocalSource[]>(()=>readArray(LOCAL_KEY))
  const [theme,setTheme]=useState<ThemeMode>(readTheme)
  const [nav,setNav]=useState<NavMode>('Projects')
  const [query,setQuery]=useState('')
  const [selected,setSelected]=useState<Project|null>(null)
  const [status,setStatus]=useState(desktop?'Windows host online':'Web workspace')

  useEffect(()=>{const refresh=()=>{setProjects(readArray(PROJECTS_KEY));setSources(readArray(LOCAL_KEY))};window.addEventListener('storage',refresh);window.addEventListener('projectx:projects-changed',refresh);return()=>{window.removeEventListener('storage',refresh);window.removeEventListener('projectx:projects-changed',refresh)}},[])
  useEffect(()=>localStorage.setItem(VIEW_KEY,theme),[theme])

  const sourceMap=useMemo(()=>new Map(sources.map((source)=>[source.projectId,source])),[sources])
  const active=useMemo(()=>projects.filter((project)=>!project.archived),[projects])
  const visible=useMemo(()=>projects.filter((project)=>{
    if(nav==='Favorites'&&!project.favorite)return false
    if(nav==='Archive'&&!project.archived)return false
    if(nav!=='Archive'&&project.archived)return false
    const text=`${project.name} ${project.kicker||''} ${project.description||''} ${(project.stack||[]).join(' ')}`.toLowerCase()
    return text.includes(query.trim().toLowerCase())
  }),[projects,nav,query])

  async function runProject(project:Project){
    const source=sourceMap.get(project.id)
    if(!desktop||!source?.path){setStatus('This project is not available on this Windows host.');return}
    const script=source.scripts?.includes('dev')?'dev':source.scripts?.includes('start')?'start':''
    if(!script){setStatus('No dev/start script is registered for this project.');return}
    try{
      const result=await desktop.runDevProject(source.path,script)
      setStatus(result.output)
      if(result.pid){window.dispatchEvent(new CustomEvent('projectx:run-started',{detail:{projectId:project.id,projectName:project.name,path:source.path,result}}))}
    }catch(error){setStatus(error instanceof Error?error.message:'Unable to start project.')}
  }

  function changeTheme(next:ThemeMode){setTheme(next);setStatus(`${themes.find((item)=>item.id===next)?.label} environment loaded`);window.dispatchEvent(new CustomEvent('projectx:theme-changed',{detail:next}))}

  const localCount=active.filter((project)=>sourceMap.has(project.id)).length
  const repoCount=active.filter((project)=>Boolean(project.repoUrl||project.github)).length
  const liveCount=active.filter((project)=>project.status==='Live').length

  return <div className={`px-shell workspace-v2 workspace-v3 theme-${theme.toLowerCase()}`}>
    <aside className="sidebar v2-sidebar"><button className="brand-lockup" type="button" onClick={()=>setNav('Projects')}><div className="brand-mark">X</div><div><div className="brand-name">project<span>.X</span></div><div className="brand-subtitle">PROJECT LIFECYCLE</div></div></button><nav className="primary-nav">{(['Projects','Favorites','Activity','Archive'] as NavMode[]).map((item)=><button key={item} type="button" className={nav===item?'nav-item active':'nav-item'} onClick={()=>setNav(item)}><span className="nav-dot"/><span>{item}</span></button>)}</nav><div className="v2-source-status"><small>WORKSPACE SOURCE</small><strong>{desktop?'Windows + Cloud':'Cloud / Web'}</strong><span>{localCount} local · {repoCount} repos</span></div><div className="sidebar-spacer"/><button className="v2-add-side" type="button" onClick={openLauncher}>+ Add / Import</button><div className="v2-host-state"><i className={desktop?'online':''}/><span>{desktop?'DESKTOP HOST ONLINE':'DESKTOP HOST OFFLINE'}</span></div></aside>

    <main className="workspace v2-workspace"><header className="topbar v2-topbar"><div><p className="eyebrow">{themes.find((item)=>item.id===theme)?.sub} / {nav}</p><h1>{nav==='Projects'?'Your project universe.':nav}</h1><p className="v2-status-line">{status}</p></div><div className="topbar-actions"><label className="search-box"><span>⌕</span><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Search projects…"/></label><button className="add-primary" type="button" onClick={openLauncher}>+ Add project</button></div></header>
      <section className="v2-theme-deck" aria-label="Workspace environments">{themes.map((item)=><button key={item.id} type="button" className={theme===item.id?'active':''} onClick={()=>changeTheme(item.id)}><strong>{item.label}</strong><span>{item.sub}</span></button>)}</section>
      <section className="stats-strip v2-stats"><div><span>PROJECTS</span><strong>{String(active.length).padStart(2,'0')}</strong></div><div><span>LOCAL</span><strong>{String(localCount).padStart(2,'0')}</strong></div><div><span>REPOS</span><strong>{String(repoCount).padStart(2,'0')}</strong></div><div><span>LIVE</span><strong>{String(liveCount).padStart(2,'0')}</strong></div></section>
      {nav==='Activity'?<section className="v2-activity"><div className="section-heading"><div><p className="eyebrow">RECENT STATE</p><h3>Workspace activity</h3></div></div>{active.length?active.map((project,index)=><button type="button" key={project.id} onClick={()=>setSelected(project)}><b>{String(index+1).padStart(2,'0')}</b><strong>{project.name}</strong><span>{sourceLabel(project,sourceMap.get(project.id))} · {project.updated||'Unknown update'}</span></button>):<p>No project activity yet.</p>}</section>:<><section className="section-heading v2-heading"><div><p className="eyebrow">ENVIRONMENT / {theme.toUpperCase()}</p><h3>{nav==='Archive'?'Archived projects':nav==='Favorites'?'Favorites':'Projects'}</h3></div><span className="result-count">{visible.length} SHOWN</span></section><ThemeProjectRenderer theme={theme} projects={visible} sourceMap={sourceMap} desktopOnline={Boolean(desktop)} sourceLabel={sourceLabel} onOpen={setSelected} onRun={(project)=>void runProject(project)} onAdd={openLauncher}/></>}
    </main>

    {selected&&<div className="v2-detail-backdrop" onMouseDown={()=>setSelected(null)}><aside className="v2-detail" onMouseDown={(event)=>event.stopPropagation()}><button className="v2-detail-close" type="button" onClick={()=>setSelected(null)}>×</button><small>{sourceLabel(selected,sourceMap.get(selected.id))}</small><h2>{selected.name}</h2><p>{selected.description||'No description yet.'}</p><div className="v2-detail-facts"><span>Status <b>{selected.status||'Building'}</b></span><span>Local <b>{sourceMap.get(selected.id)?.path?desktop?'Online':'PC offline':'No'}</b></span><span>Git <b>{sourceMap.get(selected.id)?.hasGit?'Detected':selected.repoUrl?'Remote':'None'}</b></span></div>{sourceMap.get(selected.id)?.path&&<code>{sourceMap.get(selected.id)?.path}</code>}<div className="v2-detail-actions"><button type="button" disabled={!desktop||!sourceMap.get(selected.id)?.path} onClick={()=>sourceMap.get(selected.id)?.path&&desktop?.openInExplorer(sourceMap.get(selected.id)!.path!)}>Explorer</button><button type="button" disabled={!desktop||!sourceMap.get(selected.id)?.path} onClick={()=>sourceMap.get(selected.id)?.path&&desktop?.openInTerminal(sourceMap.get(selected.id)!.path!)}>Terminal</button><button type="button" disabled={!desktop||!sourceMap.get(selected.id)?.path} onClick={()=>void runProject(selected)}>Run project</button></div></aside></div>}
  </div>
}
