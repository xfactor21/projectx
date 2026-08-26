/// <reference types="node" />

type ApiRequest = { headers?: Record<string, string | string[] | undefined> }
type ApiResponse = { status(code: number): ApiResponse; json(body: unknown): void }

export async function requireAuthorizedUser(request: ApiRequest, response: ApiResponse): Promise<boolean> {
  const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/$/, '')
  const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || ''
  const allowed = new Set((process.env.PROJECTX_ALLOWED_USER_IDS || '').split(',').map((value) => value.trim()).filter(Boolean))
  if (!supabaseUrl || !publishableKey || allowed.size === 0) {
    response.status(503).json({ ok: false, connected: false, message: 'Vercel integration authorization is not configured.' })
    return false
  }

  const header = request.headers?.authorization
  const authorization = Array.isArray(header) ? header[0] : header
  if (!authorization?.startsWith('Bearer ')) {
    response.status(401).json({ ok: false, connected: false, message: 'Sign in to use the Vercel integration.' })
    return false
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)
  try {
    const upstream = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: publishableKey, Authorization: authorization },
      signal: controller.signal,
    })
    if (!upstream.ok) {
      response.status(401).json({ ok: false, connected: false, message: 'Your project.X session is invalid or expired.' })
      return false
    }
    const user = await upstream.json() as { id?: string }
    if (!user.id || !allowed.has(user.id)) {
      response.status(403).json({ ok: false, connected: false, message: 'This account is not authorized to use the Vercel integration.' })
      return false
    }
    return true
  } catch {
    response.status(503).json({ ok: false, connected: false, message: 'Unable to verify the project.X session.' })
    return false
  } finally {
    clearTimeout(timer)
  }
}

export async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 20_000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try { return await fetch(url, { ...init, signal: controller.signal }) }
  finally { clearTimeout(timer) }
}
