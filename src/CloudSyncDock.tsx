import { useMemo, useState } from 'react'
import {
  fetchCloudProjects,
  isSupabaseConfigured,
  loadSession,
  signInWithPassword,
  signOut,
  signUpWithPassword,
  upsertCloudProjects,
} from './services/supabase'

const STORAGE_KEY = 'projectx.projects.v1'

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
}

function readLocalProjects(): LocalProject[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    // Backup should fail safe to an empty collection if local data is malformed instead of crashing the dock.
    return []
  }
}

export default function CloudSyncDock() {
  const [session, setSession] = useState(loadSession)
  const [email, setEmail] = useState(session?.user?.email || '')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [message, setMessage] = useState(isSupabaseConfigured() ? 'Cloud ready' : 'Add Supabase publishable key in Vercel')

  // Configuration comes from Vite build-time environment values, so it is stable for the lifetime of this bundle.
  const configured = useMemo(() => isSupabaseConfigured(), [])

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
      } else {
        // Supabase can create the account without issuing a session when email confirmation is enabled.
        setMessage('Account created. Check your email if confirmation is enabled.')
      }
      setPassword('')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Authentication failed.')
    } finally {
      setBusy(false)
    }
  }

  async function pushCloud() {
    if (!session) return setMessage('Sign in first.')
    setBusy(true)
    try {
      const projects = readLocalProjects()
      await upsertCloudProjects(projects.map((project, index) => ({
        user_id: session.user.id,
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
        // Preserve the visible local ordering in the cloud snapshot so restore can reproduce it.
        sort_order: index,
      })))
      setMessage(`Cloud backup complete: ${projects.length} projects.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Cloud backup failed.')
    } finally {
      setBusy(false)
    }
  }

  async function pullCloud() {
    if (!session) return setMessage('Sign in first.')
    setBusy(true)
    try {
      const rows = await fetchCloudProjects(session)
      const projects = rows.map((row) => ({
        id: row.client_id,
        name: row.name,
        kicker: row.kicker || '',
        description: row.description || '',
        status: row.status || 'Building',
        stack: Array.isArray(row.stack) ? row.stack : [],
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
      // Restore is intentionally snapshot-style, not merge-style: replacing the key avoids retaining
      // deleted/stale local projects that are absent from the cloud backup. App state is rehydrated on reload.
      localStorage.setItem(STORAGE_KEY, JSON.stringify(projects))
      setMessage(`Restored ${projects.length} projects. Reloading…`)
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
          <div className="cloud-actions"><button type="button" onClick={pushCloud} disabled={busy}>↑ Backup</button><button type="button" onClick={pullCloud} disabled={busy}>↓ Restore</button></div>
          <button className="cloud-signout" type="button" onClick={logOut} disabled={busy}>Sign out</button>
        </>}
      </div>}
    </aside>
  )
}
