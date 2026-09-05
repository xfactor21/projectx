import { deleteCloudProject, fetchCloudProjects, getFreshSession, upsertCloudProjects } from './supabase'
import type { CloudProject, SupabaseSession } from './supabase'

const PROJECTS_KEY = 'projectx.projects.v1'
const SYNC_STATE_KEY = 'projectx.cloud.sync-state.v2'

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

type SyncSnapshot = {
  localFingerprint: string
  remoteUpdatedAt?: string
}

type SyncState = {
  userId: string
  ids: string[]
  snapshots: Record<string, SyncSnapshot>
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

function comparable(project: CloudProject) {
  const { id: _id, user_id: _userId, created_at: _createdAt, updated_at: _updatedAt, ...rest } = project
  return rest
}

function fingerprint(project: CloudProject) {
  return JSON.stringify(comparable(project))
}

function readSyncState(userId: string): SyncState {
  try {
    const parsed = JSON.parse(localStorage.getItem(SYNC_STATE_KEY) || 'null') as SyncState | null
    if (parsed?.userId === userId && Array.isArray(parsed.ids) && parsed.snapshots && typeof parsed.snapshots === 'object') return parsed
  } catch { /* ignore malformed sync state */ }
  return { userId, ids: [], snapshots: {} }
}

function writeSyncState(state: SyncState) {
  localStorage.setItem(SYNC_STATE_KEY, JSON.stringify(state))
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
  const remote = await fetchCloudProjects(active)
  const remoteById = new Map(remote.map((project) => [project.client_id, project]))
  const previous = readSyncState(active.user.id)
  const currentIds = new Set(payload.map((project) => project.client_id))
  const conflicts: string[] = []
  const safeUpserts: CloudProject[] = []

  for (const project of payload) {
    const prior = previous.snapshots[project.client_id]
    const currentRemote = remoteById.get(project.client_id)
    const localChanged = !prior || prior.localFingerprint !== fingerprint(project)
    const remoteChanged = Boolean(prior && currentRemote && prior.remoteUpdatedAt && currentRemote.updated_at && prior.remoteUpdatedAt !== currentRemote.updated_at)
    if (localChanged && remoteChanged) {
      conflicts.push(project.client_id)
      continue
    }
    safeUpserts.push(project)
  }

  if (safeUpserts.length) await upsertCloudProjects(safeUpserts, active)

  const deletedIds = previous.ids.filter((id) => !currentIds.has(id))
  for (const id of deletedIds) await deleteCloudProject(id, active)

  const refreshed = await fetchCloudProjects(active)
  const refreshedById = new Map(refreshed.map((project) => [project.client_id, project]))
  const snapshots: Record<string, SyncSnapshot> = {}
  for (const project of payload) {
    const currentRemote = refreshedById.get(project.client_id)
    snapshots[project.client_id] = {
      localFingerprint: fingerprint(project),
      remoteUpdatedAt: currentRemote?.updated_at,
    }
  }
  writeSyncState({ userId: active.user.id, ids: [...currentIds], snapshots })

  return { session: active, count: safeUpserts.length, deletedCount: deletedIds.length, conflicts }
}
