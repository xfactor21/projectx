from pathlib import Path

root = Path(__file__).resolve().parents[1]
workspace = root / 'src' / 'WorkspaceAppV3.tsx'
text = workspace.read_text(encoding='utf-8')

old = "import { isSupabaseConfigured, loadSession } from './services/supabase'"
new = "import { appendCloudActivity, fetchCloudActivity, isSupabaseConfigured, loadSession, type CloudActivity } from './services/supabase'"
if old not in text: raise SystemExit('supabase import anchor missing')
text = text.replace(old, new, 1)

old = "  const [healthMap,setHealthMap]=useState<Record<string,ProjectHealth>>(()=>readProjectHealth())"
new = old + "\n  const [cloudActivity,setCloudActivity]=useState<CloudActivity[]>([])\n  const [activityState,setActivityState]=useState<'idle'|'loading'|'ready'|'error'>('idle')"
if old not in text: raise SystemExit('state anchor missing')
text = text.replace(old, new, 1)

anchor = "  useEffect(()=>{const refresh=()=>setHealthMap(readProjectHealth());window.addEventListener(PROJECT_HEALTH_EVENT,refresh);return()=>window.removeEventListener(PROJECT_HEALTH_EVENT,refresh)},[])"
insert = anchor + "\n  useEffect(()=>{\n    if(!cloudState.session){setCloudActivity([]);setActivityState('idle');return}\n    let cancelled=false\n    const refresh=async()=>{\n      setActivityState((current)=>current==='ready'?'ready':'loading')\n      try{const rows=await fetchCloudActivity(cloudState.session,100);if(!cancelled){setCloudActivity(rows);setActivityState('ready')}}\n      catch{if(!cancelled)setActivityState('error')}\n    }\n    void refresh();const timer=window.setInterval(()=>void refresh(),30_000)\n    window.addEventListener('projectx:activity-changed',refresh)\n    return()=>{cancelled=true;window.clearInterval(timer);window.removeEventListener('projectx:activity-changed',refresh)}\n  },[cloudState.session])"
if anchor not in text: raise SystemExit('effect anchor missing')
text = text.replace(anchor, insert, 1)

old = "      if(result.ok&&result.pid){writeProjectHealth(project.id,{build:{state:'ready',detail:`Dependencies are installed and ${script} launched successfully.`,checkedAt:new Date().toISOString(),runUrl:result.url}});recordRunTask({projectId:project.id,projectName:project.name,path:source.path,result});if(readSettings().autoOpenPreview&&result.url)await desktop.openPreviewWindow(project.id,project.name,result.url,result.pid)}"
new = "      if(result.ok&&result.pid){writeProjectHealth(project.id,{build:{state:'ready',detail:`Dependencies are installed and ${script} launched successfully.`,checkedAt:new Date().toISOString(),runUrl:result.url}});recordRunTask({projectId:project.id,projectName:project.name,path:source.path,result});if(cloudState.session)void appendCloudActivity({project_client_id:project.id,event_type:'project.run.succeeded',message:`${project.name} started with ${script}.`,metadata:{script,pid:result.pid,url:result.url||null}},cloudState.session).then(()=>window.dispatchEvent(new CustomEvent('projectx:activity-changed'))).catch(()=>undefined);if(readSettings().autoOpenPreview&&result.url)await desktop.openPreviewWindow(project.id,project.name,result.url,result.pid)}"
if old not in text: raise SystemExit('run success anchor missing')
text = text.replace(old, new, 1)

old = "    }catch(error){const message=errorMessage(error,'Unable to start project.');writeProjectHealth(project.id,{build:{state:'error',detail:message,checkedAt:new Date().toISOString()}});setStatus(message)}"
new = "    }catch(error){const message=errorMessage(error,'Unable to start project.');writeProjectHealth(project.id,{build:{state:'error',detail:message,checkedAt:new Date().toISOString()}});if(cloudState.session)void appendCloudActivity({project_client_id:project.id,event_type:'project.run.failed',message:`${project.name} failed to start.`,metadata:{error:message}},cloudState.session).then(()=>window.dispatchEvent(new CustomEvent('projectx:activity-changed'))).catch(()=>undefined);setStatus(message)}"
if old not in text: raise SystemExit('run failure anchor missing')
text = text.replace(old, new, 1)

old = "      {nav==='Activity'?<section className=\"v2-activity\"><div className=\"section-heading\"><div><p className=\"eyebrow\">RECENT STATE</p><h3>Workspace activity</h3></div></div>{active.length?active.map((project,index)=><button type=\"button\" key={project.id} onClick={()=>setSelected(project)}><b>{String(index+1).padStart(2,'0')}</b><strong>{project.name}</strong><span>{sourceLabel(project,sourceMap.get(project.id))} · {project.updated||'Unknown update'}</span></button>):<p>No project activity yet.</p>}</section>:<><section className=\"section-heading v2-heading\">"
new = "      {nav==='Activity'?<section className=\"v2-activity\"><div className=\"section-heading\"><div><p className=\"eyebrow\">RECENT STATE</p><h3>Workspace activity</h3></div><span className=\"result-count\">{cloudActivity.length?`${cloudActivity.length} CLOUD EVENTS`:activityState==='loading'?'SYNCING…':activityState==='error'?'LOCAL FALLBACK':'NO CLOUD EVENTS'}</span></div>{cloudActivity.length?cloudActivity.map((activity,index)=>{const project=projects.find((item)=>item.id===activity.project_client_id);return <button type=\"button\" key={activity.id||`${activity.event_type}-${index}`} onClick={()=>project&&setSelected(project)}><b>{String(index+1).padStart(2,'0')}</b><strong>{project?.name||activity.event_type.replaceAll('.',' / ')}</strong><span>{activity.message} · {activity.created_at?new Date(activity.created_at).toLocaleString():'Cloud event'}</span></button>}):active.length?active.map((project,index)=><button type=\"button\" key={project.id} onClick={()=>setSelected(project)}><b>{String(index+1).padStart(2,'0')}</b><strong>{project.name}</strong><span>{sourceLabel(project,sourceMap.get(project.id))} · {project.updated||'Unknown update'}</span></button>):<p>{activityState==='error'?'Cloud activity is temporarily unavailable. No local activity is available either.':'No project activity yet.'}</p>}</section>:<><section className=\"section-heading v2-heading\">"
if old not in text: raise SystemExit('activity view anchor missing')
text = text.replace(old, new, 1)
workspace.write_text(text, encoding='utf-8')

storage = root / 'src' / 'services' / 'projectStorage.ts'
text = storage.read_text(encoding='utf-8')
old = "      }, session))\n      .catch(() => undefined)"
new = "      }, session))\n      .then(() => window.dispatchEvent(new CustomEvent('projectx:activity-changed')))\n      .catch(() => undefined)"
if old not in text: raise SystemExit('storage activity anchor missing')
storage.write_text(text.replace(old, new, 1), encoding='utf-8')

readme = root / 'README.md'
text = readme.read_text(encoding='utf-8')
text = text.replace('- Cloud sync is manual and conflict resolution is merge/replace based rather than a true timestamp/tombstone two-way engine.\n- The Activity view is still local/GitHub derived rather than backed by the cloud activity table.\n', '- Cloud project deletions now use durable tombstones and remote-action state changes are database-enforced. Full simultaneous multi-device conflict merging still uses the explicit merge/replace workflow rather than silently guessing.\n- Activity reads the cloud activity table when signed in, refreshes automatically, and falls back to local project state if cloud activity is unavailable.\n')
text = text.replace('- Traffic/performance/runtime-error/cost analytics providers are not yet connected.\n', '- Vercel deployment analytics are connected. Traffic/performance/runtime-error/cost telemetry remains provider-dependent and is intentionally not simulated when no external telemetry service is configured.\n')
readme.write_text(text, encoding='utf-8')

test = root / 'tests' / 'cloud-activity.test.mjs'
test.write_text("""import test from 'node:test'\nimport assert from 'node:assert/strict'\nimport fs from 'node:fs'\n\nconst workspace=fs.readFileSync('src/WorkspaceAppV3.tsx','utf8')\nconst storage=fs.readFileSync('src/services/projectStorage.ts','utf8')\n\ntest('Activity uses cloud events with a local fallback',()=>{\n  assert.match(workspace,/fetchCloudActivity\\(cloudState\\.session,100\\)/)\n  assert.match(workspace,/cloudActivity\\.map/)\n  assert.match(workspace,/LOCAL FALLBACK/)\n})\n\ntest('run and delete activity refresh the cloud-backed Activity view',()=>{\n  assert.match(workspace,/project\\.run\\.succeeded/)\n  assert.match(workspace,/project\\.run\\.failed/)\n  assert.match(storage,/projectx:activity-changed/)\n})\n""", encoding='utf-8')
print('cloud Activity patch applied')
