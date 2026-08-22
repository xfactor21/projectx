import { useEffect, useMemo, useState } from 'react'
import { fetchCloudProjects, loadSession, signInWithPassword, signOut } from './services/supabase'
import { listCompanionDevices, listRemoteActions, queueRemoteAction, registerCompanionDevice, updateRemoteAction } from './services/companion'
import type { CloudProject, SupabaseSession } from './services/supabase'
import type { CompanionDevice } from './services/companion'

const DEVICE_KEY = 'projectx.companion.device.v1'

function deviceId() {
  try {
    const existing = localStorage.getItem(DEVICE_KEY)
    if (existing) return existing
    const next = `mobile-${crypto.randomUUID()}`
    localStorage.setItem(DEVICE_KEY, next)
    return next
  } catch { return `mobile-${Date.now()}` }
}

export default function CompanionApp() {
  const [session, setSession] = useState<SupabaseSession | null>(loadSession)
  const [email, setEmail] = useState(session?.user.email || '')
  const [password, setPassword] = useState('')
  const [projects, setProjects] = useState<CloudProject[]>([])
  const [query, setQuery] = useState('')
  const [message, setMessage] = useState('Companion ready.')
  const [busy, setBusy] = useState(false)
  const [actionCount, setActionCount] = useState(0)
  const [windowsDevice, setWindowsDevice] = useState<CompanionDevice | null>(null)

  async function refresh(current = session) {
    if (!current) return
    setBusy(true)
    try {
      const cloud = await fetchCloudProjects(current)
      setProjects(cloud)
      try {
        await registerCompanionDevice({
          device_id: deviceId(),
          name: navigator.userAgent.includes('Mobile') ? 'Mobile companion' : 'Companion browser',
          platform: navigator.platform || 'web',
          app_version: '0.1',
          capabilities: ['projects.read', 'actions.request'],
        })
        const [actions, devices] = await Promise.all([listRemoteActions(50), listCompanionDevices()])
        setActionCount(actions.filter((action) => ['pending', 'approved', 'running'].includes(action.status || '')).length)
        const desktop = devices.find((device) => device.platform === 'windows') || null
        setWindowsDevice(desktop)
      } catch {
        // The companion schema may not be applied yet; project viewing still works independently.
      }
      setMessage(`${cloud.length} cloud projects loaded.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load companion data.')
    } finally { setBusy(false) }
  }

  useEffect(() => { if (session) void refresh(session) }, [])

  async function login() {
    if (!email.trim() || !password) return
    setBusy(true)
    try {
      const next = await signInWithPassword(email.trim(), password)
      setSession(next)
      setPassword('')
      await refresh(next)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Sign in failed.')
      setBusy(false)
    }
  }

  async function logout() {
    await signOut(session)
    setSession(null)
    setProjects([])
  }

  async function requestAction(project: CloudProject, actionType: string, payload: Record<string, unknown> = {}, confirmText?: string) {
    if (!windowsDevice?.device_id) return setMessage('No signed-in project.X Windows host is available.')
    if (confirmText && !window.confirm(confirmText)) return
    setBusy(true)
    try {
      const rows = await queueRemoteAction({
        project_client_id: project.client_id,
        target_device_id: windowsDevice.device_id,
        action_type: actionType,
        payload,
        requested_by_device_id: deviceId(),
      })
      const action = rows[0]
      if (!action?.id) throw new Error('The remote action was not created.')
      // The user explicitly tapped this action (and sensitive actions receive a second confirmation),
      // so this transition records approval before the Windows worker is allowed to execute it.
      await updateRemoteAction(action.id, 'approved')
      setMessage(`${project.name}: action sent to ${windowsDevice.name}.`)
      await refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to send remote action.')
      setBusy(false)
    }
  }

  const visible = useMemo(() => projects.filter((project) => {
    const haystack = `${project.name} ${project.kicker || ''} ${project.description || ''}`.toLowerCase()
    return haystack.includes(query.trim().toLowerCase()) && !project.archived
  }), [projects, query])

  if (!session) return <main className="companion-shell companion-auth"><div className="companion-brand"><span>X</span><div><strong>project.X</strong><small>COMPANION</small></div></div><section className="companion-login"><p>Sign in to carry your project universe with you.</p><label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label><label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label><button type="button" disabled={busy} onClick={() => void login()}>{busy ? 'Connecting…' : 'Connect companion'}</button><small>{message}</small></section></main>

  return <main className="companion-shell"><header className="companion-header"><div className="companion-brand"><span>X</span><div><strong>project.X</strong><small>COMPANION</small></div></div><button type="button" onClick={() => void logout()}>Sign out</button></header>
    <section className="companion-hero"><small>REMOTE PROJECT COMMAND</small><h1>Everything you’re building.<br/><em>In your pocket.</em></h1><p>{message}</p><div className="companion-stats"><div><b>{visible.length}</b><span>PROJECTS</span></div><div><b>{projects.filter((p) => p.status === 'Live').length}</b><span>LIVE</span></div><div><b>{actionCount}</b><span>ACTIONS</span></div></div><p>{windowsDevice ? `Windows host: ${windowsDevice.name}` : 'Windows host offline or not paired yet.'}</p></section>
    <section className="companion-toolbar"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search projects"/><button type="button" disabled={busy} onClick={() => void refresh()}>{busy ? '…' : '↻'}</button></section>
    <section className="companion-projects">{visible.map((project) => <article key={project.client_id}><div className="companion-card-top"><span className={`companion-status ${(project.status || 'Building').toLowerCase()}`}>{project.status || 'Building'}</span><small>{project.progress || 0}%</small></div><h2>{project.name}</h2><p>{project.description || project.kicker || 'No description yet.'}</p><div className="companion-stack">{Array.isArray(project.stack) && project.stack.slice(0,4).map((item) => <span key={String(item)}>{String(item)}</span>)}</div><div className="companion-actions"><button type="button" disabled={!project.repo_url} onClick={() => project.repo_url && window.open(project.repo_url, '_blank', 'noopener,noreferrer')}>Repo</button><button type="button" disabled={!project.live_url} onClick={() => project.live_url && window.open(project.live_url, '_blank', 'noopener,noreferrer')}>Launch</button></div>{windowsDevice && <div className="companion-actions"><button disabled={busy} type="button" onClick={() => void requestAction(project, 'project.open_explorer')}>Open on PC</button><button disabled={busy} type="button" onClick={() => void requestAction(project, 'git.status')}>Git status</button><button disabled={busy} type="button" onClick={() => void requestAction(project, 'script.run', { script: 'build' }, `Run the build script for ${project.name} on your Windows computer?`)}>Build</button><button disabled={busy} type="button" onClick={() => void requestAction(project, 'git.push', {}, `Push the current local Git branch for ${project.name}?`)}>Push</button></div>}</article>)}</section>
  </main>
}
