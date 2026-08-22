import { useState } from 'react'
import { getDesktopHost } from './services/desktop'
import { browserFolderPickerAvailable, selectBrowserProjectFolder } from './services/localProject'

const PROJECTS_KEY = 'projectx.projects.v1'
const LOCAL_KEY = 'projectx.local.sources.v1'

type StoredProject = Record<string, unknown> & { id: string; name: string }

type LocalSource = {
  projectId: string
  kind: 'desktop' | 'browser'
  label: string
  path?: string
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

export default function LocalProjectDock() {
  const [expanded, setExpanded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('Add a project from this computer.')
  const desktop = getDesktopHost()
  const browserAvailable = browserFolderPickerAvailable()

  async function addLocalProject() {
    setBusy(true)
    try {
      let name = ''
      let label = ''
      let path: string | undefined
      let stack: string[] = []
      let scripts: string[] = []
      let hasGit = false
      let gitBranch: string | undefined
      let kind: LocalSource['kind'] = 'browser'

      if (desktop) {
        const result = await desktop.selectProjectFolder()
        if (!result) return
        name = result.name
        label = result.path
        path = result.path
        stack = result.frameworkHints || []
        scripts = result.scripts || []
        hasGit = Boolean(result.git)
        gitBranch = result.git?.branch
        kind = 'desktop'
      } else {
        const result = await selectBrowserProjectFolder()
        if (!result) return
        name = result.name
        label = result.sourceLabel
        stack = result.stack
        scripts = result.scripts
        hasGit = result.hasGit
        gitBranch = result.gitBranch
      }

      const projects = readArray<StoredProject>(PROJECTS_KEY)
      const id = `local-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}-${Date.now().toString().slice(-6)}`
      const project = {
        id,
        name,
        kicker: 'Local project',
        description: `Linked from ${kind === 'desktop' ? 'Windows' : 'this browser'}: ${label}`,
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
      const localSources = readArray<LocalSource>(LOCAL_KEY)
      localSources.push({ projectId: id, kind, label, path, gitBranch, hasGit, scripts, linkedAt: new Date().toISOString() })
      localStorage.setItem(PROJECTS_KEY, JSON.stringify([project, ...projects]))
      localStorage.setItem(LOCAL_KEY, JSON.stringify(localSources))
      setMessage(`Added ${name}. Reloading workspace…`)
      window.setTimeout(() => window.location.reload(), 450)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to add local project.')
    } finally {
      setBusy(false)
    }
  }

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
        <button className="local-primary" type="button" disabled={busy || (!desktop && !browserAvailable)} onClick={() => void addLocalProject()}>{busy ? 'Inspecting…' : '+ Choose project folder'}</button>
        <div className="local-capabilities">
          <span className="yes">✓ Explicit folder permission</span>
          <span className="yes">✓ package.json + framework detection</span>
          <span className="yes">✓ Local Git detection</span>
          <span className={desktop ? 'yes' : 'soon'}>{desktop ? '✓' : '○'} Git commit/push host bridge</span>
          <span className={desktop ? 'yes' : 'soon'}>{desktop ? '✓' : '○'} Terminal/build host bridge</span>
        </div>
        {!desktop && <small className="local-note">The web build never receives an unrestricted disk path. The Windows host contract is already defined for the full desktop version.</small>}
      </div>}
    </aside>
  )
}
