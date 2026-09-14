/// <reference types="node" />

const ALLOWED_ORIGINS = new Set([
  'tauri://localhost',
  'http://tauri.localhost',
  'https://tauri.localhost',
  'http://localhost',
  'https://localhost',
  'https://projectx-tau-six.vercel.app',
  'https://projectx-xfactor21s-projects.vercel.app',
])

export function applyProviderCors(request: any, response: any): boolean {
  const origin = String(request.headers?.origin || '')
  if (origin && (ALLOWED_ORIGINS.has(origin) || /^https:\/\/projectx-[a-z0-9-]+-xfactor21s-projects\.vercel\.app$/i.test(origin))) {
    response.setHeader('Access-Control-Allow-Origin', origin)
    response.setHeader('Vary', 'Origin')
  }
  response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  response.setHeader('Access-Control-Max-Age', '600')
  if (request.method === 'OPTIONS') {
    response.status(204).end()
    return true
  }
  return false
}

export function requestOrigin(request: any): string {
  const configured = String(process.env.PROJECTX_API_ORIGIN || '').replace(/\/$/, '')
  if (configured) return configured
  const host = String(request.headers?.['x-forwarded-host'] || request.headers?.host || '').trim()
  if (!host) throw new Error('Unable to determine the project.X API origin.')
  const proto = String(request.headers?.['x-forwarded-proto'] || 'https').split(',')[0].trim() || 'https'
  return `${proto}://${host}`.replace(/\/$/, '')
}
