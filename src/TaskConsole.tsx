import { useEffect, useMemo, useState } from 'react'
import { getDesktopHost } from './services/desktop'
import type { ProjectRunResult } from './services/desktop'

const KEY = 'projectx.running.tasks.v1'

type RunTask = {
  id: string
  projectId: string
  projectName: string
  path: string
  pid: number
  script: string
  packageManager?: string
  url?: string
  logPath?: string
  output?: string
  startedAt: string
}

type RunStartedDetail = { projectId: string; projectName: string; path: string; result: ProjectRunResult }

function readTasks(): RunTask[] {
  try { const value = JSON.parse(sessionStorage.getItem(KEY) || '[]'); return Array.isArray(value) ? value : [] }
  catch { return [] }
}

function persist(tasks: RunTask[]) { sessionStorage.setItem(KEY, JSON.stringify(tasks)) }

export default function TaskConsole() {
  const desktop = getDesktopHost()
  const [open, setOpen] = useState(false)
  const [tasks, setTasks] = useState<RunTask[]>(readTasks)
  const [message, setMessage] = useState('Processes started by project.X appear here.')
  const running = useMemo(() => tasks.filter((task) => task.pid > 0), [tasks])

  useEffect(() => {
    const onStarted = (event: Event) => {
      const detail = (event as CustomEvent<RunStartedDetail>).detail
      if (!detail?.result?.pid) return
      const task: RunTask = {
        id: `${detail.projectId}-${detail.result.pid}`,
        projectId: detail.projectId,
        projectName: detail.projectName,
        path: detail.path,
        pid: detail.result.pid,
        script: detail.result.script,
        packageManager: detail.result.packageManager,
        url: detail.result.url,
        logPath: detail.result.logPath,
        output: detail.result.output,
        startedAt: new Date().toISOString(),
      }
      setTasks((current) => {
        const next = [task, ...current.filter((item) => item.pid !== task.pid)].slice(0, 20)
        persist(next); return next
      })
      setOpen(true)
      setMessage(`${detail.projectName} is running under project.X process control.`)
    }
    window.addEventListener('projectx:run-started', onStarted)
    return () => window.removeEventListener('projectx:run-started', onStarted)
  }, [])

  async function stop(task: RunTask) {
    if (!desktop) return
    setMessage(`Stopping ${task.projectName}…`)
    try {
      const result = await desktop.stopDevProject(task.pid)
      setTasks((current) => {
        const next = current.filter((item) => item.pid !== task.pid)
        persist(next); return next
      })
      setMessage(result.output || `${task.projectName} stopped.`)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to stop that process.') }
  }

  function clearHistory() { setTasks([]); persist([]); setMessage('Task console cleared.') }

  return <aside className={`task-console ${open ? 'open' : ''}`} aria-label="Running project processes">
    <button className="task-console-toggle" type="button" onClick={() => setOpen((value) => !value)}><strong>RUN</strong><span>{running.length ? `${running.length} ACTIVE` : 'TASKS'}</span></button>
    {open && <div className="task-console-panel">
      <header><div><small>PROCESS OWNERSHIP</small><strong>Task console</strong></div><button type="button" onClick={() => setOpen(false)}>×</button></header>
      <p>{message}</p>
      {running.length === 0 ? <div className="task-console-empty"><b>NO PROJECT.X PROCESSES</b><span>Use Run on a local project. project.X will own the PID and can stop the whole process tree.</span></div> : <div className="task-list">{running.map((task) => <article key={task.id}>
        <div><i/><span><strong>{task.projectName}</strong><small>{task.packageManager || 'npm'} run {task.script} · PID {task.pid}</small></span></div>
        {task.url && <button type="button" onClick={() => window.open(task.url, '_blank', 'noopener')}>{task.url}</button>}
        {task.output && <pre>{task.output}</pre>}
        {task.logPath && <code>{task.logPath}</code>}
        <footer><button type="button" disabled={!desktop} onClick={() => void stop(task)}>■ Stop process</button></footer>
      </article>)}</div>}
      <button className="task-clear" type="button" disabled={!tasks.length} onClick={clearHistory}>Clear console</button>
      <small className="task-note">Only processes launched by project.X during this desktop session can be terminated here.</small>
    </div>}
  </aside>
}
