/// <reference types="node" />
import { fetchWithTimeout, requireUser } from './_auth'
import { loadProviderConnection } from './_provider-store'

export default async function handler(request: any, response: any) {
  if (request.method !== 'GET') return response.status(405).json({ ok: false, connected: false, message: 'Method not allowed.' })
  const user = await requireUser(request, response)
  if (!user) return
  const provider = String(request.query?.provider || '')
  if (!['github', 'vercel'].includes(provider)) return response.status(400).json({ ok: false, connected: false, message: 'Unknown provider.' })
  try {
    const connection = await loadProviderConnection(user.id, provider as 'github' | 'vercel')
    if (!connection) return response.status(200).json({ ok: true, connected: false, message: `Connect ${provider} first.` })
    const upstream = provider === 'github'
      ? await fetchWithTimeout('https://api.github.com/user', { headers: { Authorization: `Bearer ${connection.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } })
      : await fetchWithTimeout('https://api.vercel.com/v2/user', { headers: { Authorization: `Bearer ${connection.token}` } })
    if (!upstream.ok) return response.status(200).json({ ok: true, connected: false, message: `${provider === 'github' ? 'GitHub' : 'Vercel'} authorization needs to be renewed.` })
    return response.status(200).json({ ok: true, connected: true, message: `${provider === 'github' ? 'GitHub' : 'Vercel'} connected.` })
  } catch (error) {
    return response.status(500).json({ ok: false, connected: false, message: error instanceof Error ? error.message : 'Unable to check provider status.' })
  }
}
