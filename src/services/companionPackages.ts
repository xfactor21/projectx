import { getFreshSession, getSupabasePublishableKey, getSupabaseUrl, loadSession } from './supabase'
import type { SupabaseSession } from './supabase'

const BUCKET = 'projectx-companion-packages'
const MAX_ZIP_BYTES = 100 * 1024 * 1024
const UPLOAD_TIMEOUT_MS = 180_000
const UPLOAD_ATTEMPTS = 3

export type CompanionUploadProgress = {
  attempt: number
  loaded: number
  total: number
  percent: number
  stage: 'hashing' | 'uploading' | 'verifying'
}

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

async function storageError(response: { status: number; text(): Promise<string> }, fallback: string): Promise<Error> {
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

type UploadResponse = { ok: boolean; status: number; text(): Promise<string> }

async function uploadOnce(file: File, session: SupabaseSession, storagePath: string, attempt: number, onProgress?: (progress: CompanionUploadProgress) => void): Promise<UploadResponse> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    const timeout = window.setTimeout(() => {
      request.abort()
      reject(new Error('Project upload timed out after 3 minutes. Check the phone connection and try again.'))
    }, UPLOAD_TIMEOUT_MS)
    request.open('POST', `${getSupabaseUrl()}/storage/v1/object/${BUCKET}/${encodedObjectPath(storagePath)}`)
    for (const [name, value] of Object.entries(baseHeaders(session))) request.setRequestHeader(name, value)
    request.setRequestHeader('Content-Type', 'application/zip')
    request.setRequestHeader('x-upsert', 'false')
    request.setRequestHeader('cache-control', 'no-store')
    request.upload.onprogress = (event) => {
      const total = event.lengthComputable ? event.total : file.size
      onProgress?.({ attempt, loaded: event.loaded, total, percent: total ? Math.min(99, Math.round((event.loaded / total) * 100)) : 0, stage: 'uploading' })
    }
    request.onerror = () => {
      window.clearTimeout(timeout)
      reject(new Error('The phone could not reach project.X package storage. Check your connection and retry.'))
    }
    request.onabort = () => window.clearTimeout(timeout)
    request.onload = () => {
      window.clearTimeout(timeout)
      const responseText = request.responseText
      resolve({ ok: request.status >= 200 && request.status < 300, status: request.status, text: async () => responseText })
    }
    request.send(file)
  })
}

async function sha256(file: File, onProgress?: (progress: CompanionUploadProgress) => void) {
  onProgress?.({ attempt: 1, loaded: 0, total: file.size, percent: 0, stage: 'hashing' })
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  const value = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
  onProgress?.({ attempt: 1, loaded: file.size, total: file.size, percent: 100, stage: 'hashing' })
  return value
}

export async function uploadCompanionZip(file: File, onProgress?: (progress: CompanionUploadProgress) => void): Promise<{ storagePath: string; fileName: string; bytes: number; sha256: string }> {
  if (!file.name.toLowerCase().endsWith('.zip')) throw new Error('Choose a .zip project archive.')
  if (file.size <= 0) throw new Error('The selected ZIP is empty or Android could not read it. Choose the file again from Files.')
  if (file.size > MAX_ZIP_BYTES) throw new Error('Companion ZIP uploads are limited to 100 MB.')

  let session = await freshSession()
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'project.zip'
  const storagePath = `${session.user.id}/${crypto.randomUUID()}-${safeName}`
  const checksum = await sha256(file, onProgress)

  let response: UploadResponse | null = null
  let lastError: unknown
  for (let attempt = 1; attempt <= UPLOAD_ATTEMPTS; attempt += 1) {
    try {
      response = await uploadOnce(file, session, storagePath, attempt, onProgress)
      if (response.status === 401) {
        session = await freshSession()
        response = await uploadOnce(file, session, storagePath, attempt, onProgress)
      }
      if (response.ok) break
      if (response.status < 500 && response.status !== 408 && response.status !== 429) break
      lastError = await storageError(response, 'Project upload failed')
    } catch (error) {
      lastError = error
    }
    if (attempt < UPLOAD_ATTEMPTS) await new Promise((resolve) => window.setTimeout(resolve, 750 * attempt))
  }
  if (!response?.ok) {
    if (response) throw await storageError(response, 'Project upload failed')
    throw lastError instanceof Error ? lastError : new Error('Project upload failed after three attempts.')
  }

  onProgress?.({ attempt: 1, loaded: file.size, total: file.size, percent: 100, stage: 'verifying' })
  return { storagePath, fileName: file.name, bytes: file.size, sha256: checksum }
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
