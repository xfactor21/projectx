import type { ProjectRunResult } from './desktop'

const KEY = 'projectx.running.tasks.v1'

export type RunTask = {
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

export type RunStartedDetail = { projectId: string; projectName: string; path: string; result: ProjectRunResult }

export function readRunTasks(): RunTask[] {
  try { const value = JSON.parse(sessionStorage.getItem(KEY) || '[]'); return Array.isArray(value) ? value : [] }
  catch { return [] }
}

export function persistRunTasks(tasks: RunTask[]) { sessionStorage.setItem(KEY, JSON.stringify(tasks)) }

export function recordRunTask(detail: RunStartedDetail) {
  if (!detail.result.pid) return
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
  persistRunTasks([task, ...readRunTasks().filter((item) => item.projectId !== task.projectId)].slice(0, 20))
  window.dispatchEvent(new CustomEvent('projectx:run-started', { detail }))
}
