import { useEffect, useState } from 'react'
import type { DesktopHostBridge, GitHistoryEntry } from './services/desktop'

type Task = { id: string; text: string; done: boolean; createdAt: string }
type Event = { id: string; text: string; at: string }
type WorkbookData = { note: string; tasks: Task[]; events: Event[]; updatedAt: string }
type Tab = 'tasks'|'notes'|'history'

const key = (id:string) => 'projectx.workbook.'+id
const uid = () => String(Date.now())+'-'+Math.random().toString(36).slice(2,7)
const blank = ():WorkbookData => ({note:'',tasks:[],events:[],updatedAt:new Date().toISOString()})
function load(id:string):WorkbookData {
  try{
    const record=JSON.parse(localStorage.getItem(key(id))||'{}')
    return {
      note:typeof record.note==='string'?record.note:'',
      tasks:Array.isArray(record.tasks)?record.tasks.filter((item:unknown)=>typeof item==='string'||(item!==null&&typeof item==='object')).map((item:string|Task)=>typeof item==='string'?{id:uid(),text:item,done:false,createdAt:new Date().toISOString()}:item).filter((task:Task)=>typeof task.text==='string'):[],
      events:Array.isArray(record.events)?record.events.filter((item:Event)=>typeof item.text==='string'):[],
      updatedAt:typeof record.updatedAt==='string'?record.updatedAt:new Date().toISOString()
    }
  }catch{return blank()}
}
export default function ProjectWorkbook({projectId,projectName,path,desktop}:{projectId:string;projectName:string;path?:string;desktop:DesktopHostBridge|null}){
  const [data,setData]=useState<WorkbookData>(()=>load(projectId))
  const [tab,setTab]=useState<Tab>('tasks')
  const [taskText,setTaskText]=useState('')
  const [filter,setFilter]=useState<'pending'|'all'|'done'>('pending')
  const [commits,setCommits]=useState<GitHistoryEntry[]>([])
  const [historyStatus,setHistoryStatus]=useState('')
  const [notice,setNotice]=useState('')
  useEffect(()=>{setData(load(projectId));setTab('tasks');setCommits([]);setNotice('')},[projectId])
  useEffect(()=>{try{localStorage.setItem(key(projectId),JSON.stringify(data))}catch{setNotice('Local storage is full. Export a copy before closing.') }},[projectId,data])
  useEffect(()=>{
    if(!desktop||!path){setHistoryStatus('Connect a local Git repository to display its commit history.');return}
    let cancelled=false
    setHistoryStatus('Reading local Git history…')
    void desktop.gitHistory(path).then(rows=>{if(!cancelled){setCommits(rows);setHistoryStatus(rows.length?'':'No commits found in this repository.')}}).catch(error=>{if(!cancelled)setHistoryStatus(error instanceof Error?error.message:'Git history unavailable.')})
    return()=>{cancelled=true}
  },[desktop,path])
  function update(next:WorkbookData){setData({...next,updatedAt:new Date().toISOString()})}
  function event(text:string,base=data):WorkbookData{return {...base,events:[{id:uid(),text,at:new Date().toISOString()},...base.events].slice(0,100)}}
  function addTask(){
    const text=taskText.trim()
    if(!text)return
    const task={id:uid(),text,done:false,createdAt:new Date().toISOString()}
    update(event('Added task: '+text,{...data,tasks:[...data.tasks,task]}))
    setTaskText('')
  }
  function toggleTask(id:string){const task=data.tasks.find(item=>item.id===id);if(!task)return;update(event((task.done?'Reopened: ':'Completed: ')+task.text,{...data,tasks:data.tasks.map(item=>item.id===id?{...item,done:!item.done}:item)}))}
  function removeTask(id:string){const task=data.tasks.find(item=>item.id===id);if(!task||!window.confirm('Remove this task from the Workbook?'))return;update(event('Removed task: '+task.text,{...data,tasks:data.tasks.filter(item=>item.id!==id)}))}
  const tasks=data.tasks.filter(task=>filter==='all'||(filter==='pending'?!task.done:task.done))
  const pending=data.tasks.filter(task=>!task.done).length
  async function exportCopy(){try{await navigator.clipboard.writeText(JSON.stringify({projectId,projectName,...data},null,2));setNotice('Workbook JSON copied to clipboard.')}catch{setNotice('Clipboard unavailable. Use manual backup in Control Center.')}}

  return <div className="workbook-v304">
    <header className="workbook-summary"><div><small>PROJECT WORKBOOK</small><strong>{pending} open tasks</strong><span>{data.tasks.length} total · saved on this device</span></div><button type="button" onClick={()=>void exportCopy()}>Copy backup</button></header>
    <nav aria-label="Workbook sections">{(['tasks','notes','history'] as Tab[]).map(item=><button key={item} type="button" className={tab===item?'active':''} aria-current={tab===item?'page':undefined} onClick={()=>setTab(item)}>{item==='tasks'?'Tasks':item==='notes'?'Notes':'History'}</button>)}</nav>
    {tab==='tasks'&&<section className="workbook-pane"><form onSubmit={e=>{e.preventDefault();addTask()}}><input value={taskText} onChange={e=>setTaskText(e.target.value)} placeholder="What needs to get done?" aria-label="New project task" /><button type="submit" disabled={!taskText.trim()}>Add task</button></form><div className="workbook-filters">{(['pending','all','done'] as const).map(item=><button key={item} type="button" className={filter===item?'active':''} onClick={()=>setFilter(item)}>{item==='pending'?'Remaining':item==='done'?'Completed':'All'}</button>)}</div><div className="workbook-task-list">{tasks.length?tasks.map(task=><div key={task.id} className={task.done?'done':''}><label><input type="checkbox" checked={task.done} onChange={()=>toggleTask(task.id)}/><span>{task.text}</span></label><button type="button" onClick={()=>removeTask(task.id)} aria-label={'Delete '+task.text}>×</button></div>):<p>{filter==='pending'?'All caught up. Add the next action above.':'No tasks in this view.'}</p>}</div></section>}
    {tab==='notes'&&<section className="workbook-pane"><label htmlFor={'workbook-notes-'+projectId}>Project notes</label><textarea id={'workbook-notes-'+projectId} rows={9} value={data.note} onChange={e=>update({...data,note:e.target.value})} onBlur={()=>{if(data.note.trim())update(event('Edited project notes.'))}} placeholder="Write decisions, specifications, discoveries and ideas…"/><p>Autosaved locally. Include important decisions and next steps here.</p></section>}
    {tab==='history'&&<section className="workbook-pane workbook-history"><h3>Git commit history</h3>{commits.length?commits.map(row=><article key={row.hash+'-'+row.date}><b>{row.hash}</b><span>{row.subject}</span><small>{row.date}</small></article>):<p>{historyStatus||'No local Git history.'}</p>}<h3>Workbook activity</h3>{data.events.length?data.events.map(row=><article key={row.id}><span>{row.text}</span><small>{new Date(row.at).toLocaleString()}</small></article>):<p>Task and note changes will appear here.</p>}</section>}
    {notice&&<p className="workbook-notice" role="status">{notice}</p>}
  </div>
}
