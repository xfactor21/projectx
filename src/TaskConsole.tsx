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
        const next = [task, ...current.filter((item) => item.projectId !== task.projectId)].slice(0, 20)
        persist(next); return next
      })
      setOpen(true)
      setMessage(`${detail.projectName} is running under project.X process control.`)
      if (desktop && task.url) void desktop.openPreviewWindow(task.projectId, task.projectName, task.url).catch(() => undefined)
    }
    window.addEventListener('projectx:run-started', onStarted)
    return () => window.removeEventListener('projectx:run-started', onStarted)
  }, [desktop])

  async function stop(task: RunTask, closePreview = true) {
    if (!desktop) return
    setMessage(`Stopping ${task.projectName}…`)
    try {
      const result = await desktop.stopDevProject(task.pid)
      if (closePreview) await desktop.closePreviewWindow(task.projectId).catch(() => undefined)
      setTasks((current) => {
        const next = current.filter((item) => item.pid !== task.pid)
        persist(next); return next
      })
      setMessage(result.output || `${task.projectName} stopped.`)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to stop that process.') }
  }

  async function restart(task: RunTask) {
    if (!desktop) return
    setMessage(`Restarting ${task.projectName}…`)
    try {
      await desktop.stopDevProject(task.pid)
      const result = await desktop.runDevProject(task.path, task.script)
      const nextTask: RunTask = { ...task, id: `${task.projectId}-${result.pid}`, pid: result.pid || 0, url: result.url, logPath: result.logPath, output: result.output, packageManager: result.packageManager, startedAt: new Date().toISOString() }
      setTasks((current) => {
        const next = [nextTask, ...current.filter((item) => item.projectId !== task.projectId)].slice(0, 20)
        persist(next); return next
      })
      if (result.url) await desktop.openPreviewWindow(task.projectId, task.projectName, result.url)
      setMessage(`${task.projectName} restarted${result.url ? ' in Preview.' : '.'}`)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to restart project.') }
  }

  async function preview(task: RunTask) {
    if (!desktop || !task.url) return
    try { await desktop.openPreviewWindow(task.projectId, task.projectName, task.url); setMessage(`${task.projectName} Preview opened.`) }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to open Preview.') }
  }

  async function reload(task: RunTask) {
    if (!desktop) return
    try { await desktop.reloadPreviewWindow(task.projectId); setMessage(`${task.projectName} Preview reloaded.`) }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to reload Preview.') }
  }

  function clearHistory() { setTasks([]); persist([]); setMessage('Task console cleared.') }

  return <aside className={`task-console ${open ? 'open' : ''}`} aria-label="Running project processes">
    <button className="task-console-toggle" type="button" onClick={() => setOpen((value) => !value)}><strong>RUN</strong><span>{running.length ? `${running.length} ACTIVE` : 'TASKS'}</span></button>
    {open && <div className="task-console-panel">
      <header><div><small>PROCESS + PREVIEW</small><strong>Task console</strong></div><button type="button" onClick={() => setOpen(false)}>×</button></header>
      <p>{message}</p>
      {running.length === 0 ? <div className="task-console-empty"><b>NO PROJECT.X PROCESSES</b><span>Run a local project and project.X will own its dev server and Preview window.</span></div> : <div className="task-list">{running.map((task) => <article key={task.id}>
        <div><i/><span><strong>{task.projectName}</strong><small>{task.packageManager || 'npm'} run {task.script} · PID {task.pid}</small></span></div>
        {task.url && <button type="button" onClick={() => void preview(task)}>{task.url}</button>}
        {task.output && <pre>{task.output}</pre>}
        {task.logPath && <code>{task.logPath}</code>}
        <footer>
          <button type="button" disabled={!desktop || !task.url} onClick={() => void preview(task)}>▣ Preview</button>
          <button type="button" disabled={!desktop || !task.url} onClick={() => void reload(task)}>↻ Reload</button>
          <button type="button" disabled={!desktop} onClick={() => void restart(task)}>↺ Restart</button>
          <button type="button" disabled={!task.url} onClick={() => task.url && window.open(task.url, '_blank', 'noopener,noreferrer')}>↗ External</button>
          <button type="button" disabled={!desktop} onClick={() => void stop(task)}>■ Stop</button>
        </footer>
      </article>)}</div>}
      <button className="task-clear" type="button" disabled={!tasks.length} onClick={clearHistory}>Clear console</button>
      <small className="task-note">Preview windows are owned by project.X. External browser launch is optional.</small>
    </div>}
  </aside>
}
