export type VercelDeployment = {
  id: string
  name: string
  url: string
  state: string
  target: string | null
  createdAt: number
  readyAt: number | null
  source: string | null
}

export type VercelIntegrationResponse = {
  connected: boolean
  deployments: VercelDeployment[]
  message?: string
}

export async function fetchVercelDeployments(): Promise<VercelIntegrationResponse> {
  try {
    const response = await fetch('/api/vercel-projects')
    const body = await response.json() as VercelIntegrationResponse
    if (!response.ok) {
      return {
        connected: false,
        deployments: [],
        message: body.message || `Vercel integration unavailable (${response.status}).`,
      }
    }
    return body
  } catch {
    return {
      connected: false,
      deployments: [],
      message: 'Vercel integration is available after deployment; the local Vite server does not run /api routes.',
    }
  }
}
