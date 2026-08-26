/// <reference types="node" />
import { fetchWithTimeout, requireAuthorizedUser } from './_auth'

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
  if (!await requireAuthorizedUser(request, response)) return

  // The Vercel token must stay in the server environment. Proxying through this function prevents
  // the browser bundle from ever receiving a credential that can inspect the user's Vercel account.
  const token = process.env.VERCEL_API_TOKEN
  const teamId = process.env.VERCEL_TEAM_ID

  if (!token) {
    response.status(503).json({
      connected: false,
      deployments: [],
      message: 'Set VERCEL_API_TOKEN in the deployment environment to enable live Vercel status.',
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
