import { useEffect, useMemo, useState } from 'react'
import ThemeProjectRenderer from './ThemeProjectRenderer'
import ThemeSwitcher from './ThemeSwitcher'
import { getDesktopHost, type ProjectFileEntry } from './services/desktop'
import { APP_VERSION } from './version'
import { errorMessage } from './services/errors'
import { deleteProjectAndLocalSource, readLocalSources, readProjects } from './services/projectStorage'
import { readSettings } from './services/settings'
import appIcon from './assets/brand/app-icon.png'
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
type Project = { id:string; name:string; kicker?:string; detectedVersion?:string; description?:string; status?:string; stack?:string[]; updated?:string; progress?:number; favorite?:boolean; archived?:boolean; repoUrl?:string; liveUrl?:string; coverUrl?:string; github?:unknown }
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
type HostStatus={status:'connecting'|'online'|'error';detail:string;projectCount:number;updatedAt:string;hostOnline?:boolean;cloudOnline?:boolean;companionConnected?:boolean;companionLastSeenAt?:string|null;cloudProjectCount?:number;localProjectCount?:number}
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
  const [themePickerOpen,setThemePickerOpen]=useState(false)
  const [cardDialog,setCardDialog]=useState<{kind:'git'|'files'|'workbook';projectId:string}|null>(null)
  const [gitInfo,setGitInfo]=useState('')
  const [commitMessage,setCommitMessage]=useState('')
  const [fileDir,setFileDir]=useState('')
  const [fileEntries,setFileEntries]=useState<ProjectFileEntry[]>([])
  const [filePreview,setFilePreview]=useState('')
  const [fileMessage,setFileMessage]=useState('')
  const [workbookNote,setWorkbookNote]=useState('')
  const [workbookTasks,setWorkbookTasks]=useState<string[]>([])
  const [newTask,setNewTask]=useState('')
  const [sortMode,setSortMode]=useState<'name'|'recent'>('name')
  const [sortMenuOpen,setSortMenuOpen]=useState(false)

  useEffect(()=>{const refresh=()=>{setProjects(readArray(PROJECTS_KEY));setSources(readArray(LOCAL_KEY))};window.addEventListener('storage',refresh);window.addEventListener('projectx:projects-changed',refresh);return()=>{window.removeEventListener('storage',refresh);window.removeEventListener('projectx:projects-changed',refresh)}},[])
  useEffect(()=>localStorage.setItem(VIEW_KEY,theme),[theme])
  useEffect(()=>{
    const open=(event:Event)=>{const detail=(event as CustomEvent<{projectId:string}>).detail;const kind=event.type==='projectx:card-git'?'git':event.type==='projectx:card-files'?'files':'workbook';if(detail?.projectId)setCardDialog({kind,projectId:detail.projectId})}
    for(const name of ['projectx:card-git','projectx:card-files','projectx:card-workbook'])window.addEventListener(name,open)
    return()=>{for(const name of ['projectx:card-git','projectx:card-files','projectx:card-workbook'])window.removeEventListener(name,open)}
  },[])
  useEffect(()=>{
    if(!cardDialog)return
    const project=projects.find(item=>item.id===cardDialog.projectId)
    if(!project)return
    if(cardDialog.kind==='files'){setFileDir('');void browseProject(project.id)}
    if(cardDialog.kind==='workbook'){
      try{const data=JSON.parse(localStorage.getItem('projectx.workbook.'+project.id)||'{}');setWorkbookNote(typeof data.note==='string'?data.note:'');setWorkbookTasks(Array.isArray(data.tasks)?data.tasks.filter((task:unknown)=>typeof task==='string'):[])}catch{setWorkbookNote('');setWorkbookTasks([])}
    }
    if(cardDialog.kind==='git'){
      const path=sources.find(item=>item.projectId===project.id)?.path
      if(!desktop||!path){setGitInfo('A local project is required for Git operations.');return}
      setGitInfo('Checking repository…')
      void desktop.gitStatus(path).then(info=>setGitInfo(info?'Branch: '+(info.branch||'unknown')+' · '+(info.dirty?'Local changes present':'Working tree clean'):'No Git repository detected')).catch(error=>setGitInfo(errorMessage(error,'Unable to read Git status.')))
    }
  },[cardDialog,projects,sources,desktop])
  function saveWorkbook(projectId:string,note:string,tasks:string[]){localStorage.setItem('projectx.workbook.'+projectId,JSON.stringify({note,tasks,updatedAt:new Date().toISOString()}))}
  async function browseProject(projectId:string,relativePath=''){
    const path=sources.find(item=>item.projectId===projectId)?.path
    setFilePreview('')
    setFileMessage('Loading project files…')
    if(!desktop||!path){setFileEntries([]);setFileMessage('Link a local folder to browse this project.');return}
    try{
      const items=await desktop.listProjectFiles(path,relativePath)
      setFileDir(relativePath);setFileEntries(items);setFileMessage(items.length?'':'This folder is empty.')
    }catch(error){setFileEntries([]);setFileMessage(errorMessage(error,'Cannot read project folder.'))}
  }
  async function previewProjectFile(projectId:string,relativePath:string){
    const path=sources.find(item=>item.projectId===projectId)?.path
    if(!desktop||!path)return
    setFileMessage('Opening '+relativePath+'…')
    try{setFilePreview(await desktop.readProjectText(path,relativePath));setFileMessage(relativePath)}
    catch(error){setFilePreview('');setFileMessage(errorMessage(error,'Preview unavailable.'))}
  }


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
  }).sort((a,b)=>sortMode==='name'?a.name.localeCompare(b.name):(b.updated||'').localeCompare(a.updated||'')),[projects,nav,query,sortMode])

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

    <main className="workspace v2-workspace"><header className="desktop-utility-header"><h1>{nav==='Archive'?'Archive':nav}</h1><div className="desktop-utility-actions"><label className="search-box"><span>⌕</span><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Search projects…"/></label><button className="add-primary" type="button" onClick={openLauncher}>+ Project</button><button className="planet-store-button" type="button" title="Open planet.X Store" aria-label="Open planet.X Store" onClick={()=>openBrandUrl('https://planet-x.co/store')}><img src={planetCrest} alt=""/></button></div><p className="workspace-status-live" aria-live="polite">{status}</p></header>
      
      {nav==='Activity'?<section className="v2-activity"><div className="section-heading"><div><p className="eyebrow">RECENT STATE</p><h3>Workspace activity</h3></div><span className="result-count">{cloudActivity.length?`${cloudActivity.length} CLOUD EVENTS`:activityState==='loading'?'SYNCING…':activityState==='error'?'LOCAL FALLBACK':'NO CLOUD EVENTS'}</span></div>{cloudActivity.length?cloudActivity.map((activity,index)=>{const project=projects.find((item)=>item.id===activity.project_client_id);return <button type="button" key={activity.id||`${activity.event_type}-${index}`} onClick={()=>project&&setSelected(project)}><b>{String(index+1).padStart(2,'0')}</b><strong>{project?.name||activity.event_type.replaceAll('.',' / ')}</strong><span>{activity.message} · {activity.created_at?new Date(activity.created_at).toLocaleString():'Cloud event'}</span></button>}):active.length?active.map((project,index)=><button type="button" key={project.id} onClick={()=>setSelected(project)}><b>{String(index+1).padStart(2,'0')}</b><strong>{project.name}</strong><span>{sourceLabel(project,sourceMap.get(project.id))} · {project.updated||'Unknown update'}</span></button>):<p>{activityState==='error'?'Cloud activity is temporarily unavailable. No local activity is available either.':'No project activity yet.'}</p>}</section>:<><section className="section-heading v2-heading redesigned-projects-toolbar"><div className="toolbar-stats"><section className="stats-strip v2-stats"><div><span>PROJECTS</span><strong>{String(active.length).padStart(2,'0')}</strong></div><div><span>LOCAL</span><strong>{String(localCount).padStart(2,'0')}</strong></div><div><span>REPOS</span><strong>{String(repoCount).padStart(2,'0')}</strong></div><div><span>ONLINE</span><strong>{String(liveCount).padStart(2,'0')}</strong></div></section><span className="result-count">{visible.length} shown</span></div><div className="section-heading-actions"><button className="environment-trigger" type="button" onClick={()=>setThemePickerOpen(true)}>✦ Themes <b>β</b></button><div className="sort-menu-wrap"><button className="sort-filter-trigger" type="button" aria-expanded={sortMenuOpen} onClick={()=>setSortMenuOpen(!sortMenuOpen)}>☷ Sort / Filter</button>{sortMenuOpen&&<div className="sort-menu" role="group" aria-label="Project sorting"><button type="button" onClick={()=>{setSortMode('name');setSortMenuOpen(false)}}>Name A–Z {sortMode==='name'?'✓':''}</button><button type="button" onClick={()=>{setSortMode('recent');setSortMenuOpen(false)}}>Recently updated {sortMode==='recent'?'✓':''}</button></div>}</div></div></section><ThemeProjectRenderer theme={theme} projects={visible} sourceMap={sourceMap} desktopOnline={Boolean(desktop)} sourceLabel={sourceLabel} onOpen={setSelected} onRun={(project)=>void runProject(project)} onDeployment={openDeployment} healthMap={healthMap} onAdd={openLauncher}/></>}
    </main>

    <ThemeSwitcher items={themes} value={theme} open={themePickerOpen} onClose={()=>setThemePickerOpen(false)} onChange={(next)=>changeTheme(next as ThemeMode)} />
    {cardDialog&&(()=>{const project=projects.find(item=>item.id===cardDialog.projectId);if(!project)return null;const path=sourceMap.get(project.id)?.path;return <div className="project-card-dialog-backdrop" onMouseDown={()=>setCardDialog(null)}><section className="project-card-dialog" role="dialog" aria-modal="true" aria-label={project.name+' '+cardDialog.kind} onMouseDown={event=>event.stopPropagation()}><header><div><small>PROJECT.X / {cardDialog.kind.toUpperCase()}</small><h2>{project.name}</h2></div><button type="button" onClick={()=>setCardDialog(null)} aria-label="Close">×</button></header>
    {cardDialog.kind==='git'&&<div className="project-card-dialog-body"><p role="status">{gitInfo}</p><div className="card-dialog-actions"><button type="button" disabled={!desktop||!path} onClick={()=>{if(desktop&&path)void desktop.gitStatus(path).then(info=>setGitInfo('Branch: '+(info?.branch||'unknown')+' · '+(info?.dirty?'Changes present':'Clean'))).catch(e=>setGitInfo(errorMessage(e,'Git status failed.')))}}>⟳ Status</button><button type="button" disabled={!desktop||!path} onClick={()=>{if(!desktop||!path)return;setGitInfo('Fetching remote refs…');void desktop.gitFetch(path).then(result=>setGitInfo(result.output||'Fetch complete.')).catch(e=>setGitInfo(errorMessage(e,'Fetch failed.')))}}>↓ Fetch</button><button type="button" disabled={!desktop||!path} onClick={()=>{if(!desktop||!path||!window.confirm('Fast-forward pull for '+project.name+'? Local changes must be committed or stashed first.'))return;setGitInfo('Pulling…');void desktop.gitPull(path).then(result=>setGitInfo(result.output||'Pull complete.')).catch(e=>setGitInfo(errorMessage(e,'Pull failed.')))}}>⇣ Pull</button><button type="button" disabled={!desktop||!path} onClick={()=>{if(!desktop||!path||!window.confirm('Push local commits for '+project.name+' to its configured remote?'))return;setGitInfo('Pushing…');void desktop.gitPush(path).then(result=>setGitInfo(result.output||'Push complete.')).catch(e=>setGitInfo(errorMessage(e,'Push failed.')))}}>⇡ Push</button><button type="button" disabled={!desktop||!path} onClick={()=>{if(desktop&&path)void desktop.openInTerminal(path)}}>Terminal</button></div><form className="git-commit-form" onSubmit={event=>{event.preventDefault();if(!desktop||!path||!commitMessage.trim()||!window.confirm('Stage all local changes and commit to '+project.name+'?'))return;setGitInfo('Creating local commit…');void desktop.gitCommit(path,commitMessage.trim()).then(result=>{setGitInfo(result.output||'Commit completed.');if(result.ok)setCommitMessage('')}).catch(e=>setGitInfo(errorMessage(e,'Commit failed.')))}}><label>Commit message<input value={commitMessage} onChange={event=>setCommitMessage(event.target.value)} placeholder="Describe this change" /></label><button type="submit" disabled={!desktop||!path||!commitMessage.trim()}>Commit changes</button></form><p className="dialog-hint">Fetch updates remote references; Pull uses fast-forward only and rejects dirty worktrees. Push and Commit require confirmation. No automatic synchronization or force-push is performed.</p></div>}
    {cardDialog.kind==='files'&&<div className="project-card-dialog-body"><div className="file-browser-toolbar"><strong>Project files</strong><button type="button" disabled={!path||!desktop} onClick={()=>void browseProject(project.id,'')}>⌂ Root</button><button type="button" disabled={!fileDir||!desktop} onClick={()=>void browseProject(project.id,fileDir.split('/').slice(0,-1).join('/'))}>↑ Up</button><button type="button" disabled={!desktop||!path} onClick={()=>{if(desktop&&path)void desktop.openInExplorer(path)}}>Windows Explorer</button></div><code>{fileDir ? '/'+fileDir : '/'} · {path||'No local folder linked'}</code><div className="project-file-list" role="list">{fileEntries.map(entry=><button type="button" role="listitem" key={entry.relativePath} onClick={()=>entry.isDirectory?void browseProject(project.id,entry.relativePath):void previewProjectFile(project.id,entry.relativePath)}><span>{entry.isDirectory?'▣':'▤'} {entry.name}</span><small>{entry.isDirectory?'Folder':entry.bytes?Math.ceil(entry.bytes/1024)+' KB':'File'}</small></button>)}</div>{fileMessage&&<p className="dialog-hint" role="status">{fileMessage}</p>}{filePreview&&<pre className="file-browser-preview">{filePreview}</pre>}<p className="dialog-hint">Read-only. Only files inside the authorized project root can be listed or previewed. Sensitive credentials and large files are excluded.</p></div>
    {cardDialog.kind==='workbook'&&<div className="project-card-dialog-body"><label className="workbook-label">Project notes<textarea rows={5} value={workbookNote} onChange={event=>{setWorkbookNote(event.target.value);saveWorkbook(project.id,event.target.value,workbookTasks)}} placeholder="Ideas, decisions, progress…" /></label><h3>Tasks</h3><div className="workbook-tasks">{workbookTasks.map((task,index)=><div key={index}><span>{task}</span><button type="button" onClick={()=>{const next=workbookTasks.filter((_,i)=>i!==index);setWorkbookTasks(next);saveWorkbook(project.id,workbookNote,next)}} aria-label={'Remove '+task}>×</button></div>)}</div><form onSubmit={event=>{event.preventDefault();const value=newTask.trim();if(!value)return;const next=[...workbookTasks,value];setWorkbookTasks(next);saveWorkbook(project.id,workbookNote,next);setNewTask('')}}><input value={newTask} onChange={event=>setNewTask(event.target.value)} placeholder="Add a task…" /><button type="submit">Add task</button></form><p className="dialog-hint">Notes and tasks are stored on this device for now; cloud history and backup integration are future work.</p></div>}
    </section></div>})()}


    {selected&&<div className="v2-detail-backdrop" onMouseDown={()=>setSelected(null)}><aside className="v2-detail" onMouseDown={(event)=>event.stopPropagation()}><button className="v2-detail-close" type="button" onClick={()=>setSelected(null)}>×</button><small>{sourceLabel(selected,sourceMap.get(selected.id))}</small><h2>{selected.name}</h2><p>{selected.description||'No description yet.'}</p><div className="v2-detail-facts"><span>Build <b>{healthFor(selected.id,healthMap).build.state}</b></span><span>Vercel <b>{healthFor(selected.id,healthMap).deployment.state}</b></span><span>Git <b>{sourceMap.get(selected.id)?.hasGit?'Detected':selected.repoUrl?'Remote':'None'}</b></span></div><p className="v2-health-detail">{healthFor(selected.id,healthMap).build.detail}</p>{sourceMap.get(selected.id)?.path?<code>{sourceMap.get(selected.id)?.path}</code>:selected.repoUrl&&<p className="v2-remote-note">This project currently exists only as a remote record. Import/download a local copy before project.X can run its development server.</p>}<div className="v2-detail-actions"><button type="button" disabled={!desktop||!sourceMap.get(selected.id)?.path} onClick={()=>sourceMap.get(selected.id)?.path&&desktop?.openInExplorer(sourceMap.get(selected.id)!.path!)}>Explorer</button><button type="button" disabled={!desktop||!sourceMap.get(selected.id)?.path} onClick={()=>sourceMap.get(selected.id)?.path&&desktop?.openInTerminal(sourceMap.get(selected.id)!.path!)}>Terminal</button><button type="button" disabled={!desktop||!sourceMap.get(selected.id)?.path} onClick={()=>void runProject(selected)}>Run project</button><button type="button" onClick={()=>openDeployment(selected)}>Vercel</button><button className="danger" type="button" onClick={()=>deleteProject(selected)}>Delete record</button></div></aside></div>}
  </div>
}
