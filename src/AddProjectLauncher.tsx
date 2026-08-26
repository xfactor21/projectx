import { useEffect, useState } from 'react'
import { getDesktopHost } from './services/desktop'
import type { DesktopProjectSummary, ProjectInitializationResult, ZipMergePreview } from './services/desktop'
import { fetchPublicRepos } from './services/github'
import { isGitHubOwner } from './services/workspaceBackup'

const PROJECTS_KEY = 'projectx.projects.v1'
const LOCAL_KEY = 'projectx.local.sources.v1'
const OWNER_KEY = 'projectx.github.owner.v1'

type LauncherView = 'root' | 'new' | 'zip' | 'local' | 'attach' | 'github' | 'result'

type LocalSource = {
  projectId: string
  kind?: string
  label?: string
  path?: string
  scripts?: string[]
}

type StoredProject = { id: string; name?: string; stack?: string[]; updated?: string } & Record<string, unknown>

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
  } catch { return [] }
}

function projectId(name: string) {
  return `local-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}-${Date.now().toString().slice(-6)}`
}

function notifyProjectsChanged() {
  window.dispatchEvent(new CustomEvent('projectx:projects-changed'))
}

function persistDesktopProject(summary: DesktopProjectSummary, kind: 'desktop' | 'managed' | 'zip' | 'generated', source?: string) {
  const projects = readArray<StoredProject>(PROJECTS_KEY)
  const localSources = readArray<LocalSource>(LOCAL_KEY)
  const existing = localSources.find((item) => item.path === summary.path)
  const id = existing?.projectId || projectId(summary.name)
  const remote = summary.git?.remote || ''
  const prior = projects.find((item) => item.id === id)
  const project = {
    ...prior,
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
    status: prior?.status || 'Building',
    stack: summary.frameworkHints || prior?.stack || [],
    accent: prior?.accent || 'cyan',
    updated: 'Just now',
    progress: prior?.progress ?? 10,
    favorite: prior?.favorite ?? false,
    archived: prior?.archived ?? false,
    repoUrl: remote.startsWith('http') ? remote.replace(/\.git$/i, '') : prior?.repoUrl || '',
    liveUrl: prior?.liveUrl || '',
    notes: summary.git ? `Local Git repository${summary.git.branch ? ` · ${summary.git.branch}` : ''}` : 'Local project · Git not detected',
    coverUrl: prior?.coverUrl || '',
  }
  localStorage.setItem(PROJECTS_KEY, JSON.stringify([project, ...projects.filter((item) => item.id !== id)]))
  const nextSource: LocalSource = {
    ...existing,
    projectId: id,
    kind,
    label: summary.path,
    path: summary.path,
    scripts: summary.scripts || [],
  }
  localStorage.setItem(LOCAL_KEY, JSON.stringify([...localSources.filter((item) => item.projectId !== id), nextSource]))
  notifyProjectsChanged()
}

function refreshExistingProject(projectIdValue: string, summary: DesktopProjectSummary) {
  const projects = readArray<StoredProject>(PROJECTS_KEY)
  const localSources = readArray<LocalSource>(LOCAL_KEY)
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects.map((project) => project.id === projectIdValue ? {
    ...project,
    name: summary.name || project.name,
    stack: summary.frameworkHints || project.stack || [],
    updated: 'Just now',
  } : project)))
  localStorage.setItem(LOCAL_KEY, JSON.stringify(localSources.map((source) => source.projectId === projectIdValue ? {
    ...source,
    path: summary.path,
    scripts: summary.scripts || [],
    label: summary.path,
  } : source)))
  notifyProjectsChanged()
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
  const [attachTarget, setAttachTarget] = useState('')
  const [mergePreview, setMergePreview] = useState<ZipMergePreview | null>(null)
  const [githubOwner, setGitHubOwner] = useState(() => localStorage.getItem(OWNER_KEY) || '')

  const canRun = Boolean(result?.summary.scripts?.includes('dev') || result?.summary.scripts?.includes('start'))
  const localSources = readArray<LocalSource>(LOCAL_KEY).filter((source) => source.path && source.kind !== 'browser')
  const projects = readArray<StoredProject>(PROJECTS_KEY)
  const attachTargets = localSources.map((source) => ({ ...source, name: projects.find((project) => project.id === source.projectId)?.name || source.label || source.projectId }))

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
          setMergePreview(null)
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
    setMergePreview(null)
    if (next === 'github') setGitHubOwner(localStorage.getItem(OWNER_KEY) || '')
  }

  async function linkFolder(move: boolean) {
    if (!desktop) return setMessage('Local folder management requires the Windows desktop app.')
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
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to add the folder.')
    } finally { setBusy(false) }
  }

  async function chooseZip() {
    if (!desktop) return setMessage('ZIP initialization requires the Windows desktop app.')
    const selected = await desktop.selectZipFile()
    if (selected) {
      setZipPath(selected)
      setMergePreview(null)
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
    } finally { setBusy(false) }
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
    } finally { setBusy(false) }
  }

  async function previewMerge() {
    const target = attachTargets.find((item) => item.projectId === attachTarget)
    if (!desktop || !zipPath || !target?.path) return
    setBusy(true)
    setMessage('Comparing archive against the existing project…')
    try {
      const preview = await desktop.previewZipMerge(zipPath, target.path)
      setMergePreview(preview)
      setMessage(`Preview ready: ${preview.addedCount} new files, ${preview.replacedCount} replacements.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to preview merge.')
    } finally { setBusy(false) }
  }

  async function applyMerge() {
    const target = attachTargets.find((item) => item.projectId === attachTarget)
    if (!desktop || !zipPath || !target?.path || !mergePreview) return
    if (mergePreview.replacedCount > 0 && !window.confirm(`Apply this merge? ${mergePreview.replacedCount} existing files will be replaced after project.X backs them up.`)) return
    setBusy(true)
    setMessage('Backing up replacements and applying merge…')
    try {
      const merged = await desktop.applyZipMerge(zipPath, target.path)
      refreshExistingProject(target.projectId, merged.summary)
      setMergePreview(null)
      setMessage(`Merge complete: ${merged.addedCount} added, ${merged.replacedCount} replaced. Backup: ${merged.backupPath}`)
      setView('result')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to apply merge.')
    } finally { setBusy(false) }
  }

  async function runInitialized() {
    if (!desktop || !result) return
    const script = ['dev', 'web', 'start', 'serve'].find((candidate) => result.summary.scripts?.includes(candidate)) || ''
    if (!script) return
    setBusy(true)
    try {
      const run = await desktop.runDevProject(result.summary.path, script)
      if (!run.ok || !run.pid) throw new Error(run.output || 'Unable to start project.')
      setMessage(run.output)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to start project.')
    } finally { setBusy(false) }
  }

  async function connectGitHub() {
    const owner = githubOwner.trim()
    if (!isGitHubOwner(owner)) return setMessage('Enter a valid GitHub user or organization name.')
    setBusy(true)
    try {
      localStorage.setItem(OWNER_KEY, owner)
      await fetchPublicRepos(owner)
      setMessage('GitHub repositories loaded. Select exactly which repositories to add in the review window.')
      setOpen(false)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'GitHub discovery failed.')
    } finally { setBusy(false) }
  }

  function openCloudRestore() {
    setOpen(false)
    document.querySelector<HTMLButtonElement>('.cloud-dock-toggle')?.click()
  }

  const title = view === 'root' ? 'Bring something into project.X' : view === 'new' ? 'Create a new project' : view === 'zip' ? 'Initialize project ZIP' : view === 'local' ? 'Add an existing folder' : view === 'attach' ? 'Attach ZIP to existing project' : view === 'github' ? 'Connect GitHub repositories' : 'Project ready'

  return <>
    {dragging && <div className="px-drop-veil"><div><span>DROP PROJECT ZIP</span><strong>Initialize with project.X</strong><small>Release anywhere in this window</small></div></div>}
    <button className="project-launcher-fab" type="button" onClick={() => { reset(); setOpen(true) }} aria-label="Add or initialize project"><span>+</span><strong>ADD / IMPORT</strong></button>

    {open && <div className="project-launcher-backdrop" onMouseDown={() => setOpen(false)}><section className="project-launcher" onMouseDown={(event) => event.stopPropagation()}>
      <header><div><small>PROJECT LIFECYCLE</small><h2>{title}</h2></div><button type="button" onClick={() => setOpen(false)}>×</button></header>
      <p className="launcher-message">{message}</p>

      {view === 'root' && <div className="launcher-option-grid">
        <button type="button" onClick={() => reset('new')}><b>01</b><strong>New project</strong><span>Scaffold, install and initialize inside project.X.</span></button>
        <button type="button" onClick={() => reset('local')}><b>02</b><strong>Local folder</strong><span>Link it where it lives or move it into the managed workspace.</span></button>
        <button type="button" onClick={() => reset('zip')}><b>03</b><strong>Project ZIP</strong><span>Drop or choose an archive, unpack it, detect its stack and install dependencies.</span></button>
        <button type="button" onClick={() => reset('github')}><b>04</b><strong>GitHub</strong><span>Choose a user or organization, then select exactly which repositories become projects.</span></button>
        <button type="button" onClick={openCloudRestore}><b>05</b><strong>Restore cloud workspace</strong><span>Bring project records back from your project.X account.</span></button>
        <button type="button" disabled={!desktop || attachTargets.length === 0} onClick={() => reset('attach')}><b>06</b><strong>Attach to existing</strong><span>Merge a ZIP into an authorized local project with a file-change preview and overwrite backup.</span></button>
      </div>}

      {view === 'local' && <div className="launcher-choice-stack">
        <button type="button" disabled={busy || !desktop} onClick={() => void linkFolder(false)}><strong>Link folder in place</strong><span>Keep the files exactly where they are. project.X receives explicit permission to manage that folder.</span></button>
        <button type="button" disabled={busy || !desktop} onClick={() => void linkFolder(true)}><strong>Move into project.X Workspace</strong><span>Relocate it to Documents\project.X Workspace and save the original path for one-click restore.</span></button>
      </div>}

      {view === 'zip' && <div className="launcher-zip-flow">
        <button type="button" className="zip-drop-zone" disabled={!desktop || busy} onClick={() => void chooseZip()}><strong>{zipPath ? zipPath.split(/[\\/]/).pop() : 'Drop a .zip anywhere or choose one'}</strong><span>{zipPath || 'The Windows app will initialize it directly from disk.'}</span></button>
        <label className="launcher-check"><input type="checkbox" checked={installDeps} onChange={(event) => setInstallDeps(event.target.checked)} /><span><strong>Install detected dependencies automatically</strong><small>Uses the archive lockfile/package manifest to choose npm, pnpm, yarn or Bun.</small></span></label>
        <button type="button" className="launcher-primary" disabled={!zipPath || busy || !desktop} onClick={() => void initializeZip()}>{busy ? 'Initializing…' : 'Initialize project'}</button>
      </div>}

      {view === 'attach' && <div className="launcher-attach-flow">
        <button type="button" className="zip-drop-zone compact" disabled={!desktop || busy} onClick={() => void chooseZip()}><strong>{zipPath ? zipPath.split(/[\\/]/).pop() : 'Choose ZIP to attach'}</strong><span>{zipPath || 'Select the incoming archive.'}</span></button>
        <label><span>Target project</span><select value={attachTarget} onChange={(event) => { setAttachTarget(event.target.value); setMergePreview(null) }}><option value="">Select authorized project…</option>{attachTargets.map((target) => <option key={target.projectId} value={target.projectId}>{target.name}</option>)}</select></label>
        <button type="button" className="launcher-primary" disabled={!zipPath || !attachTarget || busy} onClick={() => void previewMerge()}>{busy ? 'Comparing…' : 'Preview merge'}</button>
        {mergePreview && <div className="merge-preview"><div className="merge-counts"><span><b>{mergePreview.addedCount}</b> NEW</span><span className={mergePreview.replacedCount ? 'warn' : ''}><b>{mergePreview.replacedCount}</b> REPLACE</span></div><div className="merge-files"><section><strong>New files</strong>{mergePreview.added.length ? mergePreview.added.slice(0, 28).map((file) => <code key={file}>+ {file}</code>) : <small>None</small>}</section><section><strong>Existing files to replace</strong>{mergePreview.replaced.length ? mergePreview.replaced.slice(0, 28).map((file) => <code key={file}>~ {file}</code>) : <small>None</small>}</section></div><button type="button" className="launcher-primary merge-apply" disabled={busy} onClick={() => void applyMerge()}>Back up + apply merge</button></div>}
      </div>}

      {view === 'new' && <div className="launcher-new-flow">
        <label><span>Project name</span><input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="my-next-project" /></label>
        <label><span>Starter</span><select value={template} onChange={(event) => setTemplate(event.target.value)}><option value="react-ts">React + TypeScript</option><option value="react">React + JavaScript</option><option value="vue-ts">Vue + TypeScript</option><option value="vue">Vue + JavaScript</option><option value="svelte-ts">Svelte + TypeScript</option><option value="svelte">Svelte + JavaScript</option><option value="vanilla-ts">Vanilla + TypeScript</option></select></label>
        <div className="launcher-plan"><span>project.X will</span><strong>Create managed folder → scaffold → npm install → scan → register project</strong></div>
        <button type="button" className="launcher-primary" disabled={!newName.trim() || busy || !desktop} onClick={() => void createProject()}>{busy ? 'Building project…' : 'Create + initialize'}</button>
      </div>}

      {view === 'github' && <div className="launcher-new-flow">
        <label><span>GitHub user or organization</span><input autoComplete="off" value={githubOwner} onChange={(event) => setGitHubOwner(event.target.value)} placeholder="organization-or-user" /></label>
        <div className="launcher-plan"><span>project.X will</span><strong>Load public repositories → show a selection screen → clone only what you approve</strong></div>
        <button type="button" className="launcher-primary" disabled={busy || !isGitHubOwner(githubOwner.trim())} onClick={() => void connectGitHub()}>{busy ? 'Loading repositories…' : 'Review repositories'}</button>
      </div>}

      {view === 'result' && <div className="launcher-result">{result && <><div className="result-mark">✓</div><strong>{result.summary.name}</strong><span>{result.summary.frameworkHints?.join(' · ') || 'Project initialized'}</span><small>{result.summary.path}</small><div className="result-actions"><button type="button" disabled={!canRun || busy} onClick={() => void runInitialized()}>▶ Run now</button><button type="button" onClick={() => desktop?.openInExplorer(result.summary.path)}>Open folder</button><button type="button" onClick={() => desktop?.openInTerminal(result.summary.path)}>Terminal</button></div></>}{!result && <div className="result-mark">✓</div>}</div>}

      {view !== 'root' && <footer><button type="button" onClick={() => reset('root')}>← All import options</button></footer>}
    </section></div>}
  </>
}
