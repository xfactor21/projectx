import { getDesktopHost } from './desktop'
import { loadSession } from './supabase'

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

const HOSTED_API_ORIGIN = (import.meta.env.VITE_PROJECTX_API_ORIGIN || 'https://projectx-git-develop-xfactor21s-projects.vercel.app').replace(/\/$/, '')

function isNativeShell() {
  if (getDesktopHost()) return true
  return Boolean((window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.())
}

function apiUrl(path: string) {
  return isNativeShell() ? `${HOSTED_API_ORIGIN}${path}` : path
}

export async function fetchVercelDeployments(): Promise<VercelIntegrationResponse> {
  const session = loadSession()
  if (!session) return { connected: false, deployments: [], message: 'Sign in to project.X Cloud first, then authorize Vercel separately.' }
  try {
    const response = await fetch(apiUrl('/api/vercel-projects'), { headers: { Authorization: `Bearer ${session.access_token}` } })
    const body = await response.json() as VercelIntegrationResponse
    if (!response.ok) {
      return {
        connected: false,
        deployments: [],
        message: body.message || `Vercel integration unavailable (${response.status}).`,
      }
    }
    return body
  } catch (error) {
    return {
      connected: false,
      deployments: [],
      message: error instanceof Error ? `Vercel provider service unreachable: ${error.message}` : 'Vercel provider service is unreachable.',
    }
  }
}
