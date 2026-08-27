import { useEffect, useMemo, useState } from 'react'
import ThemeProjectRenderer from './ThemeProjectRenderer'
import { getDesktopHost } from './services/desktop'
import { APP_VERSION } from './version'
import { deleteProjectAndLocalSource, readLocalSources, readProjects } from './services/projectStorage'
import { readSettings } from './services/settings'
import appIcon from './assets/brand/app-icon.png'
import workspaceHeader from './assets/brand/workspace-header-transparent.png'
import { recordRunTask } from './services/runTasks'
import { isSupabaseConfigured, loadSession } from './services/supabase'

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

function readArray<T>(key:string):T[]{return key===PROJECTS_KEY?readProjects() as T[]:key===LOCAL_KEY?readLocalSources() as T[]:[]}
function readTheme():ThemeMode{const saved=localStorage.getItem(VIEW_KEY) as ThemeMode|null;return saved&&themes.some((item)=>item.id===saved)?saved:'Grid'}
function sourceLabel(project:Project,source?:LocalSource){if(source?.kind==='managed')return'MANAGED LOCAL';if(source?.kind==='zip')return'INITIALIZED LOCAL';if(source?.kind==='generated')return'PROJECT.X CREATED';if(source?.kind==='desktop')return'LOCAL PROJECT';if(source?.kind==='browser')return'LOCAL BROWSER';if(project.github||project.repoUrl?.includes('github.com'))return'GITHUB REMOTE';return'CLOUD / RECORD'}
function openLauncher(){window.dispatchEvent(new CustomEvent('projectx:open-add-project'))}
function preferredRunScript(scripts:string[]=[]){return ['dev','web','start','serve'].find((script)=>scripts.includes(script))||''}

export default function WorkspaceAppV3(){
  const desktop=getDesktopHost()
  const [projects,setProjects]=useState<Project[]>(()=>readArray(PROJECTS_KEY))
  const [sources,setSources]=useState<LocalSource[]>(()=>readArray(LOCAL_KEY))
  const [theme,setTheme]=useState<ThemeMode>(readTheme)
  const [nav,setNav]=useState<NavMode>('Projects')
  const [query,setQuery]=useState('')
  const [selected,setSelected]=useState<Project|null>(null)
  const [status,setStatus]=useState(desktop?'Local development host online':'Web workspace')
  const [cloudState,setCloudState]=useState(()=>({configured:isSupabaseConfigured(),session:loadSession()}))

  useEffect(()=>{const refresh=()=>{setProjects(readArray(PROJECTS_KEY));setSources(readArray(LOCAL_KEY))};window.addEventListener('storage',refresh);window.addEventListener('projectx:projects-changed',refresh);return()=>{window.removeEventListener('storage',refresh);window.removeEventListener('projectx:projects-changed',refresh)}},[])
  useEffect(()=>localStorage.setItem(VIEW_KEY,theme),[theme])
  useEffect(()=>{const refresh=()=>setCloudState({configured:isSupabaseConfigured(),session:loadSession()});window.addEventListener('projectx:supabase-config-changed',refresh);window.addEventListener('projectx:supabase-session-changed',refresh);return()=>{window.removeEventListener('projectx:supabase-config-changed',refresh);window.removeEventListener('projectx:supabase-session-changed',refresh)}},[])

  const sourceMap=useMemo(()=>new Map(sources.map((source)=>[source.projectId,source])),[sources])
  const active=useMemo(()=>projects.filter((project)=>!project.archived),[projects])
  const visible=useMemo(()=>projects.filter((project)=>{
    if(nav==='Favorites'&&!project.favorite)return false
    if(nav==='Archive'&&!project.archived)return false
    if(nav!=='Archive'&&project.archived)return false
    const text=`${project.name} ${project.kicker||''} ${project.description||''} ${(project.stack||[]).join(' ')}`.toLowerCase()
    return text.includes(query.trim().toLowerCase())
  }),[projects,nav,query])

  function markLive(projectId:string){
    const next=readArray<Project>(PROJECTS_KEY).map((project)=>project.id===projectId?{...project,status:'Live',updated:'Running now'}:project)
    localStorage.setItem(PROJECTS_KEY,JSON.stringify(next));setProjects(next);window.dispatchEvent(new CustomEvent('projectx:projects-changed'))
    setSelected((current)=>current?.id===projectId?{...current,status:'Live',updated:'Running now'}:current)
  }

  async function runProject(project:Project){
    const source=sourceMap.get(project.id)
    if(!desktop){setStatus('The local development host is unavailable. Open the project.X desktop app to run local servers.');return}
    if(!source?.path){setStatus(`${project.name} is a remote/cloud record only. Download, import, or link a local copy before running it.`);return}
    const script=preferredRunScript(source.scripts)
    if(!script){setStatus(`${project.name} has no supported dev/web/start/serve script in package.json.`);return}
    setStatus(`Starting ${project.name} with ${script}… project.X will install missing dependencies automatically.`)
    try{
      const result=await desktop.runDevProject(source.path,script)
      if(!result.ok||!result.pid)throw new Error(result.output||`Unable to start ${project.name}.`)
      setStatus(result.output)
      if(result.ok&&result.pid){markLive(project.id);recordRunTask({projectId:project.id,projectName:project.name,path:source.path,result});if(readSettings().autoOpenPreview&&result.url)await desktop.openPreviewWindow(project.id,project.name,result.url)}
    }catch(error){setStatus(error instanceof Error?error.message:'Unable to start project.')}
  }

  function changeTheme(next:ThemeMode){setTheme(next);setStatus(`${themes.find((item)=>item.id===next)?.label} environment loaded`);window.dispatchEvent(new CustomEvent('projectx:theme-changed',{detail:next}))}

  function deleteProject(project:Project){
    if(!window.confirm(`Delete ${project.name} from project.X? Local files will remain on disk.`))return
    deleteProjectAndLocalSource(project.id);setSelected(null);setStatus(`${project.name} was removed from project.X. Local files were not deleted.`)
  }

  const localCount=active.filter((project)=>sourceMap.has(project.id)).length
  const repoCount=active.filter((project)=>Boolean(project.repoUrl||project.github)).length
  const liveCount=active.filter((project)=>project.status==='Live').length

  return <div className={`px-shell workspace-v2 workspace-v3 theme-${theme.toLowerCase()}`}>
    <aside className="sidebar v2-sidebar"><button className="brand-lockup" type="button" onClick={()=>setNav('Projects')}><img className="brand-mark" src={appIcon} alt=""/><div><div className="brand-name">project<span>.X</span> <small className="brand-version">v{APP_VERSION}</small></div><div className="brand-subtitle">PROJECT LIFECYCLE</div></div></button><nav className="primary-nav">{(['Projects','Favorites','Activity','Archive'] as NavMode[]).map((item)=><button key={item} type="button" className={nav===item?'nav-item active':'nav-item'} onClick={()=>setNav(item)}><span className="nav-dot"/><span>{item}</span></button>)}</nav><div className="v2-source-status"><small>WORKSPACE SOURCE</small><strong>{desktop?'Local + Cloud':'Cloud / Web'}</strong><span>{localCount} local · {repoCount} repos</span></div><button className={`v2-cloud-entry ${cloudState.session?'connected':cloudState.configured?'ready':'offline'}`} type="button" onClick={()=>window.dispatchEvent(new CustomEvent('projectx:open-utility',{detail:{category:'cloud',openCloud:true}}))}><i/><span><strong>{cloudState.session?'Cloud signed in':cloudState.configured?'Cloud sign in':'Configure Cloud'}</strong><small>{cloudState.session?.user.email||cloudState.session?.user.id||(cloudState.configured?'Account backup and Companion':'Cloud is not configured')}</small></span></button><div className="sidebar-spacer"/><div className="v2-sidebar-controls"><button type="button" onClick={()=>window.dispatchEvent(new CustomEvent('projectx:open-utility',{detail:{category:'projects'}}))}>Control center</button><button type="button" onClick={()=>window.dispatchEvent(new CustomEvent('projectx:open-settings'))}>Settings</button></div><div className="v2-host-state"><i className={desktop?'online':''}/><span>{desktop?'LOCAL DEV HOST ONLINE':'LOCAL DEV HOST OFFLINE'}</span></div></aside>

    <main className="workspace v2-workspace"><div className="workspace-brand-banner"><img src={workspaceHeader} alt="project.X App Manager" /></div><header className="topbar v2-topbar"><div><p className="eyebrow">{themes.find((item)=>item.id===theme)?.sub} / {nav}</p><h1>{nav==='Projects'?'Your project universe.':nav}</h1><p className="v2-status-line">{status}</p></div><div className="topbar-actions"><label className="search-box"><span>⌕</span><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Search projects…"/></label><button className="add-primary" type="button" onClick={openLauncher}>+ Add project</button></div></header>
      <section className="v2-theme-deck" aria-label="Workspace environments">{themes.map((item,index)=><button key={item.id} type="button" className={theme===item.id?'active':''} aria-pressed={theme===item.id} title={item.sub} onClick={()=>changeTheme(item.id)}><i>{String(index+1).padStart(2,'0')}</i><strong>{item.label}</strong><span>{item.sub}</span></button>)}</section>
      <section className="stats-strip v2-stats"><div><span>PROJECTS</span><strong>{String(active.length).padStart(2,'0')}</strong></div><div><span>LOCAL</span><strong>{String(localCount).padStart(2,'0')}</strong></div><div><span>REPOS</span><strong>{String(repoCount).padStart(2,'0')}</strong></div><div><span>LIVE</span><strong>{String(liveCount).padStart(2,'0')}</strong></div></section>
      {nav==='Activity'?<section className="v2-activity"><div className="section-heading"><div><p className="eyebrow">RECENT STATE</p><h3>Workspace activity</h3></div></div>{active.length?active.map((project,index)=><button type="button" key={project.id} onClick={()=>setSelected(project)}><b>{String(index+1).padStart(2,'0')}</b><strong>{project.name}</strong><span>{sourceLabel(project,sourceMap.get(project.id))} · {project.updated||'Unknown update'}</span></button>):<p>No project activity yet.</p>}</section>:<><section className="section-heading v2-heading"><div><p className="eyebrow">ENVIRONMENT / {theme.toUpperCase()}</p><h3>{nav==='Archive'?'Archived projects':nav==='Favorites'?'Favorites':'Projects'}</h3></div><span className="result-count">{visible.length} SHOWN</span></section><ThemeProjectRenderer theme={theme} projects={visible} sourceMap={sourceMap} desktopOnline={Boolean(desktop)} sourceLabel={sourceLabel} onOpen={setSelected} onRun={(project)=>void runProject(project)} onAdd={openLauncher}/></>}
    </main>

    {selected&&<div className="v2-detail-backdrop" onMouseDown={()=>setSelected(null)}><aside className="v2-detail" onMouseDown={(event)=>event.stopPropagation()}><button className="v2-detail-close" type="button" onClick={()=>setSelected(null)}>×</button><small>{sourceLabel(selected,sourceMap.get(selected.id))}</small><h2>{selected.name}</h2><p>{selected.description||'No description yet.'}</p><div className="v2-detail-facts"><span>Status <b>{selected.status||'Building'}</b></span><span>Local <b>{sourceMap.get(selected.id)?.path?desktop?'Available':'Host offline':'Remote only'}</b></span><span>Git <b>{sourceMap.get(selected.id)?.hasGit?'Detected':selected.repoUrl?'Remote':'None'}</b></span></div>{sourceMap.get(selected.id)?.path?<code>{sourceMap.get(selected.id)?.path}</code>:selected.repoUrl&&<p className="v2-remote-note">This project currently exists only as a remote record. Import/download a local copy before project.X can run its development server.</p>}<div className="v2-detail-actions"><button type="button" disabled={!desktop||!sourceMap.get(selected.id)?.path} onClick={()=>sourceMap.get(selected.id)?.path&&desktop?.openInExplorer(sourceMap.get(selected.id)!.path!)}>Explorer</button><button type="button" disabled={!desktop||!sourceMap.get(selected.id)?.path} onClick={()=>sourceMap.get(selected.id)?.path&&desktop?.openInTerminal(sourceMap.get(selected.id)!.path!)}>Terminal</button><button type="button" disabled={!desktop||!sourceMap.get(selected.id)?.path} onClick={()=>void runProject(selected)}>Run project</button><button className="danger" type="button" onClick={()=>deleteProject(selected)}>Delete record</button></div></aside></div>}
  </div>
}
