import { useEffect } from 'react'
import { getDesktopHost } from './services/desktop'
import { claimPendingActions, registerCompanionDevice, updateRemoteAction } from './services/companion'
import { loadSession } from './services/supabase'
import type { RemoteAction } from './services/companion'

const DEVICE_KEY = 'projectx.desktop.device.v1'
const LOCAL_KEY = 'projectx.local.sources.v1'

type LocalSource = { projectId: string; kind: 'desktop' | 'browser'; path?: string; scripts?: string[] }

function desktopDeviceId() {
  try {
    const existing = localStorage.getItem(DEVICE_KEY)
    if (existing) return existing
    const next = `windows-${crypto.randomUUID()}`
    localStorage.setItem(DEVICE_KEY, next)
    return next
  } catch { return `windows-${Date.now()}` }
}

function localSource(projectId?: string | null): LocalSource | null {
  if (!projectId) return null
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]') as LocalSource[]
    return Array.isArray(parsed) ? parsed.find((item) => item.projectId === projectId && item.kind === 'desktop' && item.path) || null : null
  } catch { return null }
}

async function execute(action: RemoteAction) {
  const desktop = getDesktopHost()
  if (!desktop || !action.id) return
  const source = localSource(action.project_client_id)
  if (!source?.path) {
    await updateRemoteAction(action.id, 'failed', { error: 'This project is not linked to an authorized folder on this Windows device.' })
    return
  }

  await updateRemoteAction(action.id, 'running')
  try {
    let result: unknown
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
      default: throw new Error(`Unsupported remote action: ${action.action_type}`)
    }
    await updateRemoteAction(action.id, 'succeeded', { result: result ?? null })
  } catch (error) {
    await updateRemoteAction(action.id, 'failed', { error: error instanceof Error ? error.message : 'Desktop action failed.' })
  }
}

export default function CompanionDesktopWorker() {
  const desktop = getDesktopHost()

  useEffect(() => {
    if (!desktop || !loadSession()) return
    const hostVersion = desktop.version
    const id = desktopDeviceId()
    let stopped = false
    let running = false

    async function tick() {
      if (stopped || running || !loadSession()) return
      running = true
      try {
        await registerCompanionDevice({
          device_id: id,
          name: 'project.X Windows',
          platform: 'windows',
          app_version: hostVersion,
          capabilities: ['project.open', 'git.status', 'git.commit', 'git.push', 'script.run'],
        })
        const actions = await claimPendingActions(id)
        for (const action of actions) {
          if (action.status === 'approved') await execute(action)
        }
      } catch {
        // Companion support remains optional; missing migration/network should never break the desktop manager.
      } finally { running = false }
    }

    void tick()
    const timer = window.setInterval(() => void tick(), 8000)
    return () => { stopped = true; window.clearInterval(timer) }
  }, [desktop])

  return null
}
