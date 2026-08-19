const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || ''
const SESSION_KEY = 'projectx.supabase.session.v1'

export type SupabaseUser = {
  id: string
  email?: string
}

export type SupabaseSession = {
  access_token: string
  refresh_token?: string
  expires_in?: number
  expires_at?: number
  token_type?: string
  user: SupabaseUser
}

export type CloudProject = {
  id?: string
  user_id: string
  client_id: string
  name: string
  kicker?: string
  description?: string
  status?: 'Live' | 'Building' | 'Concept' | 'Paused'
  stack?: unknown
  accent?: 'pink' | 'cyan' | 'violet'
  progress?: number
  favorite?: boolean
  archived?: boolean
  repo_url?: string
  live_url?: string
  cover_url?: string
  notes?: string
  github?: unknown
  sort_order?: number
  created_at?: string
  updated_at?: string
}

export type CloudActivity = {
  id?: string
  user_id: string
  project_client_id?: string | null
  event_type: string
  message: string
  metadata?: Record<string, unknown>
  created_at?: string
}

function headers(accessToken?: string, extra?: HeadersInit): HeadersInit {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${accessToken || SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  }
}

async function request<T>(path: string, init: RequestInit = {}, accessToken?: string): Promise<T> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (or VITE_SUPABASE_ANON_KEY).')
  }

  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: headers(accessToken, init.headers),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(body || `Supabase request failed (${response.status})`)
  }

  if (response.status === 204) return undefined as T
  const text = await response.text()
  return text ? (JSON.parse(text) as T) : (undefined as T)
}

export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_KEY)
}

export function getSupabaseUrl(): string {
  return SUPABASE_URL
}

export function loadSession(): SupabaseSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const session = JSON.parse(raw) as SupabaseSession
    if (!session?.access_token || !session?.user?.id) return null
    return session
  } catch {
    return null
  }
}

export function saveSession(session: SupabaseSession | null): void {
  if (!session) {
    localStorage.removeItem(SESSION_KEY)
    return
  }
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

export async function signUpWithPassword(email: string, password: string): Promise<SupabaseSession | null> {
  const result = await request<SupabaseSession | { user: SupabaseUser; session: SupabaseSession | null }>(
    '/auth/v1/signup',
    { method: 'POST', body: JSON.stringify({ email, password }) },
  )
  const session = 'session' in result ? result.session : result
  if (session?.access_token) saveSession(session)
  return session || null
}

export async function signInWithPassword(email: string, password: string): Promise<SupabaseSession> {
  const session = await request<SupabaseSession>(
    '/auth/v1/token?grant_type=password',
    { method: 'POST', body: JSON.stringify({ email, password }) },
  )
  saveSession(session)
  return session
}

export async function refreshSession(session = loadSession()): Promise<SupabaseSession | null> {
  if (!session?.refresh_token) return session
  const refreshed = await request<SupabaseSession>(
    '/auth/v1/token?grant_type=refresh_token',
    { method: 'POST', body: JSON.stringify({ refresh_token: session.refresh_token }) },
  )
  saveSession(refreshed)
  return refreshed
}

export async function signOut(session = loadSession()): Promise<void> {
  if (session?.access_token) {
    try {
      await request<void>('/auth/v1/logout', { method: 'POST' }, session.access_token)
    } catch {
      // Always clear the local session even if the remote token is already invalid.
    }
  }
  saveSession(null)
}

export async function fetchCloudProjects(session = loadSession()): Promise<CloudProject[]> {
  if (!session) throw new Error('Sign in before syncing projects.')
  return request<CloudProject[]>(
    '/rest/v1/projectx_projects?select=*&order=sort_order.asc,updated_at.desc',
    { method: 'GET' },
    session.access_token,
  )
}

export async function upsertCloudProjects(projects: CloudProject[], session = loadSession()): Promise<CloudProject[]> {
  if (!session) throw new Error('Sign in before syncing projects.')
  const payload = projects.map((project, index) => ({
    ...project,
    user_id: session.user.id,
    sort_order: project.sort_order ?? index,
  }))
  return request<CloudProject[]>(
    '/rest/v1/projectx_projects?on_conflict=user_id,client_id',
    {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(payload),
    },
    session.access_token,
  )
}

export async function deleteCloudProject(clientId: string, session = loadSession()): Promise<void> {
  if (!session) throw new Error('Sign in before syncing projects.')
  await request<void>(
    `/rest/v1/projectx_projects?client_id=eq.${encodeURIComponent(clientId)}`,
    { method: 'DELETE', headers: { Prefer: 'return=minimal' } },
    session.access_token,
  )
}

export async function fetchCloudActivity(session = loadSession(), limit = 100): Promise<CloudActivity[]> {
  if (!session) throw new Error('Sign in before syncing activity.')
  return request<CloudActivity[]>(
    `/rest/v1/projectx_activity?select=*&order=created_at.desc&limit=${Math.max(1, Math.min(limit, 500))}`,
    { method: 'GET' },
    session.access_token,
  )
}

export async function appendCloudActivity(activity: Omit<CloudActivity, 'user_id'>, session = loadSession()): Promise<CloudActivity[]> {
  if (!session) throw new Error('Sign in before syncing activity.')
  return request<CloudActivity[]>(
    '/rest/v1/projectx_activity',
    {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ ...activity, user_id: session.user.id }),
    },
    session.access_token,
  )
}
