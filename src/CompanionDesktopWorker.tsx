import { useEffect } from 'react'
import { getDesktopHost } from './services/desktop'
import { claimPendingActions, registerCompanionDevice, updateRemoteAction } from './services/companion'
import { createCompanionZipSignedUrl, deleteCompanionZip } from './services/companionPackages'
import { getFreshSession, loadSession, upsertCloudProjects } from './services/supabase'
import { projectInventorySignature, syncLocalProjects } from './services/projectCloudSync'
import type { RemoteAction } from './services/companion'
import type { DesktopProjectSummary } from './services/desktop'
import { recordRunTask } from './services/runTasks'
import { recordWorkspaceActivity } from './services/workspaceActivity'

const DEVICE_KEY = 'projectx.desktop.device.v1'
const LOCAL_KEY = 'projectx.local.sources.v1'
const PROJECTS_KEY = 'projectx.projects.v1'
const HOST_STATUS_KEY = 'projectx.companion.host-status.v1'

type LocalSource = {
  projectId: string
  kind: 'desktop' | 'browser' | 'managed' | 'zip' | 'generated'
  path?: string
  scripts?: string[]
  label?: string
}

type StoredProject = Record<string, unknown> & { id: string; name?: string }

function requireSuccessfulResult(result: unknown) {
  if (typeof result === 'object' && result && 'ok' in result && (result as { ok?: unknown }).ok === false) {
    throw new Error(String((result as { output?: unknown }).output || 'Desktop action failed.'))
  }
  return result
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === 'string' && error.trim()) return error.trim()
  try { return JSON.stringify(error) || 'Desktop action failed.' } catch { return 'Desktop action failed.' }
}

function preferredRunScript(scripts: string[] = []) {
  return ['dev', 'web', 'start', 'serve'].find((script) => scripts.includes(script)) || ''
}

function actionLabelForActivity(actionType: string) {
  return actionType.replace(/[._]/g, ' ').replace(/\b\w/g, (value) => value.toUpperCase())
}

function desktopDeviceId() {
  try {
    const existing = localStorage.getItem(DEVICE_KEY)
    if (existing) return existing
    const next = `windows-${crypto.randomUUID()}`
    localStorage.setItem(DEVICE_KEY, next)
    return next
  } catch { return `windows-${Date.now()}` }
}

function readArray<T>(key: string): T[] {
  try { const value = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(value) ? value : [] }
  catch { return [] }
}
function localSources(): LocalSource[] { return readArray<LocalSource>(LOCAL_KEY).filter((item) => item.kind !== 'browser' && Boolean(item.path)) }
function localSource(projectId?: string | null): LocalSource | null { return projectId ? localSources().find((item) => item.projectId === projectId) || null : null }
function newProjectId(name: string) { return `remote-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}-${Date.now().toString().slice(-6)}` }

function publishHostStatus(status: 'connecting' | 'online' | 'error', detail: string, projectCount = 0) {
  const value = { status, detail, projectCount, updatedAt: new Date().toISOString() }
  localStorage.setItem(HOST_STATUS_KEY, JSON.stringify(value))
  window.dispatchEvent(new CustomEvent('projectx:companion-status', { detail: value }))
}

async function registerInitializedProject(summary: DesktopProjectSummary) {
  const id = newProjectId(summary.name)
  const projects = readArray<StoredProject>(PROJECTS_KEY)
  const sources = readArray<LocalSource>(LOCAL_KEY)
  const project = {
    id,
    name: summary.name,
    kicker: 'Created from companion',
    description: 'ZIP sent through project.X Companion and initialized on this Windows host.',
    status: 'Building',
    stack: summary.frameworkHints || [],
    accent: 'violet',
    updated: 'Just now',
    progress: 10,
    favorite: false,
    archived: false,
    repoUrl: summary.git?.remote?.replace(/\.git$/i, '') || '',
    liveUrl: '',
    notes: 'Companion package handoff',
    coverUrl: '',
  }
  localStorage.setItem(PROJECTS_KEY, JSON.stringify([project, ...projects]))
  localStorage.setItem(LOCAL_KEY, JSON.stringify([...sources, { projectId: id, kind: 'zip', path: summary.path, label: summary.path, scripts: summary.scripts || [] }]))
  window.dispatchEvent(new CustomEvent('projectx:projects-changed'))
  const session = loadSession()
  if (session) {
    try {
      await upsertCloudProjects([{ user_id: session.user.id, client_id: id, name: summary.name, kicker: 'Created from companion', description: 'ZIP initialized remotely on project.X Windows.', status: 'Building', stack: summary.frameworkHints || [], accent: 'violet', progress: 10, favorite: false, archived: false, repo_url: summary.git?.remote?.replace(/\.git$/i, '') || '', live_url: '', notes: 'Companion package handoff' }], session)
    } catch { /* Local creation succeeded even if cloud record refresh fails. */ }
  }
  return id
}

function refreshUpdatedProject(projectId: string, summary: DesktopProjectSummary) {
  const projects = readArray<StoredProject>(PROJECTS_KEY).map((project) => project.id === projectId ? { ...project, name: summary.name || project.name, stack: summary.frameworkHints || [], updated: 'Just now' } : project)
  const sources = readArray<LocalSource>(LOCAL_KEY).map((source) => source.projectId === projectId ? { ...source, path: summary.path, label: summary.path, scripts: summary.scripts || [] } : source)
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects))
  localStorage.setItem(LOCAL_KEY, JSON.stringify(sources))
  window.dispatchEvent(new CustomEvent('projectx:projects-changed'))
}

async function execute(action: RemoteAction) {
  const desktop = getDesktopHost()
  if (!desktop || !action.id) return
  const source = localSource(action.project_client_id)
  await updateRemoteAction(action.id, 'running', undefined, desktopDeviceId())
  try {
    let result: unknown
    if (action.action_type === 'package.create_project' || action.action_type === 'package.update_project') {
      const storagePath = String(action.payload?.storagePath || '')
      const fileName = String(action.payload?.fileName || 'companion-project.zip')
      if (!storagePath) throw new Error('Companion package storage path is missing.')
      if (action.action_type === 'package.update_project' && !source?.path) throw new Error('The target project is not linked to an authorized folder on this Windows device.')
      await updateRemoteAction(action.id, 'running', { stage: 'Preparing secure package download.' }, desktopDeviceId())
      const signedUrl = await createCompanionZipSignedUrl(storagePath, 600)
      const localZip = await desktop.downloadRemotePackage(signedUrl, fileName)
      try {
        if (action.action_type === 'package.create_project') {
          await updateRemoteAction(action.id, 'running', { stage: action.payload?.installDeps === false ? 'Validating and importing project files.' : 'Importing project and installing detected dependencies.' }, desktopDeviceId())
          const initialized = await desktop.initializeZipProject(localZip, action.payload?.installDeps !== false)
          const createdProjectId = await registerInitializedProject(initialized.summary)
          result = { createdProjectId, summary: initialized.summary, install: initialized.install || null }
        } else {
          await updateRemoteAction(action.id, 'running', { stage: 'Validating and merging project files.' }, desktopDeviceId())
          const merged = await desktop.applyZipMerge(localZip, source!.path!)
          refreshUpdatedProject(action.project_client_id!, merged.summary)
          result = { summary: merged.summary, addedCount: merged.addedCount, replacedCount: merged.replacedCount, backupPath: merged.backupPath }
        }
      } finally {
        await desktop.removeRemotePackage(localZip).catch(() => undefined)
      }
      await deleteCompanionZip(storagePath).catch(() => undefined)
    } else {
      if (!source?.path) throw new Error('This project is not linked to an authorized folder on this Windows device.')
      switch (action.action_type) {
        case 'project.open_explorer': result = await desktop.openInExplorer(source.path); break
        case 'project.open_terminal': result = await desktop.openInTerminal(source.path); break
        case 'git.status': result = await desktop.gitStatus(source.path); break
        case 'git.push': result = await desktop.gitPush(source.path); break
        case 'git.commit': {
          const message = String(action.payload?.message || '').trim()
          if (!message) throw new Error('Commit message is required.')
          result = await desktop.gitCommit(source.path, message)
          break
        }
        case 'script.run': {
          const script = String(action.payload?.script || '').trim()
          if (!script || !source.scripts?.includes(script)) throw new Error('Requested script is not available for this local project.')
          result = await desktop.runScript(source.path, script)
          break
        }
        case 'project.launch': {
          const destination = String(action.payload?.destination || 'pc')
          const script = preferredRunScript(source.scripts)
          if (!script) throw new Error('This project has no supported dev, web, start or serve script.')
          await updateRemoteAction(action.id, 'running', { stage: destination === 'mobile' ? 'Starting a LAN-accessible dev server.' : 'Starting the project.X dev server.' }, desktopDeviceId())
          const run = await desktop.runDevProject(source.path, script, destination === 'mobile')
          requireSuccessfulResult(run)
          if (!run.pid || !run.url) throw new Error('The dev server started without a usable preview URL.')
          const project = readArray<StoredProject>(PROJECTS_KEY).find((item) => item.id === action.project_client_id)
          recordRunTask({ projectId: action.project_client_id!, projectName: String(project?.name || 'Project'), path: source.path, result: run })
          if (destination === 'pc') await desktop.openPreviewWindow(action.project_client_id!, String(project?.name || 'Project'), run.url, run.pid)
          if (destination === 'mobile' && !run.lanUrl) throw new Error('The Windows host could not determine a LAN preview address. Check that the PC has an active private network connection.')
          result = { pid: run.pid, url: run.url, mobileUrl: run.lanUrl || null, destination, script }
          break
        }
        default: throw new Error(`Unsupported remote action: ${action.action_type}`)
      }
    }
    await updateRemoteAction(action.id, 'succeeded', { result: requireSuccessfulResult(result) ?? null }, desktopDeviceId())
    recordWorkspaceActivity({ projectId: action.project_client_id || null, type: `companion.${action.action_type}.succeeded`, message: `${actionLabelForActivity(action.action_type)} completed on Windows.`, metadata: { actionId: action.id } })
  } catch (error) {
    await updateRemoteAction(action.id, 'failed', { error: errorMessage(error) }, desktopDeviceId())
    recordWorkspaceActivity({ projectId: action.project_client_id || null, type: `companion.${action.action_type}.failed`, message: `${actionLabelForActivity(action.action_type)} failed on Windows: ${errorMessage(error)}`, metadata: { actionId: action.id } })
  }
}

export default function CompanionDesktopWorker() {
  const desktop = getDesktopHost()

  useEffect(() => {
    if (!desktop) return
    const hostVersion = desktop.version
    const id = desktopDeviceId()
    let stopped = false
    let running = false
    let syncedInventory = ''

    async function tick() {
      if (stopped || running || !loadSession()) return
      running = true
      try {
        publishHostStatus('connecting', 'Refreshing cloud connection.')
        const session = await getFreshSession(loadSession())
        if (!session) return
        const sources = localSources()
        const inventory = projectInventorySignature()
        if (inventory !== syncedInventory) {
          const synced = await syncLocalProjects(session)
          syncedInventory = inventory
          publishHostStatus('connecting', synced.conflicts.length ? `Synced ${synced.count} project records; ${synced.conflicts.length} conflict${synced.conflicts.length === 1 ? '' : 's'} need review.` : `Synced ${synced.count} project records${synced.deletedCount ? `; removed ${synced.deletedCount} stale cloud record${synced.deletedCount === 1 ? '' : 's'}` : ''}.`, synced.count)
        }
        await registerCompanionDevice({
          device_id: id,
          name: 'project.X Windows',
          platform: 'windows',
          app_version: hostVersion,
          capabilities: [
            'project.open', 'project.launch', 'git.status', 'git.commit', 'git.push', 'script.run', 'package.create', 'package.update',
            ...sources.slice(0, 200).map((source) => `project:${source.projectId}`),
          ],
        })
        const actions = await claimPendingActions(id)
        for (const action of actions) {
          if (action.status === 'approved') await execute(action)
        }
        publishHostStatus('online', `Companion connected. ${sources.length} local project${sources.length === 1 ? '' : 's'} available.`, sources.length)
      } catch (error) {
        const detail = errorMessage(error)
        publishHostStatus('error', detail)
      } finally { running = false }
    }

    void tick()
    const timer = window.setInterval(() => void tick(), 8000)
    return () => { stopped = true; window.clearInterval(timer) }
  }, [desktop])

  return null
}
