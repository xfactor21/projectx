import { getSupabasePublishableKey, getSupabaseUrl, loadSession } from './supabase'

const BUCKET = 'projectx-companion-packages'

function requireSession() {
  const session = loadSession()
  if (!session) throw new Error('Sign in before sending a project package.')
  return session
}

function baseHeaders() {
  const session = requireSession()
  return {
    apikey: getSupabasePublishableKey(),
    Authorization: `Bearer ${session.access_token}`,
  }
}

async function storageError(response: Response, fallback: string): Promise<Error> {
  const detail = await response.text()
  const normalized = detail.toLowerCase()
  if (normalized.includes('bucket') || normalized.includes('not found')) {
    return new Error('Companion package storage is not installed in this Supabase project. Apply the project.X companion-package migration, then retry.')
  }
  return new Error(detail || `${fallback} (${response.status}).`)
}

export async function uploadCompanionZip(file: File): Promise<{ storagePath: string; fileName: string; bytes: number }> {
  if (!file.name.toLowerCase().endsWith('.zip')) throw new Error('Choose a .zip project archive.')
  if (file.size > 100 * 1024 * 1024) throw new Error('Companion ZIP uploads are limited to 100 MB.')
  const session = requireSession()
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'project.zip'
  const storagePath = `${session.user.id}/${crypto.randomUUID()}-${safeName}`
  const response = await fetch(`${getSupabaseUrl()}/storage/v1/object/${BUCKET}/${storagePath}`, {
    method: 'POST',
    headers: {
      ...baseHeaders(),
      'Content-Type': file.type || 'application/zip',
      'x-upsert': 'false',
    },
    body: file,
  })
  if (!response.ok) throw await storageError(response, 'Project upload failed')
  return { storagePath, fileName: file.name, bytes: file.size }
}

export async function createCompanionZipSignedUrl(storagePath: string, expiresIn = 600): Promise<string> {
  const response = await fetch(`${getSupabaseUrl()}/storage/v1/object/sign/${BUCKET}/${storagePath}`, {
    method: 'POST',
    headers: { ...baseHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresIn }),
  })
  if (!response.ok) throw await storageError(response, 'Unable to prepare project package')
  const body = await response.json() as { signedURL?: string; signedUrl?: string }
  const signed = body.signedURL || body.signedUrl
  if (!signed) throw new Error('Supabase did not return a signed package URL.')
  return signed.startsWith('http') ? signed : `${getSupabaseUrl()}/storage/v1${signed}`
}

export async function deleteCompanionZip(storagePath: string): Promise<void> {
  const response = await fetch(`${getSupabaseUrl()}/storage/v1/object/${BUCKET}`, {
    method: 'DELETE',
    headers: { ...baseHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefixes: [storagePath] }),
  })
  if (!response.ok) throw await storageError(response, 'Unable to remove project package')
}
