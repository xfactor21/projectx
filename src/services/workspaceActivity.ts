import { appendCloudActivity, fetchCloudActivity, loadSession } from './supabase'

const KEY = 'projectx.activity.v2'
const EVENT = 'projectx:activity-changed'
const MAX_ITEMS = 200

export type WorkspaceActivityEvent = {
  id: string
  projectId?: string | null
  type: string
  message: string
  metadata?: Record<string, unknown>
  createdAt: string
  source: 'local' | 'cloud'
}

function normalize(value: unknown): WorkspaceActivityEvent[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is WorkspaceActivityEvent => Boolean(
    item && typeof item === 'object' &&
    typeof (item as WorkspaceActivityEvent).id === 'string' &&
    typeof (item as WorkspaceActivityEvent).type === 'string' &&
    typeof (item as WorkspaceActivityEvent).message === 'string' &&
    typeof (item as WorkspaceActivityEvent).createdAt === 'string',
  ))
}

export function readWorkspaceActivity(): WorkspaceActivityEvent[] {
  try { return normalize(JSON.parse(localStorage.getItem(KEY) || '[]')).slice(0, MAX_ITEMS) }
  catch { return [] }
}

function persist(items: WorkspaceActivityEvent[]) {
  localStorage.setItem(KEY, JSON.stringify(items.slice(0, MAX_ITEMS)))
  window.dispatchEvent(new CustomEvent(EVENT))
}

export function recordWorkspaceActivity(input: {
  projectId?: string | null
  type: string
  message: string
  metadata?: Record<string, unknown>
}) {
  const item: WorkspaceActivityEvent = {
    id: `local-${crypto.randomUUID()}`,
    projectId: input.projectId || null,
    type: input.type,
    message: input.message,
    metadata: input.metadata || {},
    createdAt: new Date().toISOString(),
    source: 'local',
  }
  persist([item, ...readWorkspaceActivity().filter((existing) => existing.id !== item.id)])

  const session = loadSession()
  if (session) {
    void appendCloudActivity({
      project_client_id: input.projectId || null,
      event_type: input.type,
      message: input.message,
      metadata: input.metadata || {},
    }, session).catch(() => undefined)
  }
  return item
}

export async function refreshWorkspaceActivity(): Promise<WorkspaceActivityEvent[]> {
  const local = readWorkspaceActivity()
  const session = loadSession()
  if (!session) return local
  try {
    const cloud = await fetchCloudActivity(session, MAX_ITEMS)
    const cloudItems: WorkspaceActivityEvent[] = cloud.map((item) => ({
      id: `cloud-${item.id || `${item.created_at || ''}-${item.event_type}`}`,
      projectId: item.project_client_id || null,
      type: item.event_type,
      message: item.message,
      metadata: item.metadata || {},
      createdAt: item.created_at || new Date(0).toISOString(),
      source: 'cloud',
    }))
    const merged = new Map<string, WorkspaceActivityEvent>()
    for (const item of [...cloudItems, ...local]) merged.set(item.id, item)
    const sorted = [...merged.values()].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, MAX_ITEMS)
    persist(sorted)
    return sorted
  } catch {
    return local
  }
}

export const WORKSPACE_ACTIVITY_EVENT = EVENT
