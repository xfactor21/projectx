export type VercelDeployResult = {
  ok: boolean
  id?: string
  url?: string | null
  status?: string
  message?: string
}

export async function deployGitHubProject(input: {
  projectName: string
  repoUrl: string
  ref?: string
  target?: 'preview' | 'production'
}): Promise<VercelDeployResult> {
  try {
    const response = await fetch('/api/vercel-deploy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    const body = await response.json() as VercelDeployResult
    if (!response.ok) return { ok: false, message: body.message || `Deployment failed (${response.status}).` }
    return body
  } catch {
    return { ok: false, message: 'Deployment actions require the hosted project.X API; plain local Vite does not run /api routes.' }
  }
}
