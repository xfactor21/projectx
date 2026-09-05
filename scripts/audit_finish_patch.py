from pathlib import Path
import re


def ensure_replace(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f'missing expected text for {label}: {old[:100]!r}')
    return text.replace(old, new)


# Mobile approval must prove it is the device that requested the action.
p = Path('src/CompanionApp.tsx')
text = p.read_text(encoding='utf-8')
old = "await updateRemoteAction(action.id, 'approved')"
new = "await updateRemoteAction(action.id, 'approved', undefined, deviceId())"
if old in text:
    text = text.replace(old, new)
if text.count(new) < 2:
    raise SystemExit(f'expected at least two device-bound mobile approval calls, found {text.count(new)}')
p.write_text(text, encoding='utf-8')

# Windows execution transitions must prove the target desktop device identity.
p = Path('src/CompanionDesktopWorker.tsx')
text = p.read_text(encoding='utf-8')
if "import { recordWorkspaceActivity } from './services/workspaceActivity'" not in text:
    text = text.replace("import { recordRunTask } from './services/runTasks'", "import { recordRunTask } from './services/runTasks'\nimport { recordWorkspaceActivity } from './services/workspaceActivity'")
text = text.replace("await updateRemoteAction(action.id, 'running')", "await updateRemoteAction(action.id, 'running', undefined, desktopDeviceId())")
text = re.sub(
    r"await updateRemoteAction\(action\.id, 'running', (\{[^\n]*\})\)(?!, desktopDeviceId\(\))",
    r"await updateRemoteAction(action.id, 'running', \1, desktopDeviceId())",
    text,
)
text = re.sub(
    r"await updateRemoteAction\(action\.id, 'succeeded', (\{[^\n]*\})\)(?!, desktopDeviceId\(\))",
    r"await updateRemoteAction(action.id, 'succeeded', \1, desktopDeviceId())",
    text,
)
text = re.sub(
    r"await updateRemoteAction\(action\.id, 'failed', (\{[^\n]*\})\)(?!, desktopDeviceId\(\))",
    r"await updateRemoteAction(action.id, 'failed', \1, desktopDeviceId())",
    text,
)
old = "publishHostStatus('connecting', `Synced ${synced.count} project records.`, synced.count)"
new = "publishHostStatus('connecting', synced.conflicts.length ? `Synced ${synced.count} project records; ${synced.conflicts.length} conflict${synced.conflicts.length === 1 ? '' : 's'} need review.` : `Synced ${synced.count} project records${synced.deletedCount ? `; removed ${synced.deletedCount} stale cloud record${synced.deletedCount === 1 ? '' : 's'}` : ''}.`, synced.count)"
if old in text:
    text = text.replace(old, new)
if new not in text:
    raise SystemExit('missing hardened cloud sync status line')

success_line = "    await updateRemoteAction(action.id, 'succeeded', { result: requireSuccessfulResult(result) ?? null }, desktopDeviceId())"
if success_line in text and "type: `companion.${action.action_type}.succeeded`" not in text:
    text = text.replace(success_line, success_line + "\n    recordWorkspaceActivity({ projectId: action.project_client_id || null, type: `companion.${action.action_type}.succeeded`, message: `${actionLabelForActivity(action.action_type)} completed on Windows.`, metadata: { actionId: action.id } })")

failure_line = "    await updateRemoteAction(action.id, 'failed', { error: errorMessage(error) }, desktopDeviceId())"
if failure_line in text and "type: `companion.${action.action_type}.failed`" not in text:
    text = text.replace(failure_line, failure_line + "\n    recordWorkspaceActivity({ projectId: action.project_client_id || null, type: `companion.${action.action_type}.failed`, message: `${actionLabelForActivity(action.action_type)} failed on Windows: ${errorMessage(error)}`, metadata: { actionId: action.id } })")

if "function actionLabelForActivity" not in text:
    marker = "function preferredRunScript(scripts: string[] = []) {\n  return ['dev', 'web', 'start', 'serve'].find((script) => scripts.includes(script)) || ''\n}\n"
    helper = marker + "\nfunction actionLabelForActivity(actionType: string) {\n  return actionType.replace(/[._]/g, ' ').replace(/\\b\\w/g, (value) => value.toUpperCase())\n}\n"
    if marker not in text:
        raise SystemExit('missing preferredRunScript marker')
    text = text.replace(marker, helper)
p.write_text(text, encoding='utf-8')

# Replace the fake project-state Activity screen with a real local + cloud event timeline.
p = Path('src/WorkspaceAppV3.tsx')
text = p.read_text(encoding='utf-8')
activity_import = "import { readWorkspaceActivity, recordWorkspaceActivity, refreshWorkspaceActivity, WORKSPACE_ACTIVITY_EVENT } from './services/workspaceActivity'"
if activity_import not in text:
    text = text.replace("import { openHostedLink } from './services/externalLinks'", "import { openHostedLink } from './services/externalLinks'\n" + activity_import)
state_marker = "  const [healthMap,setHealthMap]=useState<Record<string,ProjectHealth>>(()=>readProjectHealth())"
activity_state = state_marker + "\n  const [activity,setActivity]=useState(()=>readWorkspaceActivity())"
if "const [activity,setActivity]" not in text:
    if state_marker not in text:
        raise SystemExit('missing Workspace activity state marker')
    text = text.replace(state_marker, activity_state)
health_effect = "  useEffect(()=>{const refresh=()=>setHealthMap(readProjectHealth());window.addEventListener(PROJECT_HEALTH_EVENT,refresh);return()=>window.removeEventListener(PROJECT_HEALTH_EVENT,refresh)},[])"
activity_effect = health_effect + "\n  useEffect(()=>{let cancelled=false;const onChange=()=>setActivity(readWorkspaceActivity());window.addEventListener(WORKSPACE_ACTIVITY_EVENT,onChange);void refreshWorkspaceActivity().then((items)=>{if(!cancelled)setActivity(items)});return()=>{cancelled=true;window.removeEventListener(WORKSPACE_ACTIVITY_EVENT,onChange)}},[cloudState.session])"
if "refreshWorkspaceActivity().then" not in text:
    if health_effect not in text:
        raise SystemExit('missing Workspace health effect marker')
    text = text.replace(health_effect, activity_effect)
delete_old = "    deleteProjectAndLocalSource(project.id);setSelected(null);setStatus(`${project.name} was removed from project.X. Local files were not deleted.`)"
delete_new = "    recordWorkspaceActivity({projectId:project.id,type:'project.record.deleted',message:`${project.name} removed from project.X.`});deleteProjectAndLocalSource(project.id);setSelected(null);setStatus(`${project.name} was removed from project.X. Local files were not deleted.`)"
if delete_old in text:
    text = text.replace(delete_old, delete_new)
if delete_new not in text:
    raise SystemExit('missing activity-aware delete flow')
old_activity = "{nav==='Activity'?<section className=\"v2-activity\"><div className=\"section-heading\"><div><p className=\"eyebrow\">RECENT STATE</p><h3>Workspace activity</h3></div></div>{active.length?active.map((project,index)=><button type=\"button\" key={project.id} onClick={()=>setSelected(project)}><b>{String(index+1).padStart(2,'0')}</b><strong>{project.name}</strong><span>{sourceLabel(project,sourceMap.get(project.id))} · {project.updated||'Unknown update'}</span></button>):<p>No project activity yet.</p>}</section>:<>"
new_activity = "{nav==='Activity'?<section className=\"v2-activity\"><div className=\"section-heading\"><div><p className=\"eyebrow\">RECENT EVENTS</p><h3>Workspace activity</h3></div><span className=\"result-count\">{activity.length} EVENTS</span></div>{activity.length?activity.slice(0,80).map((item,index)=>{const project=item.projectId?projects.find((candidate)=>candidate.id===item.projectId):undefined;return <button type=\"button\" key={item.id} onClick={()=>project&&setSelected(project)} disabled={!project}><b>{String(index+1).padStart(2,'0')}</b><strong>{item.message}</strong><span>{item.type} · {new Date(item.createdAt).toLocaleString()} · {item.source.toUpperCase()}</span></button>}):<p>No recorded project activity yet. Run, import, sync, deploy, or control a project to populate this timeline.</p>}</section>:<>"
if old_activity in text:
    text = text.replace(old_activity, new_activity)
if new_activity not in text:
    raise SystemExit('missing real Activity timeline replacement')
p.write_text(text, encoding='utf-8')
