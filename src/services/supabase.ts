const BUILD_SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
const BUILD_SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || ''
const CONFIG_KEY = 'projectx.supabase.config.v1'
const SELF_HOSTING_KEY = 'projectx.supabase.self-hosting.v1'
const SESSION_KEY = 'projectx.supabase.session.v1'

export type SupabaseConfig = { url: string; publishableKey: string; source: 'self-hosted' | 'managed' | 'none' }

export type SupabaseUser = { id: string; email?: string }
export type SupabaseSession = { access_token: string; refresh_token?: string; expires_in?: number; expires_at?: number; token_type?: string; user: SupabaseUser }
export type CloudProject = { id?: string; user_id: string; client_id: string; name: string; kicker?: string; description?: string; status?: 'Live' | 'Building' | 'Concept' | 'Paused'; stack?: unknown; accent?: 'pink' | 'cyan' | 'violet'; progress?: number; favorite?: boolean; archived?: boolean; repo_url?: string; live_url?: string; cover_url?: string; notes?: string; github?: unknown; sort_order?: number; created_at?: string; updated_at?: string }
export type CloudActivity = { id?: string; user_id: string; project_client_id?: string | null; event_type: string; message: string; metadata?: Record<string, unknown>; created_at?: string }

function headers(accessToken?: string, extra?: HeadersInit): HeadersInit {
  const key = getSupabasePublishableKey()
  return { apikey: key, Authorization: `Bearer ${accessToken || key}`, 'Content-Type': 'application/json', ...extra }
}

function friendlyError(status: number, body: string): string {
  try {
    const parsed = JSON.parse(body) as { error_code?: string; code?: string | number; msg?: string; message?: string; error?: string }
    const code = String(parsed.error_code || parsed.code || '').toLowerCase()
    const message = parsed.msg || parsed.message || parsed.error || body
    if (code.includes('invalid_credentials') || /invalid login credentials/i.test(message)) return 'Invalid email or password. Check the account details and try again.'
    if (/email not confirmed/i.test(message)) return 'That account exists but its email has not been confirmed yet.'
    if (/user already registered/i.test(message)) return 'That email already has a project.X account. Use Sign in instead of Create account.'
    return `Cloud request failed (${status}): ${message}`
  } catch {
    return body ? `Cloud request failed (${status}): ${body}` : `Cloud request failed (${status}).`
  }
}

async function request<T>(path: string, init: RequestInit = {}, accessToken?: string): Promise<T> {
  if (!isSupabaseConfigured()) throw new Error('project.X Cloud is unavailable in this build. Contact support or enable self-hosting in Advanced Settings.')
  const response = await fetch(`${getSupabaseUrl()}${path}`, { ...init, headers: headers(accessToken, init.headers) })
  if (!response.ok) {
    const body = await response.text()
    throw new Error(friendlyError(response.status, body))
  }
  if (response.status === 204) return undefined as T
  const text = await response.text()
  return text ? (JSON.parse(text) as T) : (undefined as T)
}

export function getSupabaseConfig(): SupabaseConfig {
  if (!isSelfHostingEnabled() && BUILD_SUPABASE_URL && BUILD_SUPABASE_KEY) {
    return { url: BUILD_SUPABASE_URL, publishableKey: BUILD_SUPABASE_KEY, source: 'managed' }
  }
  if (isSelfHostingEnabled()) {
    try {
      const saved = JSON.parse(localStorage.getItem(CONFIG_KEY) || 'null') as { url?: unknown; publishableKey?: unknown } | null
      if (saved && typeof saved.url === 'string' && typeof saved.publishableKey === 'string' && saved.url && saved.publishableKey) {
        return { url: saved.url.replace(/\/$/, ''), publishableKey: saved.publishableKey, source: 'self-hosted' }
      }
    } catch { /* Ignore malformed self-hosted configuration. */ }
  }
  return { url: '', publishableKey: '', source: 'none' }
}

function rejectPrivilegedKey(key: string): void {
  if (/^(sb_secret_|.*service[_-]?role)/i.test(key)) throw new Error('Secret and service-role keys cannot be used in project.X.')
  const parts = key.split('.')
  if (parts.length !== 3) return
  try {
    const encoded = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '='))) as { role?: string }
    if (payload.role === 'service_role') throw new Error('Service-role keys cannot be used in project.X.')
  } catch (error) {
    if (error instanceof Error && /service-role/i.test(error.message)) throw error
  }
}

export function saveSupabaseConfig(url: string, publishableKey: string): SupabaseConfig {
  const normalizedUrl = url.trim().replace(/\/$/, '')
  const key = publishableKey.trim()
  let parsed: URL
  try { parsed = new URL(normalizedUrl) } catch { throw new Error('Enter a valid Supabase project URL.') }
  const local = ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)
  if (parsed.protocol !== 'https:' && !(local && parsed.protocol === 'http:')) throw new Error('Supabase must use HTTPS unless it is a local development instance.')
  if (key.length < 20) throw new Error('The Supabase publishable key appears incomplete.')
  rejectPrivilegedKey(key)
  localStorage.setItem(CONFIG_KEY, JSON.stringify({ url: normalizedUrl, publishableKey: key }))
  localStorage.setItem(SELF_HOSTING_KEY, 'on')
  saveSession(null)
  window.dispatchEvent(new CustomEvent('projectx:supabase-config-changed'))
  return { url: normalizedUrl, publishableKey: key, source: 'self-hosted' }
}
export function clearSupabaseConfig(): void {
  localStorage.removeItem(CONFIG_KEY)
  localStorage.removeItem(SELF_HOSTING_KEY)
  saveSession(null)
  window.dispatchEvent(new CustomEvent('projectx:supabase-config-changed'))
}
export function isManagedSupabaseConfigured(): boolean { return Boolean(BUILD_SUPABASE_URL && BUILD_SUPABASE_KEY) }
export function isSelfHostingEnabled(): boolean { return localStorage.getItem(SELF_HOSTING_KEY) === 'on' }
export function setSelfHostingEnabled(enabled: boolean): void {
  if (enabled) localStorage.setItem(SELF_HOSTING_KEY, 'on')
  else localStorage.removeItem(SELF_HOSTING_KEY)
  saveSession(null)
  window.dispatchEvent(new CustomEvent('projectx:supabase-config-changed'))
}
export async function testSupabaseConfig(url: string, publishableKey: string): Promise<void> {
  const normalizedUrl = url.trim().replace(/\/$/, '')
  const key = publishableKey.trim()
  rejectPrivilegedKey(key)
  const response = await fetch(`${normalizedUrl}/auth/v1/settings`, { headers: { apikey: key, Authorization: `Bearer ${key}` } })
  if (!response.ok) throw new Error(`Supabase connection failed (${response.status}). Check the URL and publishable key.`)
}
export function isSupabaseConfigured(): boolean { const config = getSupabaseConfig(); return Boolean(config.url && config.publishableKey) }
export function getSupabaseUrl(): string { return getSupabaseConfig().url }
export function getSupabasePublishableKey(): string { return getSupabaseConfig().publishableKey }
export function loadSession(): SupabaseSession | null { try { const raw = localStorage.getItem(SESSION_KEY); if (!raw) return null; const session = JSON.parse(raw) as SupabaseSession; return session?.access_token && session?.user?.id ? session : null } catch { return null } }
export function saveSession(session: SupabaseSession | null): void { if (!session) localStorage.removeItem(SESSION_KEY); else localStorage.setItem(SESSION_KEY, JSON.stringify(session)) }

export async function signUpWithPassword(email: string, password: string): Promise<SupabaseSession | null> {
  const result = await request<SupabaseSession | { user: SupabaseUser; session: SupabaseSession | null }>('/auth/v1/signup', { method: 'POST', body: JSON.stringify({ email, password }) })
  const session = 'session' in result ? result.session : result
  if (session?.access_token) saveSession(session)
  return session || null
}
export async function signInWithPassword(email: string, password: string): Promise<SupabaseSession> { const session = await request<SupabaseSession>('/auth/v1/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email, password }) }); saveSession(session); return session }
export async function refreshSession(session = loadSession()): Promise<SupabaseSession | null> { if (!session?.refresh_token) return session; const refreshed = await request<SupabaseSession>('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: JSON.stringify({ refresh_token: session.refresh_token }) }); saveSession(refreshed); return refreshed }
export async function signOut(session = loadSession()): Promise<void> { if (session?.access_token) { try { await request<void>('/auth/v1/logout', { method: 'POST' }, session.access_token) } catch { /* clear local session regardless */ } } saveSession(null) }

export async function fetchCloudProjects(session = loadSession()): Promise<CloudProject[]> { if (!session) throw new Error('Sign in before syncing projects.'); return request<CloudProject[]>('/rest/v1/projectx_projects?select=*&order=sort_order.asc,updated_at.desc', { method: 'GET' }, session.access_token) }
export async function upsertCloudProjects(projects: CloudProject[], session = loadSession()): Promise<CloudProject[]> {
  if (!session) throw new Error('Sign in before syncing projects.')
  if (!projects.length) return []
  const payload = projects.map((project, index) => ({ ...project, user_id: session.user.id, sort_order: project.sort_order ?? index }))
  return request<CloudProject[]>('/rest/v1/projectx_projects?on_conflict=user_id,client_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify(payload) }, session.access_token)
}
export async function deleteCloudProject(clientId: string, session = loadSession()): Promise<void> { if (!session) throw new Error('Sign in before syncing projects.'); await request<void>(`/rest/v1/projectx_projects?client_id=eq.${encodeURIComponent(clientId)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } }, session.access_token) }
export async function fetchCloudActivity(session = loadSession(), limit = 100): Promise<CloudActivity[]> { if (!session) throw new Error('Sign in before syncing activity.'); return request<CloudActivity[]>(`/rest/v1/projectx_activity?select=*&order=created_at.desc&limit=${Math.max(1, Math.min(limit, 500))}`, { method: 'GET' }, session.access_token) }
export async function appendCloudActivity(activity: Omit<CloudActivity, 'user_id'>, session = loadSession()): Promise<CloudActivity[]> { if (!session) throw new Error('Sign in before syncing activity.'); return request<CloudActivity[]>('/rest/v1/projectx_activity', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ ...activity, user_id: session.user.id }) }, session.access_token) }
