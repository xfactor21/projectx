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

export async function fetchProviderConnection(provider: ProviderId, includeResources = false): Promise<ProviderConnectionState> {
  const checkedAt = new Date().toISOString()
  const session = loadSession()
  if (!session) return { provider, connected: false, resourceCount: 0, message: 'Sign in to project.X Cloud to connect.', checkedAt }
  try {
    const endpoint = includeResources ? 'provider-resources' : 'provider-status'
    const response = await fetch(`/api/${endpoint}?provider=${provider}`, { headers: { Authorization: `Bearer ${session.access_token}` } })
    const body = await response.json() as { connected?: boolean; resources?: unknown[]; message?: string }
    const connected = Boolean(body.connected && response.ok)
    return {
      provider,
      connected,
      resourceCount: Array.isArray(body.resources) ? body.resources.length : 0,
      message: body.message || (connected ? `${provider === 'github' ? 'GitHub' : 'Vercel'} connected.` : `Connect ${provider}.`),
      checkedAt,
    }
  } catch {
    return { provider, connected: false, resourceCount: 0, message: 'Connection status is available in the deployed application.', checkedAt }
  }
}

export async function connectProvider(provider: ProviderId): Promise<string> {
  const session = loadSession()
  if (!session) throw new Error('Sign in to project.X Cloud before connecting an external provider.')
  const response = await fetch('/api/provider-connect', { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ provider }) })
  const body = await response.json() as { authorizationUrl?: string; message?: string }
  if (!response.ok || !body.authorizationUrl) throw new Error(body.message || `Unable to connect ${provider}.`)
  await openHostedLink(body.authorizationUrl)
  return `${provider === 'github' ? 'GitHub' : 'Vercel'} authorization opened in your browser. Complete it, then return and refresh.`
}
