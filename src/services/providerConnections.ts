import { getDesktopHost } from './desktop'
import { loadSession } from './supabase'

export type ProviderId = 'github' | 'vercel'

export async function connectProvider(provider: ProviderId): Promise<string> {
  const session = loadSession()
  if (!session) throw new Error('Sign in to project.X Cloud before connecting an external provider.')
  const response = await fetch('/api/provider-connect', { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ provider }) })
  const body = await response.json() as { authorizationUrl?: string; message?: string }
  if (!response.ok || !body.authorizationUrl) throw new Error(body.message || `Unable to connect ${provider}.`)
  const desktop = getDesktopHost()
  if (desktop) await desktop.openExternalPreview(body.authorizationUrl)
  else window.open(body.authorizationUrl, '_blank', 'noopener,noreferrer')
  return `${provider === 'github' ? 'GitHub' : 'Vercel'} authorization opened in your browser. Complete it, then return and refresh.`
}
