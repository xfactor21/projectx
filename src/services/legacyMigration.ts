const PROJECTS_KEY = 'projectx.projects.v1'
const LOCAL_KEY = 'projectx.local.sources.v1'
const BACKUP_KEY = 'projectx.legacy.seed-backup.v1'
const MIGRATION_KEY = 'projectx.migration.real-projects.v1'

type StoredProject = {
  id?: string
  name?: string
  kicker?: string
  [key: string]: unknown
}

type LocalSource = { projectId?: string }

const legacySignatures = new Map<string, { name: string; kicker: string }>([
  ['xos', { name: 'xOS', kicker: 'Developer operating system' }],
  ['voice-studio-x', { name: 'Voice Studio X', kicker: 'AI voice creation suite' }],
  ['x-ide', { name: 'X IDE', kicker: 'Mobile development environment' }],
  ['solar-signal', { name: 'Solar Signal', kicker: 'Pattern intelligence system' }],
  ['project-x', { name: 'project.X', kicker: 'Visual app manager' }],
])

export function quarantineLegacyStarterProjects() {
  try {
    if (localStorage.getItem(MIGRATION_KEY) === 'done') return
    const projects = JSON.parse(localStorage.getItem(PROJECTS_KEY) || '[]') as StoredProject[]
    const sources = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]') as LocalSource[]
    if (!Array.isArray(projects)) {
      localStorage.setItem(MIGRATION_KEY, 'done')
      return
    }
    const localIds = new Set(Array.isArray(sources) ? sources.map((source) => source.projectId).filter(Boolean) : [])
    const quarantined: StoredProject[] = []
    const retained = projects.filter((project) => {
      const id = project.id || ''
      const signature = legacySignatures.get(id)
      if (!signature || localIds.has(id)) return true
      const isOriginalStarterIdentity = project.name === signature.name && project.kicker === signature.kicker
      if (!isOriginalStarterIdentity) return true
      quarantined.push(project)
      return false
    })

    if (quarantined.length) {
      localStorage.setItem(BACKUP_KEY, JSON.stringify({
        migratedAt: new Date().toISOString(),
        reason: 'Removed legacy prototype starter records from the real project workspace.',
        projects: quarantined,
      }))
      localStorage.setItem(PROJECTS_KEY, JSON.stringify(retained))
    }
    localStorage.setItem(MIGRATION_KEY, 'done')
  } catch {
    // Migration must never prevent project.X from opening. Existing data remains untouched on parse/storage failure.
  }
}
