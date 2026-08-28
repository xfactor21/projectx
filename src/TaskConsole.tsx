import { useEffect, useMemo, useState } from 'react'
import { getDesktopHost } from './services/desktop'
import { persistRunTasks, readRunTasks } from './services/runTasks'
import type { RunStartedDetail, RunTask } from './services/runTasks'
import { errorMessage } from './services/errors'

const PROJECTS_KEY = 'projectx.projects.v1'
function markProjectReady(projectId: string) {
  try {
    const projects = JSON.parse(localStorage.getItem(PROJECTS_KEY) || '[]')
    if (!Array.isArray(projects)) return
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects.map((project) => project?.id === projectId ? { ...project, status: 'Ready', updated: 'Just now' } : project)))
    window.dispatchEvent(new CustomEvent('projectx:projects-changed'))
  } catch { /* Malformed storage is handled by the shared project reader. */ }
}

export default function TaskConsole() {
  const desktop = getDesktopHost()
  const [open, setOpen] = useState(false)
  const [tasks, setTasks] = useState<RunTask[]>(readRunTasks)
  const [message, setMessage] = useState('Processes started by project.X appear here.')
  const running = useMemo(() => tasks.filter((task) => task.pid > 0), [tasks])

  useEffect(() => {
    const onStarted = (event: Event) => {
      const detail = (event as CustomEvent<RunStartedDetail>).detail
      if (!detail?.result?.pid) return
      setTasks(readRunTasks())
      setOpen(true)
      setMessage(`${detail.projectName} is running under project.X process control. Open Preview when you are ready.`)
    }
    window.addEventListener('projectx:run-started', onStarted)
    return () => window.removeEventListener('projectx:run-started', onStarted)
  }, [desktop])

  async function stop(task: RunTask) {
    if (!desktop) return
    setMessage(`Stopping ${task.projectName}…`)
    try {
      const result = await desktop.stopDevProject(task.pid)
      if (!result.ok) throw new Error(result.output || `Unable to stop ${task.projectName}.`)
      setTasks((current) => {
        const next = current.filter((item) => item.pid !== task.pid)
        persistRunTasks(next); return next
      })
      markProjectReady(task.projectId)
      setMessage(result.output || `${task.projectName} stopped.`)
    } catch (error) { setMessage(errorMessage(error, 'Unable to stop that process.')) }
  }

  async function restart(task: RunTask) {
    if (!desktop) return
    setMessage(`Restarting ${task.projectName}…`)
    try {
      const stopped = await desktop.stopDevProject(task.pid)
      if (!stopped.ok) throw new Error(stopped.output || `Unable to stop ${task.projectName}.`)
      const result = await desktop.runDevProject(task.path, task.script)
      if (!result.ok || !result.pid) throw new Error(result.output || `Unable to restart ${task.projectName}.`)
      const nextTask: RunTask = { ...task, id: `${task.projectId}-${result.pid}`, pid: result.pid || 0, url: result.url, logPath: result.logPath, output: result.output, packageManager: result.packageManager, startedAt: new Date().toISOString() }
      setTasks((current) => {
        const next = [nextTask, ...current.filter((item) => item.projectId !== task.projectId)].slice(0, 20)
        persistRunTasks(next); return next
      })
      setMessage(`${task.projectName} restarted. Open its browser preview when you are ready.`)
    } catch (error) { setMessage(errorMessage(error, 'Unable to restart project.')) }
  }

  async function preview(task: RunTask) {
    if (!desktop || !task.url) return
    try { await desktop.openPreviewWindow(task.projectId, task.projectName, task.url, task.pid); setMessage(`${task.projectName} opened in project.X Preview.`) }
    catch (error) { setMessage(errorMessage(error, 'Unable to open project.X Preview.')) }
  }

  function clearHistory() { setTasks([]); persistRunTasks([]); setMessage('Task console cleared.') }

  return <aside className={`task-console ${open ? 'open' : ''}`} aria-label="Running project processes">
    <button className="task-console-toggle" type="button" onClick={() => setOpen((value) => !value)}><strong>RUN</strong><span>{running.length ? `${running.length} ACTIVE` : 'TASKS'}</span></button>
    {open && <div className="task-console-panel">
      <header><div><small>PROCESS + PREVIEW</small><strong>Task console</strong></div><button type="button" onClick={() => setOpen(false)}>×</button></header>
      <p>{message}</p>
      {running.length === 0 ? <div className="task-console-empty"><b>NO PROJECT.X PROCESSES</b><span>Run a local project and project.X will own its dev server until you select Stop Server.</span></div> : <div className="task-list">{running.map((task) => <article key={task.id}>
        <div><i/><span><strong>{task.projectName}</strong><small>{task.packageManager || 'npm'} run {task.script} · PID {task.pid}</small></span></div>
        {task.url && <button type="button" onClick={() => void preview(task)}>{task.url}</button>}
        {task.output && <pre>{task.output}</pre>}
        {task.logPath && <code>{task.logPath}</code>}
        <footer>
          <button type="button" disabled={!desktop || !task.url} onClick={() => void preview(task)}>▣ Open Preview</button>
          <button type="button" disabled={!desktop} onClick={() => void restart(task)}>↺ Restart</button>
          <button type="button" disabled={!desktop} onClick={() => void stop(task)}>■ Stop Server</button>
        </footer>
      </article>)}</div>}
      <button className="task-clear" type="button" disabled={!tasks.length} onClick={clearHistory}>Clear console</button>
      <small className="task-note">project.X owns the dev server. Preview stays inside project.X with reload, external browser and stop controls.</small>
    </div>}
  </aside>
}
