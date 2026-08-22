/// <reference types="node" />

type DeployRequest = {
  projectName?: string
  repoUrl?: string
  ref?: string
  target?: 'preview' | 'production'
}

function parseGitHubRepo(repoUrl: string) {
  try {
    const url = new URL(repoUrl)
    if (url.hostname !== 'github.com') return null
    const parts = url.pathname.split('/').filter(Boolean)
    if (parts.length < 2) return null
    return { org: parts[0], repo: parts[1].replace(/\.git$/i, '') }
  } catch { return null }
}

function safeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100)
}

export default async function handler(request: any, response: any) {
  if (request.method !== 'POST') {
    response.status(405).json({ ok: false, message: 'Method not allowed.' })
    return
  }

  const token = process.env.VERCEL_API_TOKEN
  const teamId = process.env.VERCEL_TEAM_ID
  if (!token) {
    response.status(503).json({ ok: false, message: 'Set VERCEL_API_TOKEN in the deployment environment before deploying.' })
    return
  }

  const body = (request.body || {}) as DeployRequest
  const github = body.repoUrl ? parseGitHubRepo(body.repoUrl) : null
  if (!body.projectName || !github) {
    response.status(400).json({ ok: false, message: 'A project name and GitHub repository URL are required.' })
    return
  }

  const params = new URLSearchParams()
  if (teamId) params.set('teamId', teamId)
  const endpoint = `https://api.vercel.com/v13/deployments${params.size ? `?${params.toString()}` : ''}`

  try {
    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: safeName(body.projectName) || github.repo.toLowerCase(),
        target: body.target === 'production' ? 'production' : undefined,
        gitSource: {
          type: 'github',
          org: github.org,
          repo: github.repo,
          ref: body.ref || 'main',
        },
      }),
    })
    const payload = await upstream.json() as Record<string, unknown>
    if (!upstream.ok) {
      const error = payload.error as { message?: string } | undefined
      response.status(upstream.status).json({ ok: false, message: error?.message || `Vercel deployment failed (${upstream.status}).` })
      return
    }
    response.status(200).json({
      ok: true,
      id: payload.id || payload.uid,
      url: typeof payload.url === 'string' ? (payload.url.startsWith('http') ? payload.url : `https://${payload.url}`) : null,
      status: payload.status || payload.readyState || 'QUEUED',
    })
  } catch (error) {
    response.status(500).json({ ok: false, message: error instanceof Error ? error.message : 'Unable to create Vercel deployment.' })
  }
}
