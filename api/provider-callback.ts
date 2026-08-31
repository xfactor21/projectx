/// <reference types="node" />
import { encryptToken, saveProviderConnection, verifyProviderState } from './_provider-store'
import { fetchWithTimeout } from './_auth'

function page(response: any, status: number, title: string, detail: string) {
  const escape = (value: string) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] || character)
  response.status(status).setHeader('Content-Type', 'text/html; charset=utf-8')
  response.end(`<!doctype html><meta charset="utf-8"><title>${escape(title)}</title><style>body{margin:0;display:grid;place-items:center;min-height:100vh;background:#07080d;color:#f4f7fb;font:16px system-ui}.box{max-width:560px;padding:32px;border:1px solid #2ee2f0;background:#0d1119}h1{font-size:30px}p{color:#aab4c2}</style><div class="box"><h1>${escape(title)}</h1><p>${escape(detail)}</p></div>`)
}

export default async function handler(request: any, response: any) {
  try {
    const code = String(request.query?.code || '')
    const state = verifyProviderState(String(request.query?.state || ''))
    if (!code) throw new Error('The provider did not return an authorization code.')
    const origin = (process.env.PROJECTX_API_ORIGIN || '').replace(/\/$/, '')
    const redirectUri = `${origin}/api/provider-callback`
    if (state.provider === 'github') {
      const exchange = await fetchWithTimeout('https://github.com/login/oauth/access_token', { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: process.env.GITHUB_CLIENT_ID, client_secret: process.env.GITHUB_CLIENT_SECRET, code, redirect_uri: redirectUri }) }, 15_000)
      const token = await exchange.json() as { access_token?: string; scope?: string; error_description?: string }
      if (!exchange.ok || !token.access_token) throw new Error(token.error_description || 'GitHub token exchange failed.')
      const accountResponse = await fetchWithTimeout('https://api.github.com/user', { headers: { Authorization: `Bearer ${token.access_token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } }, 10_000)
      const account = await accountResponse.json() as { id?: number; login?: string }
      if (!accountResponse.ok || !account.id) throw new Error('Unable to read the connected GitHub account.')
      await saveProviderConnection({ user_id: state.userId, provider: 'github', account_id: String(account.id), account_name: account.login, encrypted_access_token: encryptToken(token.access_token), scopes: (token.scope || '').split(',').map((scope) => scope.trim()).filter(Boolean), updated_at: new Date().toISOString() })
    } else {
      const exchange = await fetchWithTimeout('https://api.vercel.com/v2/oauth/access_token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: process.env.VERCEL_CLIENT_ID || '', client_secret: process.env.VERCEL_CLIENT_SECRET || '', code, redirect_uri: redirectUri }) }, 15_000)
      const token = await exchange.json() as { access_token?: string; team_id?: string; user_id?: string; error?: { message?: string } }
      if (!exchange.ok || !token.access_token) throw new Error(token.error?.message || 'Vercel token exchange failed.')
      const accountId = token.team_id || token.user_id
      if (!accountId) throw new Error('Vercel did not return an account or team identifier.')
      await saveProviderConnection({ user_id: state.userId, provider: 'vercel', account_id: accountId, team_id: token.team_id || null, encrypted_access_token: encryptToken(token.access_token), scopes: ['project:read-write', 'deployment:read-write'], updated_at: new Date().toISOString() })
    }
    page(response, 200, `${state.provider === 'github' ? 'GitHub' : 'Vercel'} connected`, 'Return to project.X and select Refresh. You may close this browser tab.')
  } catch (error) {
    page(response, 400, 'Connection failed', error instanceof Error ? error.message : 'Provider authorization failed.')
  }
}
