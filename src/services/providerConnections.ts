import { getDesktopHost } from './desktop'
import { loadSession } from './supabase'
import { openHostedLink } from './externalLinks'

export type ProviderId = 'github' | 'vercel'

export type ProviderConnectionState = {
  provider: ProviderId
  connected: boolean
  resourceCount: number
  message: string
  checkedAt: string
}

// Internal desktop/Companion builds track the stable develop branch alias while
// v3.1 is being validated. The old production alias can lag behind develop and
// was the reason native provider requests were hitting an API surface that did
// not contain the current OAuth/CORS handlers.
const HOSTED_API_ORIGIN = (import.meta.env.VITE_PROJECTX_API_ORIGIN || 'https://projectx-git-develop-xfactor21s-projects.vercel.app').replace(/\/$/, '')

function isNativeShell() {
  if (getDesktopHost()) return true
  return Boolean((window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.())
}

function apiUrl(path: string) {
  return isNativeShell() ? `${HOSTED_API_ORIGIN}${path}` : path
}

function providerName(provider: ProviderId) {
  return provider === 'github' ? 'GitHub' : 'Vercel'
}

export async function fetchProviderConnection(provider: ProviderId, includeResources = false): Promise<ProviderConnectionState> {
  const checkedAt = new Date().toISOString()
  const session = loadSession()
  if (!session) return {
    provider,
    connected: false,
    resourceCount: 0,
    message: `project.X Cloud identifies you, but ${providerName(provider)} is a separate connection. Sign in to project.X Cloud first, then authorize ${providerName(provider)}.`,
    checkedAt,
  }
  try {
    const endpoint = includeResources ? 'provider-resources' : 'provider-status'
    const response = await fetch(apiUrl(`/api/${endpoint}?provider=${provider}`), { headers: { Authorization: `Bearer ${session.access_token}` } })
    const body = await response.json() as { connected?: boolean; resources?: unknown[]; message?: string }
    const connected = Boolean(body.connected && response.ok)
    return {
      provider,
      connected,
      resourceCount: Array.isArray(body.resources) ? body.resources.length : 0,
      message: body.message || (connected ? `${providerName(provider)} authorization is active.` : `${providerName(provider)} has not been authorized yet.`),
      checkedAt,
    }
  } catch (error) {
    return {
      provider,
      connected: false,
      resourceCount: 0,
      message: error instanceof Error ? `${providerName(provider)} connection service unreachable: ${error.message}` : `${providerName(provider)} connection service is unreachable.`,
      checkedAt,
    }
  }
}

export async function connectProvider(provider: ProviderId): Promise<string> {
  const session = loadSession()
  if (!session) throw new Error(`Sign in to project.X Cloud first. That only establishes your project.X identity; ${providerName(provider)} authorization is a separate step.`)
  const response = await fetch(apiUrl('/api/provider-connect'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider }),
  })
  const body = await response.json() as { authorizationUrl?: string; message?: string }
  if (!response.ok || !body.authorizationUrl) throw new Error(body.message || `Unable to start ${providerName(provider)} authorization.`)
  await openHostedLink(body.authorizationUrl)
  return `${providerName(provider)} authorization opened in your browser.`
}
