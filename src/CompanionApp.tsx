import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchCloudProjects, getFreshSession, isSupabaseConfigured, loadSession, signInWithPassword, signOut } from './services/supabase'
import { listCompanionDevices, listRemoteActions, queueRemoteAction, registerCompanionDevice, updateRemoteAction } from './services/companion'
import { uploadCompanionZip } from './services/companionPackages'
import { APP_VERSION } from './version'
import type { CloudProject, SupabaseSession } from './services/supabase'
import type { CompanionDevice, RemoteAction } from './services/companion'
import appIcon from './assets/brand/app-icon.png'

const DEVICE_KEY = 'projectx.companion.device.v1'
const HOST_FRESH_MS = 30_000
const REFRESH_MS = 15_000
const PENDING_MOBILE_LAUNCH_KEY = 'projectx.companion.pending-mobile-launch.v1'

type PackageMode = 'create' | 'update'
type CompanionTab = 'projects' | 'actions' | 'activity' | 'settings'

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

function companionPlatform() {
  const capacitor = (window as Window & { Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string } }).Capacitor
  if (capacitor?.isNativePlatform?.()) return capacitor.getPlatform?.() || 'android'
  return navigator.userAgent.includes('Mobile') ? 'mobile-web' : 'web'
}

function safeOpen(url?: string | null) {
  if (!url || !/^https?:\/\//i.test(url)) return
  window.open(url, '_blank', 'noopener,noreferrer')
}

function actionLabel(action: RemoteAction) {
  const labels: Record<string, string> = {
    'project.open_explorer': 'Open project on PC',
    'project.open_terminal': 'Open terminal on PC',
    'git.status': 'Git status',
    'git.push': 'Git push',
    'git.commit': 'Git commit',
    'script.run': `Run ${String(action.payload?.script || 'script')}`,
    'package.create_project': 'Create project from ZIP',
    'package.update_project': 'Update project from ZIP',
    'project.launch': `Launch on ${String(action.payload?.destination || 'PC')}`,
  }
  return labels[action.action_type] || action.action_type.replace(/[._]/g, ' ')
}

function relativeTime(value?: string) {
  if (!value) return 'unknown time'
  const elapsed = Date.now() - new Date(value).getTime()
  if (!Number.isFinite(elapsed)) return 'unknown time'
  const seconds = Math.max(0, Math.floor(elapsed / 1000))
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function usableMobileUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    const parsed = new URL(value)
    if (!['http:', 'https:'].includes(parsed.protocol) || ['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(parsed.hostname)) return null
    return parsed.toString()
  } catch { return null }
}

export default function CompanionApp() {
  const [session, setSession] = useState<SupabaseSession | null>(loadSession)
  const [email, setEmail] = useState(session?.user.email || '')
  const [password, setPassword] = useState('')
  const [projects, setProjects] = useState<CloudProject[]>([])
  const [actions, setActions] = useState<RemoteAction[]>([])
  const [query, setQuery] = useState('')
  const [message, setMessage] = useState(isSupabaseConfigured() ? 'Companion ready.' : 'project.X Cloud is unavailable in this build.')
  const [busy, setBusy] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [windowsDevice, setWindowsDevice] = useState<CompanionDevice | null>(null)
  const [clock, setClock] = useState(() => Date.now())
  const [tab, setTab] = useState<CompanionTab>('projects')
  const [packageOpen, setPackageOpen] = useState(false)
  const [packageMode, setPackageMode] = useState<PackageMode>('create')
  const [packageTarget, setPackageTarget] = useState('')
  const [packageFile, setPackageFile] = useState<File | null>(null)
  const [installDeps, setInstallDeps] = useState(true)
  const [configured, setConfigured] = useState(isSupabaseConfigured)
  const [launchProject, setLaunchProject] = useState<CloudProject | null>(null)
  const [mobilePreview, setMobilePreview] = useState<{ name: string; url: string; revision: number } | null>(null)
  const refreshLock = useRef(false)

  async function refresh(current = session, quiet = false) {
    if (!current || refreshLock.current) return
    refreshLock.current = true
    if (!quiet) setRefreshing(true)
    try {
      let connectionMessage = ''
      const activeSession = await getFreshSession(current)
      if (!activeSession) throw new Error('Sign in again to reconnect Companion.')
      if (activeSession.access_token !== current.access_token) setSession(activeSession)
      const cloud = await fetchCloudProjects(activeSession)
      setProjects(cloud)
      try {
        await registerCompanionDevice({
          device_id: deviceId(),
          name: companionPlatform() === 'android' ? 'project.X Android' : navigator.userAgent.includes('Mobile') ? 'Mobile companion' : 'Companion browser',
          platform: companionPlatform(),
          app_version: APP_VERSION,
          capabilities: ['projects.read', 'actions.request', 'packages.upload', 'actions.history'],
        })
        const [nextActions, devices] = await Promise.all([listRemoteActions(100), listCompanionDevices()])
        setActions(nextActions)
        const pendingMobileId = localStorage.getItem(PENDING_MOBILE_LAUNCH_KEY)
        const pendingMobile = pendingMobileId ? nextActions.find((action) => action.id === pendingMobileId) : null
        if (pendingMobile?.status === 'succeeded') {
          const url = usableMobileUrl(pendingMobile.result?.mobileUrl)
          localStorage.removeItem(PENDING_MOBILE_LAUNCH_KEY)
          if (url) {
            const name = cloud.find((project) => project.client_id === pendingMobile.project_client_id)?.name || 'Project preview'
            setMobilePreview({ name, url, revision: Date.now() })
            setMessage(`${name} is running from your Windows host.`)
          } else setMessage('The Windows host completed the launch but did not return a mobile-safe URL.')
        } else if (pendingMobile?.status === 'failed') {
          localStorage.removeItem(PENDING_MOBILE_LAUNCH_KEY)
          setMessage(String(pendingMobile.result?.error || 'Mobile launch failed on the Windows host.'))
        }
        const windowsHosts = devices.filter((device) => device.platform === 'windows')
        windowsHosts.sort((a, b) => new Date(b.last_seen_at || 0).getTime() - new Date(a.last_seen_at || 0).getTime())
        const selectedHost = windowsHosts.find(isFresh) || windowsHosts[0] || null
        setWindowsDevice(selectedHost)
        connectionMessage = selectedHost && isFresh(selectedHost)
          ? `${selectedHost.name} is online with ${selectedHost.capabilities?.filter((item) => item.startsWith('project:')).length || 0} local projects.`
          : selectedHost ? `${selectedHost.name} has not checked in recently.` : 'No Windows host has checked in yet.'
      } catch (error) {
        if (!quiet) setMessage(error instanceof Error ? error.message : 'Companion services are unavailable.')
      }
      if (!quiet) setMessage(`${cloud.length} projects synced. ${connectionMessage}`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load companion data.')
    } finally {
      refreshLock.current = false
      if (!quiet) setRefreshing(false)
    }
  }

  useEffect(() => {
    const changed = () => setConfigured(isSupabaseConfigured())
    window.addEventListener('projectx:supabase-config-changed', changed)
    return () => window.removeEventListener('projectx:supabase-config-changed', changed)
  }, [])

  useEffect(() => {
    if (!session) return
    const initial = window.setTimeout(() => void refresh(session), 0)
    const timer = window.setInterval(() => void refresh(session, true), REFRESH_MS)
    return () => { window.clearTimeout(initial); window.clearInterval(timer) }
  }, [session])

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 5000)
    return () => window.clearInterval(timer)
  }, [])

  async function login() {
    if (!email.trim() || !password) return
    setBusy(true)
    try {
      const next = await signInWithPassword(email.trim(), password)
      setSession(next)
      setPassword('')
      setMessage('Signed in. Connecting to project.X…')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Sign in failed.')
    } finally {
      setBusy(false)
    }
  }

  async function logout() {
    await signOut(session)
    setSession(null)
    setProjects([])
    setActions([])
    setWindowsDevice(null)
    setTab('projects')
  }

  async function requestAction(project: CloudProject, actionType: string, payload: Record<string, unknown> = {}, confirmText?: string) {
    if (!windowsDevice?.device_id || !isFresh(windowsDevice)) return setMessage('Your project.X Windows host is offline.')
    if (!projectIsOnDevice(project, windowsDevice)) return setMessage(`${project.name} is a cloud record but is not available on this Windows host.`)
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
      await updateRemoteAction(action.id, 'approved', undefined, deviceId())
      setMessage(`${project.name}: action sent to ${windowsDevice.name}.`)
      setTab('actions')
      await refresh(session, true)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to send remote action.')
    } finally {
      setBusy(false)
    }
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
      await updateRemoteAction(action.id, 'approved', undefined, deviceId())
      const offline = !isFresh(windowsDevice)
      setMessage(offline ? `${packageFile.name} queued. ${windowsDevice.name} will receive it when it comes online.` : `${packageFile.name} sent to ${windowsDevice.name}.`)
      setPackageFile(null)
      setPackageTarget('')
      setPackageOpen(false)
      setTab('actions')
      await refresh(session, true)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to send project package.')
    } finally {
      setBusy(false)
    }
  }

  async function launch(destination: 'pc' | 'mobile') {
    const project = launchProject
    if (!project || !windowsDevice?.device_id || !isFresh(windowsDevice)) return setMessage('Your project.X Windows host is offline.')
    if (!projectIsOnDevice(project, windowsDevice)) return setMessage(`${project.name} is not linked to a local folder on this PC.`)
    setBusy(true)
    try {
      const rows = await queueRemoteAction({
        project_client_id: project.client_id,
        target_device_id: windowsDevice.device_id,
        action_type: 'project.launch',
        payload: { destination },
        requested_by_device_id: deviceId(),
      })
      const action = rows[0]
      if (!action?.id) throw new Error('The launch request could not be created.')
      await updateRemoteAction(action.id, 'approved', undefined, deviceId())
      if (destination === 'mobile') localStorage.setItem(PENDING_MOBILE_LAUNCH_KEY, action.id)
      setLaunchProject(null)
      setMessage(destination === 'mobile' ? `Starting ${project.name} on the PC. The preview will open here when its LAN address is ready.` : `Starting ${project.name} in project.X Preview on the PC.`)
      setTab('actions')
      await refresh(session, true)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error || 'Unable to launch project.'))
    } finally { setBusy(false) }
  }

  const visible = useMemo(() => projects.filter((project) => {
    const haystack = `${project.name} ${project.kicker || ''} ${project.description || ''}`.toLowerCase()
    return haystack.includes(query.trim().toLowerCase()) && !project.archived
  }), [projects, query])

  const hostOnline = useMemo(() => { void clock; return isFresh(windowsDevice) }, [windowsDevice, clock])
  const availableCount = visible.filter((project) => projectIsOnDevice(project, windowsDevice)).length
  const pendingActions = actions.filter((action) => ['pending', 'approved', 'running'].includes(action.status || ''))
  const activity = actions.filter((action) => ['succeeded', 'failed', 'canceled'].includes(action.status || '')).slice(0, 40)
  const failedCount = actions.filter((action) => action.status === 'failed').length

  if (!session) return <main className="companion-shell companion-auth">
    <div className="companion-auth-card">
      <div className="companion-brand"><img src={appIcon} alt=""/><div><strong>project.X</strong><small>COMPANION · v{APP_VERSION}</small></div></div>
      <section className="companion-login">
        <div><small>REMOTE DEV CONTROL</small><h1>Your projects.<br/><em>With you.</em></h1><p>Sign in with the same project.X account used on your Windows host.</p></div>
        <label>Email<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label>Password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && void login()} /></label>
        <button type="button" disabled={busy || !configured} onClick={() => void login()}>{busy ? 'Connecting…' : configured ? 'Connect companion' : 'Cloud service unavailable'}</button>
        <small className="companion-auth-message">{message}</small>
      </section>
    </div>
  </main>

  return <main className="companion-shell companion-v17">
    <header className="companion-header">
      <button className="companion-brand companion-brand-button" type="button" onClick={() => setTab('projects')} aria-label="Open projects">
        <img src={appIcon} alt=""/><div><strong>project.X</strong><small>COMPANION · v{APP_VERSION}</small></div>
      </button>
      <button className={hostOnline ? 'companion-host-chip online' : 'companion-host-chip offline'} type="button" onClick={() => setTab('settings')}>
        <i /> <span>{hostOnline ? 'PC ONLINE' : 'PC OFFLINE'}</span>
      </button>
    </header>

    <section className="companion-page">
      {tab === 'projects' && <>
        <section className="companion-hero">
          <small>REMOTE PROJECT COMMAND</small>
          <h1>Everything you’re building.<br/><em>In your pocket.</em></h1>
          <p>{message}</p>
          <div className="companion-stats">
            <div><b>{visible.length}</b><span>CLOUD</span></div>
            <div><b>{availableCount}</b><span>ON PC</span></div>
            <div><b>{pendingActions.length}</b><span>ACTIVE</span></div>
          </div>
          <div className="companion-hero-actions">
            <button className="companion-send-package" type="button" onClick={() => setPackageOpen(true)}>＋ Send Project ZIP</button>
            <button className="companion-refresh" type="button" disabled={refreshing} onClick={() => void refresh()}>{refreshing ? 'Refreshing…' : 'Refresh'}</button>
          </div>
        </section>

        <section className="companion-toolbar">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search projects" aria-label="Search projects"/>
          <span>{visible.length}</span>
        </section>

        <section className="companion-projects">{visible.length ? visible.map((project) => {
          const onPc = projectIsOnDevice(project, windowsDevice)
          return <article key={project.client_id}>
            <div className="companion-card-top">
              <span className={`companion-status ${(project.status || 'Building').toLowerCase()}`}>{project.status || 'Building'}</span>
              <small>{onPc ? '● ON PC' : hostOnline ? '○ CLOUD ONLY' : '○ PC OFFLINE'}</small>
            </div>
            <h2>{project.name}</h2>
            <p>{project.description || project.kicker || 'No description yet.'}</p>
            <div className="companion-stack">{Array.isArray(project.stack) && project.stack.slice(0, 4).map((item) => <span key={String(item)}>{String(item)}</span>)}</div>
            <div className="companion-actions companion-project-links">
              <button type="button" disabled={!project.repo_url} onClick={() => safeOpen(project.repo_url)}>Repo</button>
              <button type="button" disabled={!onPc} onClick={() => setLaunchProject(project)}>Launch</button>
              <button type="button" disabled={!project.live_url} onClick={() => safeOpen(project.live_url)}>Published</button>
            </div>
            <div className="companion-action-grid">
              <button disabled={busy || !onPc} type="button" onClick={() => void requestAction(project, 'project.open_explorer')}>Open on PC</button>
              <button disabled={busy || !onPc} type="button" onClick={() => void requestAction(project, 'project.open_terminal')}>Terminal</button>
              <button disabled={busy || !onPc} type="button" onClick={() => void requestAction(project, 'git.status')}>Git status</button>
              <button disabled={busy || !onPc} type="button" onClick={() => void requestAction(project, 'script.run', { script: 'build' }, `Run the build script for ${project.name} on your Windows computer?`)}>Build</button>
              <button className="wide" disabled={busy || !onPc} type="button" onClick={() => void requestAction(project, 'git.push', {}, `Push the current local Git branch for ${project.name}?`)}>Push current branch</button>
            </div>
          </article>
        }) : <div className="companion-empty"><span>NO PROJECTS</span><h2>Nothing matches this view.</h2><p>Sync from Windows or clear the search to see your project universe.</p></div>}</section>
      </>}

      {tab === 'actions' && <section className="companion-list-page">
        <div className="companion-page-heading"><div><small>REMOTE QUEUE</small><h1>Actions</h1></div><button type="button" disabled={refreshing} onClick={() => void refresh()}>{refreshing ? '…' : '↻'}</button></div>
        <p className="companion-page-copy">Commands sent from this companion to your Windows project.X host.</p>
        <div className="companion-action-summary"><div><b>{pendingActions.length}</b><span>ACTIVE</span></div><div><b>{failedCount}</b><span>FAILED</span></div><div><b>{actions.length}</b><span>RECENT</span></div></div>
        <div className="companion-action-list">{actions.length ? actions.slice(0, 50).map((action) => <article key={action.id || `${action.action_type}-${action.created_at}`}>
          <div><span className={`companion-action-state ${action.status || 'pending'}`}>{action.status || 'pending'}</span><small>{relativeTime(action.updated_at || action.created_at)}</small></div>
          <strong>{actionLabel(action)}</strong>
          <p>{action.project_client_id ? projects.find((project) => project.client_id === action.project_client_id)?.name || action.project_client_id : 'Workspace action'}</p>
          {action.status === 'running' && Boolean(action.result?.stage) && <code>{String(action.result?.stage)}</code>}
          {action.status === 'failed' && <code>{String((action.result as { error?: unknown } | null)?.error || 'Action failed on the Windows host.')}</code>}
          {action.status === 'succeeded' && usableMobileUrl(action.result?.mobileUrl) && <button className="companion-open-result" type="button" onClick={() => setMobilePreview({ name: projects.find((project) => project.client_id === action.project_client_id)?.name || 'Project preview', url: usableMobileUrl(action.result?.mobileUrl)!, revision: Date.now() })}>Open mobile preview</button>}
        </article>) : <div className="companion-empty compact"><span>QUEUE CLEAR</span><h2>No remote actions yet.</h2></div>}</div>
      </section>}

      {tab === 'activity' && <section className="companion-list-page">
        <div className="companion-page-heading"><div><small>RECENT RESULTS</small><h1>Activity</h1></div><button type="button" disabled={refreshing} onClick={() => void refresh()}>{refreshing ? '…' : '↻'}</button></div>
        <p className="companion-page-copy">Completed operations from your connected project.X devices.</p>
        <div className="companion-timeline">{activity.length ? activity.map((action) => <article key={action.id || `${action.action_type}-${action.created_at}`}>
          <i className={action.status || 'succeeded'} />
          <div><strong>{actionLabel(action)}</strong><span>{action.status} · {relativeTime(action.updated_at || action.created_at)}</span></div>
        </article>) : <div className="companion-empty compact"><span>QUIET</span><h2>No completed activity yet.</h2></div>}</div>
      </section>}

      {tab === 'settings' && <section className="companion-list-page companion-settings-page">
        <div className="companion-page-heading"><div><small>COMPANION CONTROL</small><h1>Settings</h1></div></div>
        <section className="companion-setting-card accent">
          <small>APPLICATION</small><div><span>project.X Companion</span><b>v{APP_VERSION}</b></div><p>Android and Windows share the project.X release version.</p>
        </section>
        <section className="companion-setting-card">
          <small>WINDOWS HOST</small><div><span>{windowsDevice?.name || 'No host registered'}</span><b className={hostOnline ? 'online' : 'offline'}>{hostOnline ? 'ONLINE' : 'OFFLINE'}</b></div>
          <p>{windowsDevice?.last_seen_at ? `Last seen ${relativeTime(windowsDevice.last_seen_at)} · v${windowsDevice.app_version || '?'}` : 'Open project.X on Windows while signed into the same account.'}</p>
        </section>
        <section className="companion-setting-card">
          <small>PACKAGE HANDOFF</small><label className="companion-settings-toggle"><span><b>Install dependencies on PC</b><small>Default for project ZIP handoff</small></span><input type="checkbox" checked={installDeps} onChange={(event) => setInstallDeps(event.target.checked)}/></label>
        </section>
        <section className="companion-setting-card">
          <small>ACCOUNT</small><div><span>{session.user.email || 'Signed in'}</span><b>CONNECTED</b></div>
          <div className="companion-settings-actions"><button type="button" disabled={refreshing} onClick={() => void refresh()}>{refreshing ? 'Refreshing…' : 'Refresh cloud + devices'}</button><button className="danger" type="button" onClick={() => void logout()}>Sign out</button></div>
        </section>
        <p className="companion-settings-foot">Device ID: {deviceId()}</p>
      </section>}
    </section>

    <nav className="companion-bottom-nav" aria-label="Companion navigation">
      <button type="button" className={tab === 'projects' ? 'active' : ''} onClick={() => setTab('projects')}><span>▦</span><small>Projects</small></button>
      <button type="button" className={tab === 'actions' ? 'active' : ''} onClick={() => setTab('actions')}><span>↯</span><small>Actions</small>{pendingActions.length > 0 && <i>{pendingActions.length}</i>}</button>
      <button type="button" className="send" onClick={() => setPackageOpen(true)}><span>＋</span><small>Send ZIP</small></button>
      <button type="button" className={tab === 'activity' ? 'active' : ''} onClick={() => setTab('activity')}><span>◴</span><small>Activity</small></button>
      <button type="button" className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}><span>⚙</span><small>Settings</small></button>
    </nav>

    {packageOpen && <div className="companion-package-backdrop" onMouseDown={() => !busy && setPackageOpen(false)}>
      <section className="companion-package-sheet" role="dialog" aria-modal="true" aria-label="Send project ZIP" onMouseDown={(event) => event.stopPropagation()}>
        <header><div><small>CLOUD HANDOFF</small><strong>Send project ZIP</strong></div><button type="button" disabled={busy} onClick={() => setPackageOpen(false)} aria-label="Close">×</button></header>
        <div className="companion-mode-switch"><button className={packageMode === 'create' ? 'active' : ''} type="button" onClick={() => setPackageMode('create')}>Create new</button><button className={packageMode === 'update' ? 'active' : ''} type="button" onClick={() => setPackageMode('update')}>Update existing</button></div>
        {packageMode === 'update' && <label>Target project<select value={packageTarget} onChange={(event) => setPackageTarget(event.target.value)}><option value="">Choose project…</option>{projects.filter((project) => !project.archived).map((project) => <option key={project.client_id} value={project.client_id}>{project.name}</option>)}</select></label>}
        <label className="companion-file-picker"><span>{packageFile ? `${packageFile.name} · ${(packageFile.size / 1024 / 1024).toFixed(1)} MB` : 'Choose ZIP from phone'}</span><input type="file" accept=".zip,application/zip,application/x-zip-compressed,application/octet-stream" onClick={(event) => { event.currentTarget.value = '' }} onChange={(event) => setPackageFile(event.target.files?.[0] || null)}/></label>
        <label className="companion-install-toggle"><input type="checkbox" checked={installDeps} onChange={(event) => setInstallDeps(event.target.checked)}/><span>Install detected dependencies on PC</span></label>
        <p>{windowsDevice ? `${hostOnline ? 'Online' : 'Offline queue'} → ${windowsDevice.name}` : 'Open project.X Windows once to register a target PC.'}</p>
        <button className="companion-package-send" type="button" disabled={busy || !packageFile || !windowsDevice || (packageMode === 'update' && !packageTarget)} onClick={() => void sendPackage()}>{busy ? 'Uploading…' : packageMode === 'create' ? 'Upload + create on PC' : 'Upload + update on PC'}</button>
      </section>
    </div>}
    {launchProject && <div className="companion-package-backdrop" onMouseDown={() => !busy && setLaunchProject(null)}>
      <section className="companion-package-sheet companion-launch-sheet" role="dialog" aria-modal="true" aria-label={`Launch ${launchProject.name}`} onMouseDown={(event) => event.stopPropagation()}>
        <header><div><small>RUN DESTINATION</small><strong>Launch {launchProject.name}</strong></div><button type="button" disabled={busy} onClick={() => setLaunchProject(null)} aria-label="Close">×</button></header>
        <button className="companion-launch-choice" type="button" disabled={busy} onClick={() => void launch('pc')}><b>PC</b><span>Start the local dev server and open it inside project.X Preview on Windows.</span></button>
        <button className="companion-launch-choice" type="button" disabled={busy} onClick={() => void launch('mobile')}><b>Mobile device</b><span>Start a LAN-accessible dev server and load it in this companion. Phone and PC must be on the same private network.</span></button>
        <p>For off-network access, use the project’s Published link or configure an authenticated HTTPS tunnel outside project.X.</p>
      </section>
    </div>}
    {mobilePreview && <div className="companion-mobile-preview">
      <header><div><small>LIVE FROM PC</small><strong>{mobilePreview.name}</strong><span>{mobilePreview.url}</span></div><nav><button type="button" aria-label="Reload preview" onClick={() => setMobilePreview((current) => current ? { ...current, revision: Date.now() } : current)}>↻</button><button type="button" aria-label="Close preview" onClick={() => setMobilePreview(null)}>×</button></nav></header>
      <iframe key={mobilePreview.revision} src={mobilePreview.url} title={`${mobilePreview.name} mobile preview`} allow="clipboard-read; clipboard-write; fullscreen"/>
    </div>}
  </main>
}
