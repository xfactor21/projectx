/// <reference types="node" />
import { fetchWithTimeout, requireUser } from './_auth'
import { loadProviderConnection } from './_provider-store'

type DeployRequest = {
  projectName?: string
  repoUrl?: string
  ref?: string
  target?: 'preview' | 'production'
  confirm?: boolean
}

function parseGitHubRepo(repoUrl: string) {
  try {
    const url = new URL(repoUrl)
    if (url.hostname !== 'github.com') return null
    const parts = url.pathname.split('/').filter(Boolean)
    if (parts.length !== 2) return null
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
  const user = await requireUser(request, response)
  if (!user) return

  let connection = await loadProviderConnection(user.id, 'vercel')
  const legacyAllowed = new Set((process.env.PROJECTX_ALLOWED_USER_IDS || '').split(',').map((value) => value.trim()))
  if (!connection && legacyAllowed.has(user.id) && process.env.VERCEL_API_TOKEN) connection = { token: process.env.VERCEL_API_TOKEN, teamId: process.env.VERCEL_TEAM_ID }
  const token = connection?.token
  const teamId = connection?.teamId
  if (!token) {
    response.status(503).json({ ok: false, message: 'Connect your Vercel account before deploying.' })
    return
  }

  const body = (request.body || {}) as DeployRequest
  const github = body.repoUrl ? parseGitHubRepo(body.repoUrl) : null
  if (!body.projectName || !github) {
    response.status(400).json({ ok: false, message: 'A project name and GitHub repository URL are required.' })
    return
  }
  if (body.confirm !== true) {
    response.status(400).json({ ok: false, message: 'Deployment requires explicit confirmation.' })
    return
  }

  const params = new URLSearchParams()
  if (teamId) params.set('teamId', teamId)
  const endpoint = `https://api.vercel.com/v13/deployments${params.size ? `?${params.toString()}` : ''}`

  try {
    const upstream = await fetchWithTimeout(endpoint, {
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
    }, 30_000)
    const payload = await upstream.json() as Record<string, unknown>
    if (!upstream.ok) {
      const error = payload.error as { message?: string } | undefined
      response.status(upstream.status).json({ ok: false, message: error?.message || `Vercel deployment failed (${upstream.status}).` })
      return
    }
    let githubDeploymentRegistered = false
    let githubMessage: string | undefined
    try {
      const githubConnection = await loadProviderConnection(user.id, 'github')
      if (githubConnection) {
        const deploymentResponse = await fetchWithTimeout(`https://api.github.com/repos/${encodeURIComponent(github.org)}/${encodeURIComponent(github.repo)}/deployments`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${githubConnection.token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28' },
          body: JSON.stringify({ ref: body.ref || 'main', environment: body.target === 'production' ? 'production' : 'preview', auto_merge: false, required_contexts: [], description: 'Deployment created by project.X', payload: { provider: 'vercel', deploymentId: payload.id || payload.uid } }),
        })
        const githubDeployment = await deploymentResponse.json() as { id?: number; message?: string }
        if (!deploymentResponse.ok || !githubDeployment.id) throw new Error(githubDeployment.message || 'GitHub deployment registration failed.')
        const deploymentUrl = typeof payload.url === 'string' ? (payload.url.startsWith('http') ? payload.url : `https://${payload.url}`) : undefined
        const statusResponse = await fetchWithTimeout(`https://api.github.com/repos/${encodeURIComponent(github.org)}/${encodeURIComponent(github.repo)}/deployments/${githubDeployment.id}/statuses`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${githubConnection.token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28' },
          body: JSON.stringify({ state: 'queued', description: 'Vercel deployment queued by project.X', environment: body.target === 'production' ? 'production' : 'preview', environment_url: deploymentUrl, auto_inactive: body.target === 'production' }),
        })
        if (!statusResponse.ok) throw new Error('GitHub deployment status registration failed.')
        githubDeploymentRegistered = true
      }
    } catch (error) {
      githubMessage = error instanceof Error ? error.message : 'GitHub deployment registration failed.'
    }
    response.status(200).json({
      ok: true,
      id: payload.id || payload.uid,
      url: typeof payload.url === 'string' ? (payload.url.startsWith('http') ? payload.url : `https://${payload.url}`) : null,
      status: payload.status || payload.readyState || 'QUEUED',
      githubDeploymentRegistered,
      githubMessage,
    })
  } catch (error) {
    response.status(500).json({ ok: false, message: error instanceof Error ? error.message : 'Unable to create Vercel deployment.' })
  }
}
