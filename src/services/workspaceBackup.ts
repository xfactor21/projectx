import { APP_SEMVER } from '../version'
import {
  isLocalSourceRecord,
  isProjectRecord,
  LOCAL_SOURCES_KEY,
  PROJECTS_KEY,
} from './projectStorage'

export const BACKUP_FORMAT = 'projectx-workspace-backup'
export const BACKUP_SCHEMA_VERSION = 1
export const GITHUB_OWNER_KEY = 'projectx.github.owner.v1'
export const VIEW_KEY = 'projectx.view.v1'
export const SOUND_KEY = 'projectx.theme.sound.v1'

const THEMES = new Set(['Grid', 'Storefront', 'Vending', 'Comic', 'Gallery', '3D', 'Neon', 'Orbit'])
const OWNER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/

type JsonRecord = Record<string, unknown>
type BackupPreferences = { githubOwner?: string; view?: string; sound?: boolean }

export type WorkspaceBackup = {
  format: typeof BACKUP_FORMAT
  schemaVersion: typeof BACKUP_SCHEMA_VERSION
  createdAt: string
  appVersion: string
  data: {
    projects: Array<JsonRecord & { id: string; name: string }>
    localSources: Array<JsonRecord & { projectId: string }>
    preferences: BackupPreferences
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function parseStoredArray(key: string, validator: (value: unknown) => boolean): unknown[] {
  const parsed: unknown = JSON.parse(localStorage.getItem(key) || '[]')
  if (!Array.isArray(parsed)) throw new Error(`Stored ${key} data is malformed. Repair it before creating a backup.`)
  const invalid = parsed.findIndex((value) => !validator(value))
  if (invalid >= 0) throw new Error(`Stored ${key} record ${invalid + 1} is malformed. Nothing was exported.`)
  return parsed
}

function validateRelationships(
  projects: WorkspaceBackup['data']['projects'],
  localSources: WorkspaceBackup['data']['localSources'],
  label: string,
): void {
  const projectIds = new Set(projects.map((project) => project.id))
  if (projectIds.size !== projects.length) throw new Error(`${label} contains duplicate project IDs.`)
  if (localSources.some((source) => !projectIds.has(source.projectId))) {
    throw new Error(`${label} contains a local source without a matching project.`)
  }
  if (new Set(localSources.map((source) => source.projectId)).size !== localSources.length) {
    throw new Error(`${label} contains duplicate local sources.`)
  }
}

export function isGitHubOwner(value: string): boolean {
  return OWNER_PATTERN.test(value)
}

export function createWorkspaceBackup(): WorkspaceBackup {
  const projects = parseStoredArray(PROJECTS_KEY, isProjectRecord) as WorkspaceBackup['data']['projects']
  const localSources = parseStoredArray(LOCAL_SOURCES_KEY, isLocalSourceRecord) as WorkspaceBackup['data']['localSources']
  validateRelationships(projects, localSources, 'Stored workspace')
  const owner = (localStorage.getItem(GITHUB_OWNER_KEY) || '').trim()
  const sound = localStorage.getItem(SOUND_KEY)
  if (owner && !isGitHubOwner(owner)) throw new Error('The saved GitHub owner is malformed. Correct it before creating a backup.')
  return {
    format: BACKUP_FORMAT,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    appVersion: APP_SEMVER,
    data: {
      projects,
      localSources,
      preferences: {
        ...(owner ? { githubOwner: owner } : {}),
        ...(THEMES.has(localStorage.getItem(VIEW_KEY) || '') ? { view: localStorage.getItem(VIEW_KEY)! } : {}),
        ...(sound !== null ? { sound: sound === 'on' || sound === 'true' } : {}),
      },
    },
  }
}

export function parseWorkspaceBackup(text: string): WorkspaceBackup {
  let parsed: unknown
  try { parsed = JSON.parse(text) } catch { throw new Error('The selected file is not valid JSON.') }
  if (!isRecord(parsed) || parsed.format !== BACKUP_FORMAT || parsed.schemaVersion !== BACKUP_SCHEMA_VERSION || !isRecord(parsed.data)) {
    throw new Error('This is not a supported project.X workspace backup.')
  }
  if (typeof parsed.createdAt !== 'string' || Number.isNaN(Date.parse(parsed.createdAt))) {
    throw new Error('Backup creation date is malformed.')
  }
  if (typeof parsed.appVersion !== 'string' || !parsed.appVersion.trim()) {
    throw new Error('Backup app version is malformed.')
  }
  const projects = parsed.data.projects
  const localSources = parsed.data.localSources
  const preferences = parsed.data.preferences
  if (!Array.isArray(projects) || !projects.every(isProjectRecord)) throw new Error('Backup project records are malformed.')
  if (!Array.isArray(localSources) || !localSources.every(isLocalSourceRecord)) throw new Error('Backup local-source records are malformed.')
  if (!isRecord(preferences)) throw new Error('Backup preferences are malformed.')
  validateRelationships(projects, localSources, 'Backup')
  if (preferences.githubOwner !== undefined && (typeof preferences.githubOwner !== 'string' || !isGitHubOwner(preferences.githubOwner))) throw new Error('Backup GitHub owner is malformed.')
  if (preferences.view !== undefined && (typeof preferences.view !== 'string' || !THEMES.has(preferences.view))) throw new Error('Backup view preference is unsupported.')
  if (preferences.sound !== undefined && typeof preferences.sound !== 'boolean') throw new Error('Backup sound preference is malformed.')
  return parsed as WorkspaceBackup
}

export function restoreWorkspaceBackup(backup: WorkspaceBackup): void {
  const previous = new Map<string, string | null>()
  const values = new Map<string, string | null>([
    [PROJECTS_KEY, JSON.stringify(backup.data.projects)],
    [LOCAL_SOURCES_KEY, JSON.stringify(backup.data.localSources)],
    [GITHUB_OWNER_KEY, backup.data.preferences.githubOwner || null],
    [VIEW_KEY, backup.data.preferences.view || null],
    [SOUND_KEY, backup.data.preferences.sound === undefined ? null : backup.data.preferences.sound ? 'on' : 'off'],
  ])
  values.forEach((_, key) => previous.set(key, localStorage.getItem(key)))
  try {
    values.forEach((value, key) => value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value))
  } catch (error) {
    previous.forEach((value, key) => value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value))
    throw error
  }
  window.dispatchEvent(new CustomEvent('projectx:projects-changed'))
}

export function clearProjectXPersonalData(): number {
  const localKeys = Object.keys(localStorage).filter((key) => key.startsWith('projectx.'))
  const sessionKeys = Object.keys(sessionStorage).filter((key) => key.startsWith('projectx.'))
  localKeys.forEach((key) => localStorage.removeItem(key))
  sessionKeys.forEach((key) => sessionStorage.removeItem(key))
  window.dispatchEvent(new CustomEvent('projectx:projects-changed'))
  return localKeys.length + sessionKeys.length
}
