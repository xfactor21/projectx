/// <reference types="node" />
import { requireUser } from './_auth'
import { createProviderState } from './_provider-store'

export default async function handler(request: any, response: any) {
  if (request.method !== 'POST') return response.status(405).json({ ok: false, message: 'Method not allowed.' })
  const user = await requireUser(request, response)
  if (!user) return
  const provider = request.body?.provider
  if (!['github', 'vercel'].includes(provider)) return response.status(400).json({ ok: false, message: 'Provider must be github or vercel.' })
  try {
    const state = createProviderState(user.id, provider)
    const origin = (process.env.PROJECTX_API_ORIGIN || '').replace(/\/$/, '')
    if (!origin) throw new Error('PROJECTX_API_ORIGIN is not configured.')
    const redirectUri = `${origin}/api/provider-callback`
    if (provider === 'github') {
      const clientId = process.env.GITHUB_CLIENT_ID
      if (!clientId) throw new Error('GitHub App client ID is not configured.')
      const params = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, state })
      return response.status(200).json({ ok: true, authorizationUrl: `https://github.com/login/oauth/authorize?${params}` })
    }
    const slug = process.env.VERCEL_INTEGRATION_SLUG
    if (!slug) throw new Error('Vercel Integration slug is not configured.')
    response.status(200).json({ ok: true, authorizationUrl: `https://vercel.com/integrations/${encodeURIComponent(slug)}/new?state=${encodeURIComponent(state)}` })
  } catch (error) {
    response.status(503).json({ ok: false, message: error instanceof Error ? error.message : 'Provider connection is unavailable.' })
  }
}
