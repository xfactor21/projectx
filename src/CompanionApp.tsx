import { useEffect, useMemo, useState } from 'react'
import { fetchCloudProjects, loadSession, signInWithPassword, signOut } from './services/supabase'
import { listCompanionDevices, listRemoteActions, queueRemoteAction, registerCompanionDevice, updateRemoteAction } from './services/companion'
import { uploadCompanionZip } from './services/companionPackages'
import type { CloudProject, SupabaseSession } from './services/supabase'
import type { CompanionDevice } from './services/companion'

const DEVICE_KEY = 'projectx.companion.device.v1'
const HOST_FRESH_MS = 30_000

type PackageMode = 'create' | 'update'

function deviceId() {
  try {
    const existing = localStorage.getItem(DEVICE_KEY)
    if (existing) return existing
    const next = `mobile-${crypto.randomUUID()}`
    localStorage.setItem(DEVICE_KEY, next)
    return next
  } catch { return `mobile-${Date.now()}` }
}
function isFresh(device: CompanionDevice | null) {
  if (!device?.last_seen_at) return false
  return Date.now() - new Date(device.last_seen_at).getTime() < HOST_FRESH_MS
}
function projectIsOnDevice(project: CloudProject, device: CompanionDevice | null) {
  if (!device || !isFresh(device)) return false
  return Array.isArray(device.capabilities) && device.capabilities.includes(`project:${project.client_id}`)
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
  const [clock, setClock] = useState(Date.now())
  const [packageOpen, setPackageOpen] = useState(false)
  const [packageMode, setPackageMode] = useState<PackageMode>('create')
  const [packageTarget, setPackageTarget] = useState('')
  const [packageFile, setPackageFile] = useState<File | null>(null)
  const [installDeps, setInstallDeps] = useState(true)

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
          app_version: '0.4',
          capabilities: ['projects.read', 'actions.request', 'packages.upload'],
        })
        const [actions, devices] = await Promise.all([listRemoteActions(50), listCompanionDevices()])
        setActionCount(actions.filter((action) => ['pending', 'approved', 'running'].includes(action.status || '')).length)
        const windowsHosts = devices.filter((device) => device.platform === 'windows')
        windowsHosts.sort((a, b) => new Date(b.last_seen_at || 0).getTime() - new Date(a.last_seen_at || 0).getTime())
        setWindowsDevice(windowsHosts.find(isFresh) || windowsHosts[0] || null)
      } catch { /* Cloud project viewing remains usable if companion services are unavailable. */ }
      setMessage(`${cloud.length} cloud project records loaded.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load companion data.')
    } finally { setBusy(false) }
  }

  useEffect(() => { if (session) void refresh(session) }, [session])
  useEffect(() => { const timer = window.setInterval(() => setClock(Date.now()), 5000); return () => window.clearInterval(timer) }, [])

  async function login() {
    if (!email.trim() || !password) return
    setBusy(true)
    try { const next = await signInWithPassword(email.trim(), password); setSession(next); setPassword('') }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Sign in failed.'); setBusy(false) }
  }
  async function logout() { await signOut(session); setSession(null); setProjects([]) }

  async function requestAction(project: CloudProject, actionType: string, payload: Record<string, unknown> = {}, confirmText?: string) {
    if (!windowsDevice?.device_id || !isFresh(windowsDevice)) return setMessage('Your project.X Windows host is offline.')
    if (!projectIsOnDevice(project, windowsDevice)) return setMessage(`${project.name} is a cloud record but is not available on this Windows host.`)
    if (confirmText && !window.confirm(confirmText)) return
    setBusy(true)
    try {
      const rows = await queueRemoteAction({ project_client_id: project.client_id, target_device_id: windowsDevice.device_id, action_type: actionType, payload, requested_by_device_id: deviceId() })
      const action = rows[0]
      if (!action?.id) throw new Error('The remote action was not created.')
      await updateRemoteAction(action.id, 'approved')
      setMessage(`${project.name}: action sent to ${windowsDevice.name}.`)
      await refresh()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to send remote action.'); setBusy(false) }
  }

  async function sendPackage() {
    if (!windowsDevice?.device_id) return setMessage('Open project.X on Windows at least once so Companion knows which PC to target.')
    if (!packageFile) return setMessage('Choose a project ZIP first.')
    const target = packageMode === 'update' ? projects.find((project) => project.client_id === packageTarget) : null
    if (packageMode === 'update' && !target) return setMessage('Choose the existing project to update.')
    setBusy(true)
    setMessage(`Uploading ${packageFile.name} securely…`)
    try {
      const uploaded = await uploadCompanionZip(packageFile)
      const rows = await queueRemoteAction({
        project_client_id: target?.client_id || null,
        target_device_id: windowsDevice.device_id,
        action_type: packageMode === 'create' ? 'package.create_project' : 'package.update_project',
        payload: { storagePath: uploaded.storagePath, fileName: uploaded.fileName, bytes: uploaded.bytes, installDeps },
        requested_by_device_id: deviceId(),
      })
      const action = rows[0]
      if (!action?.id) throw new Error('The package action could not be created.')
      await updateRemoteAction(action.id, 'approved')
      const offline = !isFresh(windowsDevice)
      setMessage(offline ? `${packageFile.name} queued. ${windowsDevice.name} will receive it when it comes online.` : `${packageFile.name} sent to ${windowsDevice.name}.`)
      setPackageFile(null); setPackageTarget(''); setPackageOpen(false)
      await refresh()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to send project package.'); setBusy(false) }
  }

  const visible = useMemo(() => projects.filter((project) => {
    const haystack = `${project.name} ${project.kicker || ''} ${project.description || ''}`.toLowerCase()
    return haystack.includes(query.trim().toLowerCase()) && !project.archived
  }), [projects, query])
  const hostOnline = useMemo(() => { void clock; return isFresh(windowsDevice) }, [windowsDevice, clock])
  const availableCount = visible.filter((project) => projectIsOnDevice(project, windowsDevice)).length

  if (!session) return <main className="companion-shell companion-auth"><div className="companion-brand"><span>X</span><div><strong>project.X</strong><small>COMPANION</small></div></div><section className="companion-login"><p>Sign in to carry your project universe with you.</p><label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label><label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label><button type="button" disabled={busy} onClick={() => void login()}>{busy ? 'Connecting…' : 'Connect companion'}</button><small>{message}</small></section></main>

  return <main className="companion-shell"><header className="companion-header"><div className="companion-brand"><span>X</span><div><strong>project.X</strong><small>COMPANION</small></div></div><button type="button" onClick={() => void logout()}>Sign out</button></header>
    <section className="companion-hero"><small>REMOTE PROJECT COMMAND</small><h1>Everything you’re building.<br/><em>In your pocket.</em></h1><p>{message}</p><div className="companion-stats"><div><b>{visible.length}</b><span>CLOUD</span></div><div><b>{availableCount}</b><span>ON PC</span></div><div><b>{actionCount}</b><span>ACTIONS</span></div></div><p className={hostOnline ? 'companion-host online' : 'companion-host offline'}>{hostOnline ? `● ${windowsDevice?.name} online` : `○ ${windowsDevice?.name || 'Windows host'} offline`}</p><button className="companion-send-package" type="button" onClick={() => setPackageOpen(true)}>＋ Send Project ZIP</button></section>
    <section className="companion-toolbar"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search projects"/><button type="button" disabled={busy} onClick={() => void refresh()}>{busy ? '…' : '↻'}</button></section>
    <section className="companion-projects">{visible.map((project) => {
      const onPc = projectIsOnDevice(project, windowsDevice)
      return <article key={project.client_id}><div className="companion-card-top"><span className={`companion-status ${(project.status || 'Building').toLowerCase()}`}>{project.status || 'Building'}</span><small>{onPc ? '● ON PC' : hostOnline ? '○ CLOUD ONLY' : '○ PC OFFLINE'}</small></div><h2>{project.name}</h2><p>{project.description || project.kicker || 'No description yet.'}</p><div className="companion-stack">{Array.isArray(project.stack) && project.stack.slice(0,4).map((item) => <span key={String(item)}>{String(item)}</span>)}</div><div className="companion-actions"><button type="button" disabled={!project.repo_url} onClick={() => project.repo_url && window.open(project.repo_url, '_blank', 'noopener,noreferrer')}>Repo</button><button type="button" disabled={!project.live_url} onClick={() => project.live_url && window.open(project.live_url, '_blank', 'noopener,noreferrer')}>Launch</button></div><div className="companion-actions companion-remote-actions"><button disabled={busy || !onPc} type="button" onClick={() => void requestAction(project, 'project.open_explorer')}>Open on PC</button><button disabled={busy || !onPc} type="button" onClick={() => void requestAction(project, 'git.status')}>Git status</button><button disabled={busy || !onPc} type="button" onClick={() => void requestAction(project, 'script.run', { script: 'build' }, `Run the build script for ${project.name} on your Windows computer?`)}>Build</button><button disabled={busy || !onPc} type="button" onClick={() => void requestAction(project, 'git.push', {}, `Push the current local Git branch for ${project.name}?`)}>Push</button></div></article>
    })}</section>

    {packageOpen && <div className="companion-package-backdrop" onMouseDown={() => !busy && setPackageOpen(false)}><section className="companion-package-sheet" onMouseDown={(event) => event.stopPropagation()}><header><div><small>CLOUD HANDOFF</small><strong>Send project ZIP</strong></div><button type="button" disabled={busy} onClick={() => setPackageOpen(false)}>×</button></header><div className="companion-mode-switch"><button className={packageMode === 'create' ? 'active' : ''} type="button" onClick={() => setPackageMode('create')}>Create new</button><button className={packageMode === 'update' ? 'active' : ''} type="button" onClick={() => setPackageMode('update')}>Update existing</button></div>{packageMode === 'update' && <label>Target project<select value={packageTarget} onChange={(event) => setPackageTarget(event.target.value)}><option value="">Choose project…</option>{projects.filter((project) => !project.archived).map((project) => <option key={project.client_id} value={project.client_id}>{project.name}</option>)}</select></label>}<label className="companion-file-picker"><span>{packageFile ? packageFile.name : 'Choose ZIP from phone'}</span><input type="file" accept=".zip,application/zip" onChange={(event) => setPackageFile(event.target.files?.[0] || null)}/></label><label className="companion-install-toggle"><input type="checkbox" checked={installDeps} onChange={(event) => setInstallDeps(event.target.checked)}/><span>Install detected dependencies on PC</span></label><p>{windowsDevice ? `${hostOnline ? 'Online' : 'Offline queue'} → ${windowsDevice.name}` : 'Open project.X Windows once to register a target PC.'}</p><button className="companion-package-send" type="button" disabled={busy || !packageFile || !windowsDevice || (packageMode === 'update' && !packageTarget)} onClick={() => void sendPackage()}>{busy ? 'Uploading…' : packageMode === 'create' ? 'Upload + create on PC' : 'Upload + update on PC'}</button></section></div>}
  </main>
}
