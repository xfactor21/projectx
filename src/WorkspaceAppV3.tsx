import { useEffect, useMemo, useState } from 'react'
import ThemeProjectRenderer from './ThemeProjectRenderer'
import { getDesktopHost } from './services/desktop'
import { APP_VERSION } from './version'
import { errorMessage } from './services/errors'
import { deleteProjectAndLocalSource, readLocalSources, readProjects } from './services/projectStorage'
import { readSettings } from './services/settings'
import appIcon from './assets/brand/app-icon.png'
import workspaceHeader from './assets/brand/workspace-header-transparent.png'
import planetCrest from './assets/brand/planetx-crest-transparent.png'
import planetWordmark from './assets/brand/planetx-wordmark-transparent.png'
import { recordRunTask } from './services/runTasks'
import { appendCloudActivity, fetchCloudActivity, isSupabaseConfigured, loadSession, type CloudActivity } from './services/supabase'
import { buildHealthFromInspection, deploymentState, healthFor, PROJECT_HEALTH_EVENT, readProjectHealth, writeProjectHealth, type ProjectHealth } from './services/projectHealth'
import { fetchVercelDeployments } from './services/vercel'
import { fetchProviderConnection, type ProviderConnectionState, type ProviderId } from './services/providerConnections'
import { openHostedLink } from './services/externalLinks'

type ThemeMode = 'Grid' | 'Storefront' | 'Vending' | 'Comic' | '3D' | 'XFactor' | 'PlanetX'
type NavMode = 'Projects' | 'Favorites' | 'Activity' | 'Archive'
type Project = { id:string; name:string; kicker?:string; description?:string; status?:string; stack?:string[]; updated?:string; progress?:number; favorite?:boolean; archived?:boolean; repoUrl?:string; liveUrl?:string; coverUrl?:string; github?:unknown }
type LocalSource = { projectId:string; kind?:'desktop'|'browser'|'managed'|'zip'|'generated'; path?:string; scripts?:string[]; hasGit?:boolean; gitBranch?:string }

const PROJECTS_KEY='projectx.projects.v1'
const LOCAL_KEY='projectx.local.sources.v1'
const VIEW_KEY='projectx.view.v1'
const HOST_STATUS_KEY='projectx.companion.host-status.v1'
const themes:Array<{id:ThemeMode;label:string;sub:string}>=[
  {id:'Grid',label:'Command',sub:'Developer control room'},
  {id:'Storefront',label:'Storefront',sub:'Walkable project district'},
  {id:'Vending',label:'Vending',sub:'Build dispenser machine'},
  {id:'Comic',label:'Comic',sub:'Sequential project universe'},
  {id:'3D',label:'Gallery',sub:'Spatial project exhibit'},
  {id:'XFactor',label:'xFactor',sub:'Hot-pink neon street-tech build district'},
  {id:'PlanetX',label:'planet.X',sub:'Premium orbital project command'},
]

function readArray<T>(key:string):T[]{return key===PROJECTS_KEY?readProjects() as T[]:key===LOCAL_KEY?readLocalSources() as T[]:[]}
function readTheme():ThemeMode{const raw=localStorage.getItem(VIEW_KEY);const saved=raw==='Neon'?'XFactor':raw==='Orbit'?'PlanetX':raw as ThemeMode|null;return saved&&themes.some((item)=>item.id===saved)?saved:'Grid'}
function sourceLabel(project:Project,source?:LocalSource){if(source?.kind==='managed')return'MANAGED LOCAL';if(source?.kind==='zip')return'INITIALIZED LOCAL';if(source?.kind==='generated')return'PROJECT.X CREATED';if(source?.kind==='desktop')return'LOCAL PROJECT';if(source?.kind==='browser')return'LOCAL BROWSER';if(project.github||project.repoUrl?.includes('github.com'))return'GITHUB REMOTE';return'CLOUD / RECORD'}
function openLauncher(){window.dispatchEvent(new CustomEvent('projectx:open-add-project'))}
function preferredRunScript(scripts:string[]=[]){return ['dev','web','start','serve'].find((script)=>scripts.includes(script))||''}
type HostStatus={status:'connecting'|'online'|'error';detail:string;projectCount:number;updatedAt:string}
function readHostStatus():HostStatus|null{try{const parsed=JSON.parse(localStorage.getItem(HOST_STATUS_KEY)||'null');return parsed&&typeof parsed.detail==='string'?parsed:null}catch{return null}}
function connectionAge(value:string|undefined,now:number){if(!value)return'not checked';const elapsed=Math.max(0,now-new Date(value).getTime());if(elapsed<60_000)return'just now';if(elapsed<3_600_000)return`${Math.floor(elapsed/60_000)}m ago`;if(elapsed<86_400_000)return`${Math.floor(elapsed/3_600_000)}h ago`;return`${Math.floor(elapsed/86_400_000)}d ago`}

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
  const [companionState,setCompanionState]=useState<HostStatus|null>(readHostStatus)
  const [providerStates,setProviderStates]=useState<Partial<Record<ProviderId,ProviderConnectionState>>>({})
  const [connectionClock,setConnectionClock]=useState(()=>Date.now())
  const [healthMap,setHealthMap]=useState<Record<string,ProjectHealth>>(()=>readProjectHealth())
  const [cloudActivity,setCloudActivity]=useState<CloudActivity[]>([])
  const [activityState,setActivityState]=useState<'idle'|'loading'|'ready'|'error'>('idle')

  useEffect(()=>{const refresh=()=>{setProjects(readArray(PROJECTS_KEY));setSources(readArray(LOCAL_KEY))};window.addEventListener('storage',refresh);window.addEventListener('projectx:projects-changed',refresh);return()=>{window.removeEventListener('storage',refresh);window.removeEventListener('projectx:projects-changed',refresh)}},[])
  useEffect(()=>localStorage.setItem(VIEW_KEY,theme),[theme])
  useEffect(()=>{const refresh=()=>setCloudState({configured:isSupabaseConfigured(),session:loadSession()});window.addEventListener('projectx:supabase-config-changed',refresh);window.addEventListener('projectx:supabase-session-changed',refresh);return()=>{window.removeEventListener('projectx:supabase-config-changed',refresh);window.removeEventListener('projectx:supabase-session-changed',refresh)}},[])
  useEffect(()=>{const refresh=()=>setCompanionState(readHostStatus());window.addEventListener('projectx:companion-status',refresh);return()=>window.removeEventListener('projectx:companion-status',refresh)},[])
  useEffect(()=>{const timer=window.setInterval(()=>setConnectionClock(Date.now()),15_000);return()=>window.clearInterval(timer)},[])
  useEffect(()=>{
    if(!cloudState.session)return
    let cancelled=false
    const refresh=async()=>{const [github,vercel]=await Promise.all([fetchProviderConnection('github'),fetchProviderConnection('vercel')]);if(!cancelled)setProviderStates({github,vercel})}
    void refresh();const timer=window.setInterval(()=>void refresh(),60_000)
    window.addEventListener('projectx:provider-changed',refresh)
    return()=>{cancelled=true;window.clearInterval(timer);window.removeEventListener('projectx:provider-changed',refresh)}
  },[cloudState.session])
  useEffect(()=>{const refresh=()=>setHealthMap(readProjectHealth());window.addEventListener(PROJECT_HEALTH_EVENT,refresh);return()=>window.removeEventListener(PROJECT_HEALTH_EVENT,refresh)},[])
  useEffect(()=>{
    if(!cloudState.session){setCloudActivity([]);setActivityState('idle');return}
    let cancelled=false
    const refresh=async()=>{
      setActivityState((current)=>current==='ready'?'ready':'loading')
      try{const rows=await fetchCloudActivity(cloudState.session,100);if(!cancelled){setCloudActivity(rows);setActivityState('ready')}}
      catch{if(!cancelled)setActivityState('error')}
    }
    void refresh();const timer=window.setInterval(()=>void refresh(),30_000)
    window.addEventListener('projectx:activity-changed',refresh)
    return()=>{cancelled=true;window.clearInterval(timer);window.removeEventListener('projectx:activity-changed',refresh)}
  },[cloudState.session])
  useEffect(()=>{document.documentElement.dataset.projectxTheme=theme.toLowerCase();return()=>{delete document.documentElement.dataset.projectxTheme}},[theme])
  useEffect(()=>{
    if(!desktop)return
    let cancelled=false
    void Promise.all(sources.filter((source)=>source.path).map(async(source)=>{
      writeProjectHealth(source.projectId,{build:{...healthFor(source.projectId).build,state:'checking',detail:'Checking package metadata and installed dependencies.'}})
      try{const summary=await desktop.inspectProject(source.path!);if(!cancelled)writeProjectHealth(source.projectId,{build:buildHealthFromInspection(summary)})}
      catch(error){if(!cancelled)writeProjectHealth(source.projectId,{build:{state:'error',detail:errorMessage(error,'Unable to inspect this project.'),checkedAt:new Date().toISOString()}})}
    }))
    return()=>{cancelled=true}
  },[desktop,sources])
  useEffect(()=>{
    if(!cloudState.session)return
    let cancelled=false
    const refresh=async()=>{
      const result=await fetchVercelDeployments()
      if(cancelled||!result.connected)return
      const latestByName=new Map(result.deployments.map((deployment)=>[deployment.name,deployment]))
      const current=readProjectHealth()
      for(const project of projects){
        const link=current[project.id]?.deployment.link
        if(!link||link.provider!=='vercel')continue
        const deployment=result.deployments.find((item)=>item.id===link.deploymentId)||latestByName.get(link.projectName)
        if(deployment)writeProjectHealth(project.id,{deployment:{state:deploymentState(deployment.state),detail:`${deployment.name} is ${deployment.state.toLowerCase()} on Vercel.`,checkedAt:new Date().toISOString(),link:{...link,deploymentId:deployment.id,url:deployment.url}}})
        else writeProjectHealth(project.id,{deployment:{state:'offline',detail:'No current Vercel deployment was found for this link.',checkedAt:new Date().toISOString(),link}})
      }
    }
    void refresh();const timer=window.setInterval(()=>void refresh(),60_000)
    return()=>{cancelled=true;window.clearInterval(timer)}
  },[cloudState.session,projects])

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
    if(!desktop){setStatus('The local development host is unavailable. Open the project.X desktop app to run local servers.');return}
    if(!source?.path){setStatus(`${project.name} is a remote/cloud record only. Download, import, or link a local copy before running it.`);return}
    const script=preferredRunScript(source.scripts)
    if(!script){setStatus(`${project.name} has no supported dev/web/start/serve script in package.json.`);return}
    setStatus(`Starting ${project.name} with ${script}… project.X will install missing dependencies automatically.`)
    try{
      const result=await desktop.runDevProject(source.path,script)
      if(!result.ok||!result.pid)throw new Error(result.output||`Unable to start ${project.name}.`)
      setStatus(result.output)
      if(result.ok&&result.pid){writeProjectHealth(project.id,{build:{state:'ready',detail:`Dependencies are installed and ${script} launched successfully.`,checkedAt:new Date().toISOString(),runUrl:result.url}});recordRunTask({projectId:project.id,projectName:project.name,path:source.path,result});if(cloudState.session)void appendCloudActivity({project_client_id:project.id,event_type:'project.run.succeeded',message:`${project.name} started with ${script}.`,metadata:{script,pid:result.pid,url:result.url||null}},cloudState.session).then(()=>window.dispatchEvent(new CustomEvent('projectx:activity-changed'))).catch(()=>undefined);if(readSettings().autoOpenPreview&&result.url)await desktop.openPreviewWindow(project.id,project.name,result.url,result.pid)}
    }catch(error){const message=errorMessage(error,'Unable to start project.');writeProjectHealth(project.id,{build:{state:'error',detail:message,checkedAt:new Date().toISOString()}});if(cloudState.session)void appendCloudActivity({project_client_id:project.id,event_type:'project.run.failed',message:`${project.name} failed to start.`,metadata:{error:message}},cloudState.session).then(()=>window.dispatchEvent(new CustomEvent('projectx:activity-changed'))).catch(()=>undefined);setStatus(message)}
  }

  function changeTheme(next:ThemeMode){setTheme(next);setStatus(`${themes.find((item)=>item.id===next)?.label} environment loaded`);window.dispatchEvent(new CustomEvent('projectx:theme-changed',{detail:next}))}

  function openBrandUrl(url:string){
    void openHostedLink(url).catch((error)=>setStatus(errorMessage(error,'Unable to open that link.')))
  }

  function deleteProject(project:Project){
    if(!window.confirm(`Delete ${project.name} from project.X? Local files will remain on disk.`))return
    deleteProjectAndLocalSource(project.id);setSelected(null);setStatus(`${project.name} was removed from project.X. Local files were not deleted.`)
  }

  const localCount=active.filter((project)=>sourceMap.has(project.id)).length
  const repoCount=active.filter((project)=>Boolean(project.repoUrl||project.github)).length
  const liveCount=active.filter((project)=>healthFor(project.id,healthMap).deployment.state==='online').length
  const companionOnline=companionState?.status==='online'&&Boolean(companionState.updatedAt)&&connectionClock-new Date(companionState.updatedAt).getTime()<30_000
  const visibleProviderStates=cloudState.session?providerStates:{}
  function openDeployment(project:Project){
    window.dispatchEvent(new CustomEvent('projectx:open-utility',{detail:{category:'cloud'}}))
    window.setTimeout(()=>window.dispatchEvent(new CustomEvent('projectx:open-deployment',{detail:{projectId:project.id}})),0)
  }
  function openConnection(target:'companion'|ProviderId){window.dispatchEvent(new CustomEvent('projectx:open-connection',{detail:{target}}))}

  return <div className={`px-shell workspace-v2 workspace-v3 theme-${theme.toLowerCase()}`}>
    <aside className="sidebar v2-sidebar"><button className="brand-lockup" type="button" onClick={()=>setNav('Projects')}><img className="brand-mark" src={appIcon} alt=""/><div><div className="brand-name">project<span>.X</span> <small className="brand-version">v{APP_VERSION}</small></div><div className="brand-subtitle">PROJECT LIFECYCLE</div></div></button><nav className="primary-nav">{(['Projects','Favorites','Activity','Archive'] as NavMode[]).map((item)=><button key={item} type="button" className={nav===item?'nav-item active':'nav-item'} onClick={()=>setNav(item)}><span className="nav-dot"/><span>{item}</span></button>)}</nav><div className="v2-source-status"><small>WORKSPACE SOURCE</small><strong>{desktop?'Local + Cloud':'Cloud / Web'}</strong><span>{localCount} local · {repoCount} repos</span></div><div className="connection-strip" aria-label="Connections"><button className={companionOnline?'online':companionState?.status==='error'?'error':'idle'} type="button" onClick={()=>openConnection('companion')} title={companionState?.detail||'Open Companion connection'}><i/><strong>Companion</strong><small>{connectionAge(companionState?.updatedAt,connectionClock)}</small></button><button className={visibleProviderStates.github?.connected?'online':'idle'} type="button" onClick={()=>openConnection('github')} title={visibleProviderStates.github?.message||'Open GitHub connection'}><i/><strong>GitHub</strong><small>{connectionAge(visibleProviderStates.github?.checkedAt,connectionClock)}</small></button><button className={visibleProviderStates.vercel?.connected?'online':'idle'} type="button" onClick={()=>openConnection('vercel')} title={visibleProviderStates.vercel?.message||'Open Vercel connection'}><i/><strong>Vercel</strong><small>{connectionAge(visibleProviderStates.vercel?.checkedAt,connectionClock)}</small></button></div><div className="sidebar-spacer"/><div className="planet-signature"><img src={planetWordmark} alt="planet.X"/><span>Created at planet.X</span></div><div className="v2-sidebar-controls"><button type="button" onClick={()=>window.dispatchEvent(new CustomEvent('projectx:open-utility',{detail:{category:'projects'}}))}>Control center</button><button type="button" onClick={()=>window.dispatchEvent(new CustomEvent('projectx:open-settings'))}>Settings</button></div><div className="v2-host-state"><i className={desktop?'online':''}/><span>{desktop?'LOCAL DEV HOST ONLINE':'LOCAL DEV HOST OFFLINE'}</span></div></aside>

    <main className="workspace v2-workspace"><div className="workspace-brand-row"><div className="workspace-brand-banner"><img src={workspaceHeader} alt="project.X App Manager" /></div><div className="planet-promo"><div><button type="button" onClick={()=>openBrandUrl('https://www.planet-x.co')}>More planet.X Magic</button><button type="button" onClick={()=>openBrandUrl('https://www.planet-x.co/music')}>More xFactor Music</button></div><img src={planetCrest} alt="planet.X"/></div></div><header className="topbar v2-topbar"><div><p className="eyebrow">{themes.find((item)=>item.id===theme)?.sub} / {nav}</p><h1>{nav==='Projects'?'Your project universe.':nav}</h1><p className="v2-status-line">{status}</p></div><div className="topbar-actions"><label className="search-box"><span>⌕</span><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Search projects…"/></label><button className="add-primary" type="button" onClick={openLauncher}>+ Add project</button></div></header>
      <section className="v2-theme-deck" aria-label="Workspace environments">{themes.map((item,index)=><button key={item.id} type="button" className={theme===item.id?'active':''} aria-pressed={theme===item.id} title={item.sub} onClick={()=>changeTheme(item.id)}><i>{String(index+1).padStart(2,'0')}</i><strong>{item.label}</strong><span>{item.sub}</span></button>)}</section>
      <section className="stats-strip v2-stats"><div><span>PROJECTS</span><strong>{String(active.length).padStart(2,'0')}</strong></div><div><span>LOCAL</span><strong>{String(localCount).padStart(2,'0')}</strong></div><div><span>REPOS</span><strong>{String(repoCount).padStart(2,'0')}</strong></div><div><span>ONLINE</span><strong>{String(liveCount).padStart(2,'0')}</strong></div></section>
      {nav==='Activity'?<section className="v2-activity"><div className="section-heading"><div><p className="eyebrow">RECENT STATE</p><h3>Workspace activity</h3></div><span className="result-count">{cloudActivity.length?`${cloudActivity.length} CLOUD EVENTS`:activityState==='loading'?'SYNCING…':activityState==='error'?'LOCAL FALLBACK':'NO CLOUD EVENTS'}</span></div>{cloudActivity.length?cloudActivity.map((activity,index)=>{const project=projects.find((item)=>item.id===activity.project_client_id);return <button type="button" key={activity.id||`${activity.event_type}-${index}`} onClick={()=>project&&setSelected(project)}><b>{String(index+1).padStart(2,'0')}</b><strong>{project?.name||activity.event_type.replaceAll('.',' / ')}</strong><span>{activity.message} · {activity.created_at?new Date(activity.created_at).toLocaleString():'Cloud event'}</span></button>}):active.length?active.map((project,index)=><button type="button" key={project.id} onClick={()=>setSelected(project)}><b>{String(index+1).padStart(2,'0')}</b><strong>{project.name}</strong><span>{sourceLabel(project,sourceMap.get(project.id))} · {project.updated||'Unknown update'}</span></button>):<p>{activityState==='error'?'Cloud activity is temporarily unavailable. No local activity is available either.':'No project activity yet.'}</p>}</section>:<><section className="section-heading v2-heading"><div><p className="eyebrow">ENVIRONMENT / {theme.toUpperCase()}</p><h3>{nav==='Archive'?'Archived projects':nav==='Favorites'?'Favorites':'Projects'}</h3></div><span className="result-count">{visible.length} SHOWN</span></section><ThemeProjectRenderer theme={theme} projects={visible} sourceMap={sourceMap} desktopOnline={Boolean(desktop)} sourceLabel={sourceLabel} onOpen={setSelected} onRun={(project)=>void runProject(project)} onDeployment={openDeployment} healthMap={healthMap} onAdd={openLauncher}/></>}
    </main>

    {selected&&<div className="v2-detail-backdrop" onMouseDown={()=>setSelected(null)}><aside className="v2-detail" onMouseDown={(event)=>event.stopPropagation()}><button className="v2-detail-close" type="button" onClick={()=>setSelected(null)}>×</button><small>{sourceLabel(selected,sourceMap.get(selected.id))}</small><h2>{selected.name}</h2><p>{selected.description||'No description yet.'}</p><div className="v2-detail-facts"><span>Build <b>{healthFor(selected.id,healthMap).build.state}</b></span><span>Vercel <b>{healthFor(selected.id,healthMap).deployment.state}</b></span><span>Git <b>{sourceMap.get(selected.id)?.hasGit?'Detected':selected.repoUrl?'Remote':'None'}</b></span></div><p className="v2-health-detail">{healthFor(selected.id,healthMap).build.detail}</p>{sourceMap.get(selected.id)?.path?<code>{sourceMap.get(selected.id)?.path}</code>:selected.repoUrl&&<p className="v2-remote-note">This project currently exists only as a remote record. Import/download a local copy before project.X can run its development server.</p>}<div className="v2-detail-actions"><button type="button" disabled={!desktop||!sourceMap.get(selected.id)?.path} onClick={()=>sourceMap.get(selected.id)?.path&&desktop?.openInExplorer(sourceMap.get(selected.id)!.path!)}>Explorer</button><button type="button" disabled={!desktop||!sourceMap.get(selected.id)?.path} onClick={()=>sourceMap.get(selected.id)?.path&&desktop?.openInTerminal(sourceMap.get(selected.id)!.path!)}>Terminal</button><button type="button" disabled={!desktop||!sourceMap.get(selected.id)?.path} onClick={()=>void runProject(selected)}>Run project</button><button type="button" onClick={()=>openDeployment(selected)}>Vercel</button><button className="danger" type="button" onClick={()=>deleteProject(selected)}>Delete record</button></div></aside></div>}
  </div>
}
