import { useEffect, useState } from 'react'
import { getDesktopHost } from './services/desktop'
import type { ProjectRelocation } from './services/desktop'
import { browserFolderPickerAvailable, selectBrowserProjectFolder } from './services/localProject'

const PROJECTS_KEY = 'projectx.projects.v1'
const LOCAL_KEY = 'projectx.local.sources.v1'

type StoredProject = Record<string, unknown> & { id: string; name: string }

type LocalSource = {
  projectId: string
  kind: 'desktop' | 'browser'
  label: string
  path?: string
  originalPath?: string
  managed?: boolean
  relocationId?: string
  gitBranch?: string
  hasGit?: boolean
  scripts?: string[]
  linkedAt: string
}

function readArray<T>(key: string): T[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}

function projectIdFor(name: string) {
  return `local-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}-${Date.now().toString().slice(-6)}`
}

export default function LocalProjectDock() {
  const [expanded, setExpanded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('Add an existing project or move it into the project.X managed workspace.')
  const [relocations, setRelocations] = useState<ProjectRelocation[]>([])
  const desktop = getDesktopHost()
  const browserAvailable = browserFolderPickerAvailable()

  useEffect(() => {
    if (!desktop) return
    void desktop.listProjectRelocations().then(setRelocations).catch(() => setRelocations([]))
  }, [desktop])

  function persistProject(
    name: string,
    label: string,
    stack: string[],
    scripts: string[],
    hasGit: boolean,
    gitBranch: string | undefined,
    kind: LocalSource['kind'],
    path?: string,
    relocation?: ProjectRelocation,
  ) {
    const projects = readArray<StoredProject>(PROJECTS_KEY)
    const localSources = readArray<LocalSource>(LOCAL_KEY)
    const id = projectIdFor(name)
    const project = {
      id,
      name,
      kicker: relocation ? 'Managed local project' : 'Local project',
      description: relocation
        ? `Managed by project.X. Original location: ${relocation.originalPath}`
        : `Linked from ${kind === 'desktop' ? 'Windows' : 'this browser'}: ${label}`,
      status: 'Building',
      stack,
      accent: 'cyan',
      updated: 'Just now',
      progress: 10,
      favorite: false,
      archived: false,
      repoUrl: '',
      liveUrl: '',
      notes: hasGit ? `Local Git repository${gitBranch ? ` · ${gitBranch}` : ''}` : 'Local folder · Git not detected',
      coverUrl: '',
    }
    localSources.push({
      projectId: id,
      kind,
      label,
      path,
      originalPath: relocation?.originalPath,
      managed: Boolean(relocation),
      relocationId: relocation?.id,
      gitBranch,
      hasGit,
      scripts,
      linkedAt: new Date().toISOString(),
    })
    localStorage.setItem(PROJECTS_KEY, JSON.stringify([project, ...projects]))
    localStorage.setItem(LOCAL_KEY, JSON.stringify(localSources))
  }

  async function addLocalProject(moveIntoWorkspace: boolean) {
    setBusy(true)
    try {
      if (moveIntoWorkspace && !desktop) {
        throw new Error('Moving a project into project.X requires the Windows desktop app.')
      }

      if (desktop) {
        const selected = await desktop.selectProjectFolder()
        if (!selected) return
        const result = moveIntoWorkspace ? await desktop.moveProjectIntoWorkspace(selected.path) : null
        const summary = result?.summary || selected
        const relocation = result?.relocation
        persistProject(
          summary.name,
          summary.path,
          summary.frameworkHints || [],
          summary.scripts || [],
          Boolean(summary.git),
          summary.git?.branch,
          'desktop',
          summary.path,
          relocation,
        )
        setMessage(relocation
          ? `Moved ${summary.name} into project.X Workspace. Original location saved for restore.`
          : `Linked ${summary.name} without moving its files.`)
      } else {
        const selected = await selectBrowserProjectFolder()
        if (!selected) return
        persistProject(
          selected.name,
          selected.sourceLabel,
          selected.stack,
          selected.scripts,
          selected.hasGit,
          selected.gitBranch,
          'browser',
        )
        setMessage(`Linked ${selected.name} from this browser.`)
      }

      window.setTimeout(() => window.location.reload(), 500)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to add local project.')
    } finally {
      setBusy(false)
    }
  }

  async function restoreRelocation(relocation: ProjectRelocation) {
    if (!desktop) return
    if (!window.confirm(`Restore this project to its original location?\n\n${relocation.originalPath}`)) return
    setBusy(true)
    try {
      const result = await desktop.restoreProjectLocation(relocation.managedPath)
      const sources = readArray<LocalSource>(LOCAL_KEY).map((source) => source.relocationId === relocation.id
        ? { ...source, path: result.summary.path, label: result.summary.path, managed: false }
        : source)
      localStorage.setItem(LOCAL_KEY, JSON.stringify(sources))
      setRelocations(await desktop.listProjectRelocations())
      setMessage(`Restored ${result.summary.name} to ${result.summary.path}.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to restore project location.')
    } finally {
      setBusy(false)
    }
  }

  const activeRelocations = relocations.filter((item) => !item.restoredAt)

  return (
    <aside className={`local-dock ${expanded ? 'open' : ''}`} aria-label="Local project access">
      <button className="local-dock-toggle" type="button" onClick={() => setExpanded((value) => !value)}>
        <span className={`local-dot ${desktop || browserAvailable ? 'online' : ''}`} />
        <strong>LOCAL</strong>
        <span>{desktop ? 'WINDOWS' : browserAvailable ? 'READY' : 'LIMITED'}</span>
      </button>
      {expanded && <div className="local-dock-panel">
        <div className="local-dock-head"><div><small>PROJECT SOURCE</small><strong>{desktop ? 'Windows workspace' : 'Browser folder access'}</strong></div><button type="button" onClick={() => setExpanded(false)}>×</button></div>
        <p>{message}</p>
        <div className="local-action-stack">
          <button className="local-primary" type="button" disabled={busy || (!desktop && !browserAvailable)} onClick={() => void addLocalProject(false)}>{busy ? 'Working…' : '+ Link existing folder'}</button>
          {desktop && <button className="local-secondary" type="button" disabled={busy} onClick={() => void addLocalProject(true)}>⇢ Move into project.X Workspace</button>}
        </div>
        <div className="local-capabilities">
          <span className="yes">✓ Explicit folder permission</span>
          <span className="yes">✓ package.json + framework detection</span>
          <span className="yes">✓ Local Git detection</span>
          <span className={desktop ? 'yes' : 'soon'}>{desktop ? '✓' : '○'} Managed workspace relocation</span>
          <span className={desktop ? 'yes' : 'soon'}>{desktop ? '✓' : '○'} Original location restore record</span>
          <span className={desktop ? 'yes' : 'soon'}>{desktop ? '✓' : '○'} Git + terminal/build host bridge</span>
        </div>
        {desktop && activeRelocations.length > 0 && <div className="relocation-history">
          <small>MANAGED PROJECTS / RESTORE</small>
          {activeRelocations.map((item) => <button key={item.id} type="button" disabled={busy} onClick={() => void restoreRelocation(item)}>
            <strong>{item.managedPath.split(/[\\/]/).pop()}</strong>
            <span>Restore to {item.originalPath}</span>
          </button>)}
        </div>}
        {!desktop && <small className="local-note">The web build can link a user-selected folder, but moving/restoring projects is intentionally reserved for the Windows host.</small>}
      </div>}
    </aside>
  )
}
