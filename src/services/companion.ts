import { getSupabasePublishableKey, getSupabaseUrl, loadSession } from './supabase'

export type CompanionDevice = {
  id?: string
  user_id: string
  device_id: string
  name: string
  platform: string
  app_version?: string
  capabilities?: string[]
  last_seen_at?: string
  created_at?: string
}

export type RemoteActionStatus = 'pending' | 'approved' | 'running' | 'succeeded' | 'failed' | 'canceled'

export type RemoteAction = {
  id?: string
  user_id: string
  project_client_id?: string | null
  target_device_id?: string | null
  action_type: string
  payload?: Record<string, unknown>
  status?: RemoteActionStatus
  requested_by_device_id?: string | null
  result?: Record<string, unknown> | null
  created_at?: string
  updated_at?: string
}

async function companionRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const session = loadSession()
  const base = getSupabaseUrl()
  const key = getSupabasePublishableKey()
  if (!session || !base || !key) throw new Error('Sign in and configure Supabase before using companion features.')
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  })
  const text = await response.text()
  if (!response.ok) {
    const normalized = text.toLowerCase()
    if (normalized.includes('projectx_devices') || normalized.includes('projectx_remote_actions') || normalized.includes('schema cache')) {
      throw new Error('Companion tables are not installed in this Supabase project. Apply the project.X companion migrations, then retry.')
    }
    throw new Error(text || `Companion request failed (${response.status}).`)
  }
  return text ? JSON.parse(text) as T : undefined as T
}

export async function registerCompanionDevice(device: Omit<CompanionDevice, 'user_id'>): Promise<CompanionDevice[]> {
  const session = loadSession()
  if (!session) throw new Error('Sign in before registering a device.')
  return companionRequest<CompanionDevice[]>(
    '/rest/v1/projectx_devices?on_conflict=user_id,device_id',
    {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({ ...device, user_id: session.user.id, last_seen_at: new Date().toISOString() }),
    },
  )
}

export async function listCompanionDevices(): Promise<CompanionDevice[]> {
  return companionRequest<CompanionDevice[]>('/rest/v1/projectx_devices?select=*&order=last_seen_at.desc')
}

export async function queueRemoteAction(action: Omit<RemoteAction, 'user_id' | 'status'>): Promise<RemoteAction[]> {
  const session = loadSession()
  if (!session) throw new Error('Sign in before queueing a remote action.')
  return companionRequest<RemoteAction[]>(
    '/rest/v1/projectx_remote_actions',
    {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ ...action, user_id: session.user.id, status: 'pending' }),
    },
  )
}

export async function listRemoteActions(limit = 100): Promise<RemoteAction[]> {
  const safeLimit = Math.max(1, Math.min(500, limit))
  return companionRequest<RemoteAction[]>(`/rest/v1/projectx_remote_actions?select=*&order=created_at.desc&limit=${safeLimit}`)
}

export async function claimPendingActions(deviceId: string): Promise<RemoteAction[]> {
  return companionRequest<RemoteAction[]>(`/rest/v1/projectx_remote_actions?select=*&target_device_id=eq.${encodeURIComponent(deviceId)}&status=in.(approved,pending)&order=created_at.asc`)
}

export async function updateRemoteAction(id: string, status: RemoteActionStatus, result?: Record<string, unknown>): Promise<RemoteAction[]> {
  return companionRequest<RemoteAction[]>(
    `/rest/v1/projectx_remote_actions?id=eq.${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ status, ...(result ? { result } : {}) }),
    },
  )
}
