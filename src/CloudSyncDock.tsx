import { useMemo, useState } from 'react'
import {
  fetchCloudProjects,
  isSupabaseConfigured,
  loadSession,
  refreshSession,
  signInWithPassword,
  signOut,
  signUpWithPassword,
  upsertCloudProjects,
} from './services/supabase'
import type { SupabaseSession } from './services/supabase'

const STORAGE_KEY = 'projectx.projects.v1'
const PRE_RESTORE_KEY = 'projectx.projects.pre-restore.v1'

type LocalProject = {
  id: string
  name: string
  kicker?: string
  description?: string
  status?: 'Live' | 'Building' | 'Concept' | 'Paused'
  stack?: string[]
  accent?: 'pink' | 'cyan' | 'violet'
  progress?: number
  favorite?: boolean
  archived?: boolean
  repoUrl?: string
  liveUrl?: string
  coverUrl?: string
  notes?: string
  github?: unknown
  updated?: string
}

function readLocalProjects(): LocalProject[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function cloudRowsToProjects(rows: Awaited<ReturnType<typeof fetchCloudProjects>>): LocalProject[] {
  return rows.map((row) => ({
    id: row.client_id,
    name: row.name,
    kicker: row.kicker || '',
    description: row.description || '',
    status: row.status || 'Building',
    stack: Array.isArray(row.stack) ? row.stack as string[] : [],
    accent: row.accent || 'pink',
    progress: row.progress || 0,
    favorite: Boolean(row.favorite),
    archived: Boolean(row.archived),
    repoUrl: row.repo_url || '',
    liveUrl: row.live_url || '',
    coverUrl: row.cover_url || '',
    notes: row.notes || '',
    github: row.github || undefined,
    updated: row.updated_at ? new Date(row.updated_at).toLocaleString() : 'Cloud',
  }))
}

export default function CloudSyncDock() {
  const [session, setSession] = useState(loadSession)
  const [email, setEmail] = useState(session?.user?.email || '')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [message, setMessage] = useState(isSupabaseConfigured() ? 'Cloud ready' : 'Add Supabase publishable key in Vercel')
  const configured = useMemo(() => isSupabaseConfigured(), [])

  async function getFreshSession(): Promise<SupabaseSession | null> {
    const current = session || loadSession()
    if (!current) return null
    const expiresSoon = current.expires_at ? current.expires_at * 1000 - Date.now() < 5 * 60 * 1000 : false
    if (!expiresSoon) return current
    const refreshed = await refreshSession(current)
    if (refreshed) setSession(refreshed)
    return refreshed
  }

  async function authenticate(mode: 'signin' | 'signup') {
    if (!email.trim() || !password) return setMessage('Enter email and password.')
    setBusy(true)
    try {
      const next = mode === 'signin'
        ? await signInWithPassword(email.trim(), password)
        : await signUpWithPassword(email.trim(), password)
      if (next) {
        setSession(next)
        setMessage(mode === 'signin' ? 'Signed in. Cloud sync ready.' : 'Account created and signed in.')
      } else setMessage('Account created. Check your email if confirmation is enabled.')
      setPassword('')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Authentication failed.')
    } finally { setBusy(false) }
  }

  async function pushCloud() {
    const activeSession = await getFreshSession()
    if (!activeSession) return setMessage('Sign in first.')
    setBusy(true)
    try {
      const projects = readLocalProjects()
      await upsertCloudProjects(projects.map((project, index) => ({
        user_id: activeSession.user.id,
        client_id: project.id,
        name: project.name,
        kicker: project.kicker || '',
        description: project.description || '',
        status: project.status || 'Building',
        stack: project.stack || [],
        accent: project.accent || 'pink',
        progress: project.progress || 0,
        favorite: Boolean(project.favorite),
        archived: Boolean(project.archived),
        repo_url: project.repoUrl || '',
        live_url: project.liveUrl || '',
        cover_url: project.coverUrl || '',
        notes: project.notes || '',
        github: project.github || null,
        sort_order: index,
      })), activeSession)
      setMessage(`Cloud backup complete: ${projects.length} projects.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Cloud backup failed.')
    } finally { setBusy(false) }
  }

  async function pullCloud(mode: 'merge' | 'replace') {
    const activeSession = await getFreshSession()
    if (!activeSession) return setMessage('Sign in first.')
    if (mode === 'replace' && !window.confirm('Replace the local project list with the cloud snapshot? A local recovery copy will be saved first.')) return
    setBusy(true)
    try {
      const cloud = cloudRowsToProjects(await fetchCloudProjects(activeSession))
      const local = readLocalProjects()
      localStorage.setItem(PRE_RESTORE_KEY, JSON.stringify({ savedAt: new Date().toISOString(), projects: local }))

      let next = cloud
      if (mode === 'merge') {
        const merged = [...local]
        cloud.forEach((incoming) => {
          const index = merged.findIndex((project) => project.id === incoming.id || (incoming.repoUrl && project.repoUrl === incoming.repoUrl))
          if (index >= 0) merged[index] = { ...merged[index], ...incoming }
          else merged.push(incoming)
        })
        next = merged
      }

      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      setMessage(`${mode === 'merge' ? 'Merged' : 'Restored'} ${cloud.length} cloud projects. Reloading…`)
      window.setTimeout(() => window.location.reload(), 500)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Cloud restore failed.')
      setBusy(false)
    }
  }

  async function logOut() {
    setBusy(true)
    await signOut(session)
    setSession(null)
    setMessage('Signed out.')
    setBusy(false)
  }

  return (
    <aside className={`cloud-dock ${expanded ? 'open' : ''}`} aria-label="project.X cloud sync">
      <button className="cloud-dock-toggle" type="button" onClick={() => setExpanded((value) => !value)}>
        <span className={configured ? 'cloud-dot online' : 'cloud-dot'} />
        <strong>CLOUD</strong>
        <span>{session ? 'SIGNED IN' : configured ? 'READY' : 'SETUP'}</span>
      </button>
      {expanded && <div className="cloud-dock-panel">
        <div className="cloud-dock-head"><div><small>PHASE 4</small><strong>Supabase Cloud</strong></div><button type="button" onClick={() => setExpanded(false)}>×</button></div>
        <p className="cloud-message">{message}</p>
        {!session ? <>
          <label><span>Email</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /></label>
          <label><span>Password</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" /></label>
          <div className="cloud-actions"><button type="button" onClick={() => authenticate('signin')} disabled={!configured || busy}>Sign in</button><button type="button" onClick={() => authenticate('signup')} disabled={!configured || busy}>Create account</button></div>
        </> : <>
          <div className="cloud-user"><span>CONNECTED</span><strong>{session.user.email || session.user.id}</strong></div>
          <div className="cloud-actions"><button type="button" onClick={() => void pushCloud()} disabled={busy}>↑ Backup</button><button type="button" onClick={() => void pullCloud('merge')} disabled={busy}>↓ Merge</button></div>
          <button className="cloud-signout" type="button" onClick={() => void pullCloud('replace')} disabled={busy}>Replace from cloud</button>
          <button className="cloud-signout" type="button" onClick={logOut} disabled={busy}>Sign out</button>
        </>}
      </div>}
    </aside>
  )
}
