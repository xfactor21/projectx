import { useEffect, useMemo, useState } from 'react'
import { getDesktopHost } from './services/desktop'
import type { DesktopProjectSummary, ProjectInitializationResult } from './services/desktop'
import { fetchPublicRepos } from './services/github'

const PROJECTS_KEY = 'projectx.projects.v1'
const LOCAL_KEY = 'projectx.local.sources.v1'
const OWNER_KEY = 'projectx.github.owner.v1'

type LauncherView = 'root' | 'new' | 'zip' | 'local' | 'result'

type TauriDropPayload =
  | { type: 'over'; position?: { x: number; y: number } }
  | { type: 'drop'; paths: string[]; position?: { x: number; y: number } }
  | { type: 'leave' }

type GlobalTauri = {
  webview?: {
    getCurrentWebview?: () => {
      onDragDropEvent: (handler: (event: { payload: TauriDropPayload }) => void) => Promise<() => void>
    }
  }
}

declare global {
  interface Window {
    __TAURI__?: GlobalTauri
  }
}

function readArray<T>(key: string): T[] {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]')
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}

function projectId(name: string) {
  return `local-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}-${Date.now().toString().slice(-6)}`
}

function persistDesktopProject(summary: DesktopProjectSummary, kind: 'desktop' | 'managed' | 'zip' | 'generated', source?: string) {
  const projects = readArray<Record<string, unknown>>(PROJECTS_KEY)
  const localSources = readArray<Record<string, unknown>>(LOCAL_KEY)
  const existing = localSources.find((item) => item.path === summary.path) as { projectId?: string } | undefined
  const id = existing?.projectId || projectId(summary.name)
  const remote = summary.git?.remote || ''
  const project = {
    id,
    name: summary.name,
    kicker: kind === 'managed' ? 'Managed Windows project' : kind === 'zip' ? 'Initialized from ZIP' : kind === 'generated' ? 'Created by project.X' : 'Local Windows project',
    description: kind === 'managed'
      ? 'Managed inside the project.X Windows workspace.'
      : kind === 'zip'
        ? `Initialized by project.X${source ? ` from ${source.split(/[\\/]/).pop()}` : ''}.`
        : kind === 'generated'
          ? 'Created and initialized by project.X.'
          : 'Linked to an existing Windows project folder.',
    status: 'Building',
    stack: summary.frameworkHints || [],
    accent: 'cyan',
    updated: 'Just now',
    progress: 10,
    favorite: false,
    archived: false,
    repoUrl: remote.startsWith('http') ? remote.replace(/\.git$/i, '') : '',
    liveUrl: '',
    notes: summary.git ? `Local Git repository${summary.git.branch ? ` · ${summary.git.branch}` : ''}` : 'Local project · Git not detected',
    coverUrl: '',
  }
  const filtered = projects.filter((item) => item.id !== id)
  localStorage.setItem(PROJECTS_KEY, JSON.stringify([project, ...filtered]))
  const nextSource = {
    projectId: id,
    kind,
    label: summary.path,
    path: summary.path,
    gitBranch: summary.git?.branch,
    hasGit: Boolean(summary.git),
    scripts: summary.scripts || [],
    source,
    linkedAt: new Date().toISOString(),
  }
  localStorage.setItem(LOCAL_KEY, JSON.stringify([...localSources.filter((item) => item.projectId !== id), nextSource]))
}

export default function AddProjectLauncher() {
  const desktop = getDesktopHost()
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<LauncherView>('root')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('Choose how project.X should bring this project to life.')
  const [zipPath, setZipPath] = useState('')
  const [installDeps, setInstallDeps] = useState(true)
  const [result, setResult] = useState<ProjectInitializationResult | null>(null)
  const [newName, setNewName] = useState('')
  const [template, setTemplate] = useState('react-ts')
  const [dragging, setDragging] = useState(false)

  const canRun = useMemo(() => result?.summary.scripts?.includes('dev') || result?.summary.scripts?.includes('start'), [result])

  useEffect(() => {
    const current = window.__TAURI__?.webview?.getCurrentWebview?.()
    if (!current?.onDragDropEvent) return
    let cleanup: (() => void) | undefined
    void current.onDragDropEvent((event) => {
      if (event.payload.type === 'over') setDragging(true)
      if (event.payload.type === 'leave') setDragging(false)
      if (event.payload.type === 'drop') {
        setDragging(false)
        const zip = event.payload.paths.find((path) => path.toLowerCase().endsWith('.zip'))
        if (zip) {
          setZipPath(zip)
          setView('zip')
          setOpen(true)
          setMessage(`ZIP detected: ${zip.split(/[\\/]/).pop()}`)
        }
      }
    }).then((unlisten) => { cleanup = unlisten })
    return () => cleanup?.()
  }, [])

  function reset(next: LauncherView = 'root') {
    setView(next)
    setMessage('Choose how project.X should bring this project to life.')
    setResult(null)
  }

  async function linkFolder(move: boolean) {
    if (!desktop) {
      setMessage('Local folder management requires the Windows desktop app.')
      return
    }
    setBusy(true)
    try {
      const selected = await desktop.selectProjectFolder()
      if (!selected) return
      if (move) {
        const moved = await desktop.moveProjectIntoWorkspace(selected.path)
        persistDesktopProject(moved.summary, 'managed', moved.relocation.originalPath)
        setMessage(`Moved ${moved.summary.name} into project.X Workspace. Original location is saved for restore.`)
      } else {
        persistDesktopProject(selected, 'desktop')
        setMessage(`Linked ${selected.name} in place. project.X will leave its folder where it is.`)
      }
      setView('result')
      window.setTimeout(() => window.location.reload(), 800)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to add the folder.')
    } finally {
      setBusy(false)
    }
  }

  async function chooseZip() {
    if (!desktop) {
      setMessage('ZIP initialization requires the Windows desktop app.')
      return
    }
    const selected = await desktop.selectZipFile()
    if (selected) {
      setZipPath(selected)
      setMessage(`ZIP selected: ${selected.split(/[\\/]/).pop()}`)
    }
  }

  async function initializeZip() {
    if (!desktop || !zipPath) return
    setBusy(true)
    setMessage(installDeps ? 'Unpacking, scanning and installing dependencies…' : 'Unpacking and scanning project…')
    try {
      const initialized = await desktop.initializeZipProject(zipPath, installDeps)
      persistDesktopProject(initialized.summary, 'zip', initialized.source)
      setResult(initialized)
      setView('result')
      setMessage(initialized.install && !initialized.install.ok
        ? `Project initialized, but dependency install reported a problem: ${initialized.install.output}`
        : `Initialized ${initialized.summary.name}${initialized.packageManager ? ` with ${initialized.packageManager}` : ''}.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'ZIP initialization failed.')
    } finally {
      setBusy(false)
    }
  }

  async function createProject() {
    if (!desktop || !newName.trim()) return
    setBusy(true)
    setMessage('Creating starter, installing dependencies and scanning project…')
    try {
      const initialized = await desktop.createViteProject(newName.trim(), template)
      persistDesktopProject(initialized.summary, 'generated', initialized.source)
      setResult(initialized)
      setView('result')
      setMessage(`Created ${initialized.summary.name}.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Project creation failed.')
    } finally {
      setBusy(false)
    }
  }

  async function runInitialized() {
    if (!desktop || !result) return
    const script = result.summary.scripts?.includes('dev') ? 'dev' : result.summary.scripts?.includes('start') ? 'start' : ''
    if (!script) return
    setBusy(true)
    try {
      const run = await desktop.runDevProject(result.summary.path, script)
      setMessage(run.output)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to start project.')
    } finally {
      setBusy(false)
    }
  }

  async function connectGitHub() {
    setBusy(true)
    try {
      const owner = localStorage.getItem(OWNER_KEY) || 'xfactor21'
      await fetchPublicRepos(owner)
      setMessage('GitHub repositories loaded. Select exactly which repositories to add in the review window.')
      setOpen(false)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'GitHub discovery failed.')
    } finally {
      setBusy(false)
    }
  }

  function openCloudRestore() {
    setOpen(false)
    const toggle = document.querySelector<HTMLButtonElement>('.cloud-dock-toggle')
    toggle?.click()
  }

  return <>
    {dragging && <div className="px-drop-veil"><div><span>DROP PROJECT ZIP</span><strong>Initialize with project.X</strong><small>Release anywhere in this window</small></div></div>}
    <button className="project-launcher-fab" type="button" onClick={() => { reset(); setOpen(true) }} aria-label="Add or initialize project">
      <span>+</span><strong>ADD / IMPORT</strong>
    </button>

    {open && <div className="project-launcher-backdrop" onMouseDown={() => setOpen(false)}>
      <section className="project-launcher" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div><small>PROJECT LIFECYCLE</small><h2>{view === 'root' ? 'Bring something into project.X' : view === 'new' ? 'Create a new project' : view === 'zip' ? 'Initialize project ZIP' : view === 'local' ? 'Add an existing folder' : 'Project ready'}</h2></div>
          <button type="button" onClick={() => setOpen(false)}>×</button>
        </header>
        <p className="launcher-message">{message}</p>

        {view === 'root' && <div className="launcher-option-grid">
          <button type="button" onClick={() => reset('new')}><b>01</b><strong>New project</strong><span>Scaffold, install and initialize inside project.X.</span></button>
          <button type="button" onClick={() => reset('local')}><b>02</b><strong>Local folder</strong><span>Link it where it lives or move it into the managed workspace.</span></button>
          <button type="button" onClick={() => reset('zip')}><b>03</b><strong>Project ZIP</strong><span>Drop or choose an archive, unpack it, detect its stack and install dependencies.</span></button>
          <button type="button" onClick={() => void connectGitHub()}><b>04</b><strong>GitHub</strong><span>Discover repositories, then select exactly which ones become projects.</span></button>
          <button type="button" onClick={openCloudRestore}><b>05</b><strong>Restore cloud workspace</strong><span>Bring project records back from your project.X account.</span></button>
          <button type="button" className="launcher-future"><b>06</b><strong>Attach to existing</strong><span>Merge an incoming archive/file set into an existing project with a change preview.</span><em>SAFE MERGE ENGINE NEXT</em></button>
        </div>}

        {view === 'local' && <div className="launcher-choice-stack">
          <button type="button" disabled={busy || !desktop} onClick={() => void linkFolder(false)}><strong>Link folder in place</strong><span>Keep the files exactly where they are. project.X receives explicit permission to manage that folder.</span></button>
          <button type="button" disabled={busy || !desktop} onClick={() => void linkFolder(true)}><strong>Move into project.X Workspace</strong><span>Relocate it to Documents\project.X Workspace and save the original path for one-click restore.</span></button>
        </div>}

        {view === 'zip' && <div className="launcher-zip-flow">
          <button type="button" className="zip-drop-zone" disabled={!desktop || busy} onClick={() => void chooseZip()}>
            <strong>{zipPath ? zipPath.split(/[\\/]/).pop() : 'Drop a .zip anywhere or choose one'}</strong>
            <span>{zipPath || 'The Windows app will initialize it directly from disk.'}</span>
          </button>
          <label className="launcher-check"><input type="checkbox" checked={installDeps} onChange={(event) => setInstallDeps(event.target.checked)} /><span><strong>Install detected dependencies automatically</strong><small>Uses the archive lockfile/package manifest to choose npm, pnpm, yarn or Bun.</small></span></label>
          <button type="button" className="launcher-primary" disabled={!zipPath || busy || !desktop} onClick={() => void initializeZip()}>{busy ? 'Initializing…' : 'Initialize project'}</button>
        </div>}

        {view === 'new' && <div className="launcher-new-flow">
          <label><span>Project name</span><input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="my-next-project" /></label>
          <label><span>Starter</span><select value={template} onChange={(event) => setTemplate(event.target.value)}><option value="react-ts">React + TypeScript</option><option value="react">React + JavaScript</option><option value="vue-ts">Vue + TypeScript</option><option value="vue">Vue + JavaScript</option><option value="svelte-ts">Svelte + TypeScript</option><option value="svelte">Svelte + JavaScript</option><option value="vanilla-ts">Vanilla + TypeScript</option></select></label>
          <div className="launcher-plan"><span>project.X will</span><strong>Create managed folder → scaffold → npm install → scan → register project</strong></div>
          <button type="button" className="launcher-primary" disabled={!newName.trim() || busy || !desktop} onClick={() => void createProject()}>{busy ? 'Building project…' : 'Create + initialize'}</button>
        </div>}

        {view === 'result' && <div className="launcher-result">
          {result && <><div className="result-mark">✓</div><strong>{result.summary.name}</strong><span>{result.summary.frameworkHints?.join(' · ') || 'Project initialized'}</span><small>{result.summary.path}</small>
            <div className="result-actions"><button type="button" disabled={!canRun || busy} onClick={() => void runInitialized()}>▶ Run now</button><button type="button" onClick={() => desktop?.openInExplorer(result.summary.path)}>Open folder</button><button type="button" onClick={() => desktop?.openInTerminal(result.summary.path)}>Terminal</button></div></>}
          {!result && <div className="result-mark">✓</div>}
        </div>}

        {view !== 'root' && <footer><button type="button" onClick={() => reset('root')}>← All import options</button></footer>}
      </section>
    </div>}
  </>
}
