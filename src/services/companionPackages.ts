import { getFreshSession, getSupabasePublishableKey, getSupabaseUrl, loadSession } from './supabase'
import type { SupabaseSession } from './supabase'

const BUCKET = 'projectx-companion-packages'
const MAX_ZIP_BYTES = 100 * 1024 * 1024
const UPLOAD_TIMEOUT_MS = 180_000

function requireSession() {
  const session = loadSession()
  if (!session) throw new Error('Sign in before sending a project package.')
  return session
}

async function freshSession(): Promise<SupabaseSession> {
  const current = requireSession()
  const session = await getFreshSession(current)
  if (!session) throw new Error('Your project.X cloud session expired. Sign in again before sending a ZIP.')
  return session
}

function baseHeaders(session: SupabaseSession) {
  return {
    apikey: getSupabasePublishableKey(),
    Authorization: `Bearer ${session.access_token}`,
  }
}

function encodedObjectPath(storagePath: string) {
  return storagePath.split('/').map((part) => encodeURIComponent(part)).join('/')
}

async function assertReadableZip(file: File) {
  if (!file.name.toLowerCase().endsWith('.zip')) throw new Error('Choose a .zip project archive.')
  if (file.size <= 0) throw new Error('The selected ZIP is empty or Android could not read it. Choose the file again from Files.')
  if (file.size > MAX_ZIP_BYTES) throw new Error('Companion ZIP uploads are limited to 100 MB.')
  let head: Uint8Array
  try {
    head = new Uint8Array(await file.slice(0, 4).arrayBuffer())
  } catch {
    throw new Error('Android could not read the selected ZIP. Copy it to local device storage and choose it again from Files.')
  }
  const valid = head.length >= 4 && head[0] === 0x50 && head[1] === 0x4b && (
    (head[2] === 0x03 && head[3] === 0x04) ||
    (head[2] === 0x05 && head[3] === 0x06) ||
    (head[2] === 0x07 && head[3] === 0x08)
  )
  if (!valid) throw new Error('The selected file is named .zip but does not contain a readable ZIP archive.')
}

async function storageError(response: Response, fallback: string): Promise<Error> {
  const detail = await response.text()
  const normalized = detail.toLowerCase()
  if (normalized.includes('bucket') || normalized.includes('not found')) {
    return new Error('Companion package storage is not installed in this Supabase project. Apply the project.X companion-package migration, then retry.')
  }
  if (response.status === 401) return new Error('Your project.X cloud session expired while sending the ZIP. Sign in again and retry.')
  if (response.status === 403 || normalized.includes('row-level security') || normalized.includes('policy')) {
    return new Error('Supabase rejected this ZIP upload. Verify the companion package storage policy is installed for this account.')
  }
  if (response.status === 413 || normalized.includes('too large')) return new Error('The ZIP is too large for Companion upload. Keep project packages under 100 MB.')
  return new Error(detail || `${fallback} (${response.status}).`)
}

async function uploadOnce(file: File, session: SupabaseSession, storagePath: string): Promise<Response> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS)
  try {
    return await fetch(`${getSupabaseUrl()}/storage/v1/object/${BUCKET}/${encodedObjectPath(storagePath)}`, {
      method: 'POST',
      headers: {
        ...baseHeaders(session),
        'Content-Type': 'application/zip',
        'x-upsert': 'false',
        'cache-control': 'no-store',
      },
      body: file,
      cache: 'no-store',
      signal: controller.signal,
    })
  } catch (error) {
    if (controller.signal.aborted) throw new Error('Project upload timed out after 3 minutes. Check the phone connection and try again.')
    if (error instanceof TypeError) throw new Error('The phone could not reach project.X package storage. Check your connection and retry.')
    throw error
  } finally {
    window.clearTimeout(timeout)
  }
}

export async function uploadCompanionZip(file: File): Promise<{ storagePath: string; fileName: string; bytes: number }> {
  await assertReadableZip(file)

  let session = await freshSession()
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'project.zip'
  const storagePath = `${session.user.id}/${crypto.randomUUID()}-${safeName}`

  let response = await uploadOnce(file, session, storagePath)
  if (response.status === 401) {
    session = await freshSession()
    response = await uploadOnce(file, session, storagePath)
  }
  if (!response.ok) throw await storageError(response, 'Project upload failed')

  return { storagePath, fileName: file.name, bytes: file.size }
}

export async function createCompanionZipSignedUrl(storagePath: string, expiresIn = 600): Promise<string> {
  const session = await freshSession()
  if (!storagePath.startsWith(`${session.user.id}/`) || storagePath.includes('..')) throw new Error('Companion package path was rejected.')
  const response = await fetch(`${getSupabaseUrl()}/storage/v1/object/sign/${BUCKET}/${encodedObjectPath(storagePath)}`, {
    method: 'POST',
    headers: { ...baseHeaders(session), 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresIn }),
    cache: 'no-store',
  })
  if (!response.ok) throw await storageError(response, 'Unable to prepare project package')
  const body = await response.json() as { signedURL?: string; signedUrl?: string }
  const signed = body.signedURL || body.signedUrl
  if (!signed) throw new Error('Supabase did not return a signed package URL.')
  return signed.startsWith('http') ? signed : `${getSupabaseUrl()}/storage/v1${signed}`
}

export async function deleteCompanionZip(storagePath: string): Promise<void> {
  const session = await freshSession()
  if (!storagePath.startsWith(`${session.user.id}/`) || storagePath.includes('..')) throw new Error('Companion package path was rejected.')
  const response = await fetch(`${getSupabaseUrl()}/storage/v1/object/${BUCKET}`, {
    method: 'DELETE',
    headers: { ...baseHeaders(session), 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefixes: [storagePath] }),
    cache: 'no-store',
  })
  if (!response.ok) throw await storageError(response, 'Unable to remove project package')
}
