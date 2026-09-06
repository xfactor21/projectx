import { fetchCloudProjectsIncludingDeleted, getFreshSession, upsertCloudProjects } from './supabase'
import type { CloudProject, SupabaseSession } from './supabase'

const PROJECTS_KEY = 'projectx.projects.v1'

type LocalProject = {
  id: string
  name?: string
  kicker?: string
  description?: string
  status?: string
  stack?: unknown
  accent?: string
  progress?: number
  favorite?: boolean
  archived?: boolean
  repoUrl?: string
  liveUrl?: string
  coverUrl?: string
  notes?: string
  github?: unknown
  updated?: string
}

function readProjects(): LocalProject[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(PROJECTS_KEY) || '[]')
    return Array.isArray(parsed) ? parsed.filter((project) => project && typeof project.id === 'string' && typeof project.name === 'string') : []
  } catch { return [] }
}

function writeProjects(projects: LocalProject[]) {
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects))
  window.dispatchEvent(new CustomEvent('projectx:projects-changed'))
}

function lifecycleStatus(status?: string): CloudProject['status'] {
  return status === 'Live' || status === 'Concept' || status === 'Paused' ? status : 'Building'
}

function portableCover(value?: string) {
  return value && /^https:\/\//i.test(value) ? value : ''
}

function cloudToLocal(project: CloudProject): LocalProject {
  return {
    id: project.client_id,
    name: project.name,
    kicker: project.kicker || '',
    description: project.description || '',
    status: project.status || 'Building',
    stack: Array.isArray(project.stack) ? project.stack : [],
    accent: project.accent || 'pink',
    progress: Number.isFinite(project.progress) ? project.progress : 0,
    favorite: Boolean(project.favorite),
    archived: Boolean(project.archived),
    repoUrl: project.repo_url || '',
    liveUrl: project.live_url || '',
    coverUrl: project.cover_url || '',
    notes: project.notes || '',
    github: project.github || undefined,
    updated: project.updated_at ? new Date(project.updated_at).toLocaleString() : 'Cloud',
  }
}

export function cloudProjectPayload(session: SupabaseSession) {
  return readProjects().map((project, index): CloudProject => ({
    user_id: session.user.id,
    client_id: project.id,
    name: project.name || 'Untitled project',
    kicker: project.kicker || '',
    description: project.description || '',
    status: lifecycleStatus(project.status),
    stack: Array.isArray(project.stack) ? project.stack : [],
    accent: project.accent === 'cyan' || project.accent === 'violet' ? project.accent : 'pink',
    progress: Number.isFinite(project.progress) ? project.progress : 0,
    favorite: Boolean(project.favorite),
    archived: Boolean(project.archived),
    repo_url: project.repoUrl || '',
    live_url: project.liveUrl || '',
    cover_url: portableCover(project.coverUrl),
    notes: project.notes || '',
    github: project.github || null,
    sort_order: index,
  }))
}

export function projectInventorySignature() {
  return JSON.stringify(cloudProjectPayload({ user: { id: '' }, access_token: '' }).map(({ user_id: _userId, ...project }) => project))
}

export async function reconcileCloudProjectInventory(session?: SupabaseSession | null) {
  const active = await getFreshSession(session)
  if (!active) throw new Error('Sign in to project.X Cloud before connecting Companion.')

  const cloud = await fetchCloudProjectsIncludingDeleted(active)
  const tombstones = new Set(cloud.filter((project) => project.deleted_at).map((project) => project.client_id))
  const activeCloud = cloud.filter((project) => !project.deleted_at)
  const local = readProjects().filter((project) => !tombstones.has(project.id))
  const merged = [...local]
  let changed = merged.length !== readProjects().length

  for (const incoming of activeCloud) {
    const index = merged.findIndex((project) => project.id === incoming.client_id || (incoming.repo_url && project.repoUrl === incoming.repo_url))
    if (index < 0) {
      merged.push(cloudToLocal(incoming))
      changed = true
    }
  }

  if (changed) writeProjects(merged)
  return { session: active, cloudCount: activeCloud.length, localCount: merged.length, changed }
}

export async function syncLocalProjects(session?: SupabaseSession | null) {
  const active = await getFreshSession(session)
  if (!active) throw new Error('Sign in to project.X Cloud before connecting Companion.')
  const payload = cloudProjectPayload(active)
  if (payload.length) await upsertCloudProjects(payload, active)
  return { session: active, count: payload.length }
}
