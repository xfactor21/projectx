/// <reference types="node" />
import { fetchWithTimeout, requireUser } from './_auth'
import { loadProviderConnection } from './_provider-store'

type VercelDeployment = {
  uid: string
  name: string
  url: string
  state: string
  target?: string | null
  created: number
  ready?: number | null
  meta?: Record<string, string>
}

type VercelResponse = {
  deployments?: VercelDeployment[]
  error?: { message?: string }
}

export default async function handler(request: any, response: any) {
  if (request.method !== 'GET') {
    response.status(405).json({ connected: false, deployments: [], message: 'Method not allowed.' })
    return
  }
  const user = await requireUser(request, response)
  if (!user) return

  // The Vercel token must stay in the server environment. Proxying through this function prevents
  // the browser bundle from ever receiving a credential that can inspect the user's Vercel account.
  let connection = await loadProviderConnection(user.id, 'vercel')
  const legacyAllowed = new Set((process.env.PROJECTX_ALLOWED_USER_IDS || '').split(',').map((value) => value.trim()))
  if (!connection && legacyAllowed.has(user.id) && process.env.VERCEL_API_TOKEN) connection = { token: process.env.VERCEL_API_TOKEN, teamId: process.env.VERCEL_TEAM_ID }
  const token = connection?.token
  const teamId = connection?.teamId

  if (!token) {
    response.status(503).json({
      connected: false,
      deployments: [],
      message: 'Connect your Vercel account before loading deployment status.',
    })
    return
  }

  const params = new URLSearchParams({ limit: '100' })
  if (teamId) params.set('teamId', teamId)

  try {
    const upstream = await fetchWithTimeout(`https://api.vercel.com/v6/deployments?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    const payload = await upstream.json() as VercelResponse
    if (!upstream.ok) {
      // Pass through the upstream status so the browser can distinguish credential/scope problems
      // from an ordinary application-level "not connected" state.
      response.status(upstream.status).json({
        connected: false,
        deployments: [],
        message: payload.error?.message || `Vercel API error (${upstream.status}).`,
      })
      return
    }

    // Normalize Vercel's response before it reaches the UI. This keeps the frontend independent of
    // the upstream API shape and, critically, never forwards request headers or credentials.
    const deployments = (payload.deployments || []).map((deployment) => ({
      id: deployment.uid,
      name: deployment.name,
      url: deployment.url.startsWith('http') ? deployment.url : `https://${deployment.url}`,
      state: deployment.state,
      target: deployment.target || null,
      createdAt: deployment.created,
      readyAt: deployment.ready || null,
      source: deployment.meta?.githubRepo || deployment.meta?.githubCommitRef || null,
    }))

    // Deployment state is useful live data but does not need a fresh upstream API call for every browser request.
    response.setHeader('Cache-Control', 'private, no-store')
    response.status(200).json({ connected: true, deployments })
  } catch (error) {
    response.status(500).json({
      connected: false,
      deployments: [],
      message: error instanceof Error ? error.message : 'Unable to contact Vercel.',
    })
  }
}
