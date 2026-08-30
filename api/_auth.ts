/// <reference types="node" />

type ApiRequest = { headers?: Record<string, string | string[] | undefined> }
type ApiResponse = { status(code: number): ApiResponse; json(body: unknown): void }

export async function requireUser(request: ApiRequest, response: ApiResponse): Promise<{ id: string } | null> {
  const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/$/, '')
  const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || ''
  const header = request.headers?.authorization
  const authorization = Array.isArray(header) ? header[0] : header
  if (!supabaseUrl || !publishableKey) {
    response.status(503).json({ ok: false, connected: false, message: 'project.X account authorization is not configured.' })
    return null
  }
  if (!authorization?.startsWith('Bearer ')) {
    response.status(401).json({ ok: false, connected: false, message: 'Sign in to connect a provider.' })
    return null
  }
  try {
    const upstream = await fetchWithTimeout(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: publishableKey, Authorization: authorization } }, 10_000)
    if (!upstream.ok) {
      response.status(401).json({ ok: false, connected: false, message: 'Your project.X session is invalid or expired.' })
      return null
    }
    const user = await upstream.json() as { id?: string }
    if (!user.id) {
      response.status(401).json({ ok: false, connected: false, message: 'The signed-in account has no user identifier.' })
      return null
    }
    return { id: user.id }
  } catch {
    response.status(503).json({ ok: false, connected: false, message: 'Unable to verify the project.X session.' })
    return null
  }
}

export async function requireAuthorizedUser(request: ApiRequest, response: ApiResponse): Promise<boolean> {
  const allowed = new Set((process.env.PROJECTX_ALLOWED_USER_IDS || '').split(',').map((value) => value.trim()).filter(Boolean))
  if (allowed.size === 0) {
    response.status(503).json({ ok: false, connected: false, message: 'Vercel integration authorization is not configured.' })
    return false
  }
  const user = await requireUser(request, response)
  if (!user) return false
  if (allowed.has(user.id)) return true
  response.status(403).json({ ok: false, connected: false, message: 'This account is not authorized to use the legacy owner integration.' })
  return false
}

export async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 20_000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try { return await fetch(url, { ...init, signal: controller.signal }) }
  finally { clearTimeout(timer) }
}
