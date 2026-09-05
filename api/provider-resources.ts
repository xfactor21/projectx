/// <reference types="node" />
import { fetchWithTimeout, requireUser } from './_auth'
import { loadProviderConnection } from './_provider-store'

export default async function handler(request: any, response: any) {
  if (request.method !== 'GET') return response.status(405).json({ ok: false, resources: [], message: 'Method not allowed.' })
  const user = await requireUser(request, response)
  if (!user) return
  const provider = String(request.query?.provider || '')
  if (!['github', 'vercel'].includes(provider)) return response.status(400).json({ ok: false, resources: [], message: 'Unknown provider.' })
  try {
    const connection = await loadProviderConnection(user.id, provider as 'github' | 'vercel')
    if (!connection) return response.status(409).json({ ok: false, connected: false, resources: [], message: `Connect ${provider} first.` })
    if (provider === 'github') {
      const upstream = await fetchWithTimeout('https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member', { headers: { Authorization: `Bearer ${connection.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } })
      const payload = await upstream.json()
      if (!upstream.ok) return response.status(upstream.status).json({ ok: false, connected: true, resources: [], message: (payload as any)?.message || 'GitHub API request failed.' })
      return response.status(200).json({ ok: true, connected: true, resources: payload })
    }
    const params = new URLSearchParams({ limit: '100' })
    if (connection.teamId) params.set('teamId', connection.teamId)
    const upstream = await fetchWithTimeout(`https://api.vercel.com/v9/projects?${params}`, { headers: { Authorization: `Bearer ${connection.token}` } })
    const payload = await upstream.json() as { projects?: unknown[]; error?: { message?: string } }
    if (!upstream.ok) return response.status(upstream.status).json({ ok: false, connected: true, resources: [], message: payload.error?.message || 'Vercel API request failed.' })
    response.status(200).json({ ok: true, connected: true, resources: payload.projects || [] })
  } catch (error) {
    response.status(500).json({ ok: false, resources: [], message: error instanceof Error ? error.message : 'Unable to load provider resources.' })
  }
}
