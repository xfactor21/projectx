import { getFreshSession, upsertCloudProjects } from './supabase'
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
}

function readProjects(): LocalProject[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(PROJECTS_KEY) || '[]')
    return Array.isArray(parsed) ? parsed.filter((project) => project && typeof project.id === 'string' && typeof project.name === 'string') : []
  } catch { return [] }
}

function lifecycleStatus(status?: string): CloudProject['status'] {
  return status === 'Live' || status === 'Concept' || status === 'Paused' ? status : 'Building'
}

function portableCover(value?: string) {
  return value && /^https:\/\//i.test(value) ? value : ''
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

export async function syncLocalProjects(session?: SupabaseSession | null) {
  const active = await getFreshSession(session)
  if (!active) throw new Error('Sign in to project.X Cloud before connecting Companion.')
  const payload = cloudProjectPayload(active)
  if (payload.length) await upsertCloudProjects(payload, active)
  return { session: active, count: payload.length }
}
