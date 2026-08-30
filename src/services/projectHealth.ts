import type { DesktopProjectSummary } from './desktop'

export type BuildHealthState = 'unknown' | 'checking' | 'ready' | 'error'
export type DeploymentHealthState = 'unlinked' | 'checking' | 'online' | 'offline' | 'error'

export type DeploymentLink = {
  provider: 'vercel'
  projectName: string
  deploymentId?: string
  url?: string
}

export type ProjectHealth = {
  build: { state: BuildHealthState; detail: string; checkedAt?: string; runUrl?: string }
  deployment: { state: DeploymentHealthState; detail: string; checkedAt?: string; link?: DeploymentLink }
}

export const PROJECT_HEALTH_KEY = 'projectx.project.health.v1'
export const PROJECT_HEALTH_EVENT = 'projectx:project-health-changed'

const unknownHealth = (): ProjectHealth => ({
  build: { state: 'unknown', detail: 'Run readiness has not been checked.' },
  deployment: { state: 'unlinked', detail: 'No deployment is linked.' },
})

export function readProjectHealth(): Record<string, ProjectHealth> {
  try {
    const parsed = JSON.parse(localStorage.getItem(PROJECT_HEALTH_KEY) || '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, ProjectHealth] => {
      const value = entry[1] as Partial<ProjectHealth> | null
      return Boolean(value?.build && typeof value.build.state === 'string' && typeof value.build.detail === 'string' && value.deployment && typeof value.deployment.state === 'string' && typeof value.deployment.detail === 'string')
    }))
  } catch { return {} }
}

export function healthFor(projectId: string, map = readProjectHealth()): ProjectHealth {
  return map[projectId] || unknownHealth()
}

export function writeProjectHealth(projectId: string, update: Partial<ProjectHealth>): ProjectHealth {
  const map = readProjectHealth()
  const current = healthFor(projectId, map)
  const next = {
    build: { ...current.build, ...(update.build || {}) },
    deployment: { ...current.deployment, ...(update.deployment || {}) },
  }
  map[projectId] = next
  localStorage.setItem(PROJECT_HEALTH_KEY, JSON.stringify(map))
  window.dispatchEvent(new CustomEvent(PROJECT_HEALTH_EVENT, { detail: { projectId, health: next } }))
  return next
}

export function removeProjectHealth(projectId: string): void {
  const map = readProjectHealth()
  delete map[projectId]
  localStorage.setItem(PROJECT_HEALTH_KEY, JSON.stringify(map))
  window.dispatchEvent(new CustomEvent(PROJECT_HEALTH_EVENT, { detail: { projectId } }))
}

export function buildHealthFromInspection(summary: DesktopProjectSummary): ProjectHealth['build'] {
  return {
    state: summary.runReady ? 'ready' : 'error',
    detail: summary.readinessDetail || (summary.runReady ? 'Ready to run.' : 'Project is not ready to run.'),
    checkedAt: new Date().toISOString(),
  }
}

export function deploymentState(state: string): DeploymentHealthState {
  const normalized = state.toUpperCase()
  if (['READY', 'SUCCEEDED', 'SUCCESS'].includes(normalized)) return 'online'
  if (['ERROR', 'FAILED', 'CANCELED'].includes(normalized)) return 'error'
  return 'offline'
}
