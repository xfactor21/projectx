export const PROJECTS_KEY = 'projectx.projects.v1'
export const LOCAL_SOURCES_KEY = 'projectx.local.sources.v1'

type JsonRecord = Record<string, unknown>

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function isProjectRecord(value: unknown): value is JsonRecord & { id: string; name: string } {
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id.trim() || typeof value.name !== 'string' || !value.name.trim()) return false
  const stringFields = ['kicker', 'description', 'status', 'accent', 'updated', 'repoUrl', 'liveUrl', 'coverUrl', 'notes', 'artworkSource']
  if (stringFields.some((field) => value[field] !== undefined && typeof value[field] !== 'string')) return false
  if (['favorite', 'archived'].some((field) => value[field] !== undefined && typeof value[field] !== 'boolean')) return false
  if (value.stack !== undefined && (!Array.isArray(value.stack) || value.stack.some((item) => typeof item !== 'string'))) return false
  if (value.progress !== undefined && (typeof value.progress !== 'number' || !Number.isFinite(value.progress) || value.progress < 0 || value.progress > 100)) return false
  if (value.github !== undefined && value.github !== null && !isRecord(value.github)) return false
  return true
}

export function isLocalSourceRecord(value: unknown): value is JsonRecord & { projectId: string } {
  return isRecord(value) && typeof value.projectId === 'string' && Boolean(value.projectId.trim()) &&
    (value.kind === undefined || typeof value.kind === 'string') &&
    (value.label === undefined || typeof value.label === 'string') &&
    (value.path === undefined || typeof value.path === 'string') &&
    (value.scripts === undefined || (Array.isArray(value.scripts) && value.scripts.every((item) => typeof item === 'string')))
}

function readValidated<T>(key: string, validator: (value: unknown) => value is T): T[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) || '[]')
    return Array.isArray(parsed) ? parsed.filter(validator) : []
  } catch { return [] }
}

export function readProjects<T extends JsonRecord & { id: string; name: string }>(): T[] {
  return readValidated(PROJECTS_KEY, isProjectRecord) as T[]
}

export function readLocalSources<T extends JsonRecord & { projectId: string }>(): T[] {
  return readValidated(LOCAL_SOURCES_KEY, isLocalSourceRecord) as T[]
}

export function parseProjectBackup(text: string): Array<JsonRecord & { id: string; name: string }> {
  const parsed: unknown = JSON.parse(text)
  const values = Array.isArray(parsed) ? parsed : isRecord(parsed) && Array.isArray(parsed.projects) ? parsed.projects : null
  if (!values) throw new Error('Backup must contain a project array.')
  if (!values.length) throw new Error('Backup contains no project records.')
  const invalidIndex = values.findIndex((value) => !isProjectRecord(value))
  if (invalidIndex >= 0) throw new Error(`Backup project ${invalidIndex + 1} is malformed and was not imported.`)
  return values as Array<JsonRecord & { id: string; name: string }>
}

export function deleteProjectAndLocalSource(projectId: string): void {
  const projects = readProjects().filter((project) => project.id !== projectId)
  const sources = readLocalSources().filter((source) => source.projectId !== projectId)
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects))
  localStorage.setItem(LOCAL_SOURCES_KEY, JSON.stringify(sources))
  window.dispatchEvent(new CustomEvent('projectx:projects-changed'))
}
