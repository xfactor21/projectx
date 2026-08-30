/// <reference types="node" />
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto'

type Provider = 'github' | 'vercel'
type StatePayload = { userId: string; provider: Provider; expiresAt: number; nonce: string }

function secret(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not configured.`)
  return value
}

function base64url(value: string | Buffer): string { return Buffer.from(value).toString('base64url') }

export function createProviderState(userId: string, provider: Provider): string {
  const payload: StatePayload = { userId, provider, expiresAt: Date.now() + 10 * 60_000, nonce: randomBytes(16).toString('hex') }
  const encoded = base64url(JSON.stringify(payload))
  const signature = createHmac('sha256', secret('PROJECTX_OAUTH_STATE_SECRET')).update(encoded).digest('base64url')
  return `${encoded}.${signature}`
}

export function verifyProviderState(state: string): StatePayload {
  const [encoded, supplied] = state.split('.')
  if (!encoded || !supplied) throw new Error('Provider authorization state is malformed.')
  const expected = createHmac('sha256', secret('PROJECTX_OAUTH_STATE_SECRET')).update(encoded).digest('base64url')
  if (supplied.length !== expected.length || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) throw new Error('Provider authorization state is invalid.')
  const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as StatePayload
  if (!payload.userId || !['github', 'vercel'].includes(payload.provider) || payload.expiresAt < Date.now()) throw new Error('Provider authorization state expired or is invalid.')
  return payload
}

function timingSafeEqual(left: Buffer, right: Buffer): boolean {
  if (left.length !== right.length) return false
  let result = 0
  for (let index = 0; index < left.length; index += 1) result |= left[index] ^ right[index]
  return result === 0
}

export function encryptToken(token: string): string {
  const key = Buffer.from(secret('PROJECTX_PROVIDER_ENCRYPTION_KEY'), 'base64')
  if (key.length !== 32) throw new Error('PROJECTX_PROVIDER_ENCRYPTION_KEY must be a base64-encoded 32-byte key.')
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()])
  return [iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.')
}

export function decryptToken(value: string): string {
  const key = Buffer.from(secret('PROJECTX_PROVIDER_ENCRYPTION_KEY'), 'base64')
  const [iv, tag, encrypted] = value.split('.').map((part) => Buffer.from(part, 'base64url'))
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
}

function supabaseConfig() {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!url || !key) throw new Error('Supabase service storage is not configured for provider connections.')
  return { url, key }
}

export async function saveProviderConnection(row: Record<string, unknown>): Promise<void> {
  const { url, key } = supabaseConfig()
  const response = await fetch(`${url}/rest/v1/projectx_provider_connections?on_conflict=user_id,provider,account_id`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify(row),
  })
  if (!response.ok) throw new Error(`Unable to save provider connection (${response.status}).`)
}

export async function loadProviderConnection(userId: string, provider: Provider): Promise<{ token: string; teamId?: string } | null> {
  const { url, key } = supabaseConfig()
  const response = await fetch(`${url}/rest/v1/projectx_provider_connections?user_id=eq.${encodeURIComponent(userId)}&provider=eq.${provider}&select=encrypted_access_token,team_id&limit=1`, { headers: { apikey: key, Authorization: `Bearer ${key}` } })
  if (!response.ok) throw new Error(`Unable to load provider connection (${response.status}).`)
  const rows = await response.json() as Array<{ encrypted_access_token?: string; team_id?: string }>
  return rows[0]?.encrypted_access_token ? { token: decryptToken(rows[0].encrypted_access_token), teamId: rows[0].team_id || undefined } : null
}
