import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { connectProvider, fetchProviderConnection, type ProviderConnectionState, type ProviderId } from './services/providerConnections'
import { isSupabaseConfigured, loadSession, signInWithPassword, type SupabaseSession } from './services/supabase'

type ConnectionTarget = 'companion' | ProviderId
type HostStatus = { status: 'connecting' | 'online' | 'error'; detail: string; projectCount: number; updatedAt: string }
const HOST_STATUS_KEY = 'projectx.companion.host-status.v1'
const HOST_FRESH_MS = 30_000

function readHostStatus(): HostStatus | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(HOST_STATUS_KEY) || 'null')
    return parsed && typeof parsed.detail === 'string' && typeof parsed.updatedAt === 'string' ? parsed : null
  } catch { return null }
}

function delay(ms: number) { return new Promise((resolve) => window.setTimeout(resolve, ms)) }
function providerLabel(provider: ProviderId) { return provider === 'github' ? 'GitHub' : 'Vercel' }

export default function ConnectionCenter() {
  const [target, setTarget] = useState<ConnectionTarget | null>(null)
  const [host, setHost] = useState<HostStatus | null>(readHostStatus)
  const [provider, setProvider] = useState<ProviderConnectionState | null>(null)
  const [session, setSession] = useState<SupabaseSession | null>(loadSession)
  const [email, setEmail] = useState(loadSession()?.user.email || '')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [clock, setClock] = useState(Date.now())

  useEffect(() => {
    const open = (event: Event) => {
      const next = (event as CustomEvent<{ target?: ConnectionTarget }>).detail?.target
      if (!next || !['companion', 'github', 'vercel'].includes(next)) return
      setSession(loadSession())
      setTarget(next)
      setProvider(null)
      setMessage('')
      if (next === 'companion') setHost(readHostStatus())
      else void refresh(next)
    }
    const refreshHost = () => setHost(readHostStatus())
    const refreshSession = () => setSession(loadSession())
    window.addEventListener('projectx:open-connection', open)
    window.addEventListener('projectx:companion-status', refreshHost)
    window.addEventListener('projectx:supabase-session-changed', refreshSession)
    return () => {
      window.removeEventListener('projectx:open-connection', open)
      window.removeEventListener('projectx:companion-status', refreshHost)
      window.removeEventListener('projectx:supabase-session-changed', refreshSession)
    }
  }, [])

  useEffect(() => {
    if (!target) return
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setTarget(null) }
    document.addEventListener('keydown', close)
    return () => document.removeEventListener('keydown', close)
  }, [target])
  useEffect(() => { if (!target) return; const timer = window.setInterval(() => setClock(Date.now()), 5_000); return () => window.clearInterval(timer) }, [target])

  async function refresh(next: ProviderId) {
    setBusy(true)
    try { setProvider(await fetchProviderConnection(next, true)) }
    finally { setBusy(false) }
  }

  async function login() {
    if (!email.trim() || !password) return setMessage('Enter your project.X email and password.')
    setBusy(true)
    try {
      const next = await signInWithPassword(email.trim(), password)
      setSession(next)
      setPassword('')
      if (target === 'github' || target === 'vercel') {
        setMessage(`project.X identity verified. Now authorize ${providerLabel(target)} separately below.`)
        await refresh(target)
      } else {
        setMessage('Signed in and securely saved on this Windows account. Companion is reconnecting now.')
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Sign in failed.')
    } finally { setBusy(false) }
  }

  async function connect(next: ProviderId) {
    setBusy(true)
    try {
      await connectProvider(next)
      setMessage(`${providerLabel(next)} opened in your browser. Complete its authorization there; project.X is watching for the callback.`)
      for (let attempt = 0; attempt < 45; attempt += 1) {
        await delay(2_000)
        const state = await fetchProviderConnection(next, true)
        setProvider(state)
        if (state.connected) {
          setMessage(`${providerLabel(next)} authorization completed. ${state.resourceCount} accessible ${next === 'github' ? 'repositories' : 'projects'} detected.`)
          window.dispatchEvent(new CustomEvent('projectx:provider-changed'))
          return
        }
      }
      setMessage(`${providerLabel(next)} authorization is still pending. Finish the provider's browser flow, then use Check authorization.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `Unable to connect ${providerLabel(next)}.`)
    } finally { setBusy(false) }
  }

  if (!target) return null
  const title = target === 'companion' ? 'Companion' : target === 'github' ? 'GitHub' : 'Vercel'
  const hostOnline = host?.status === 'online' && Boolean(host.updatedAt) && clock - new Date(host.updatedAt).getTime() < HOST_FRESH_MS
  const providerConnected = target !== 'companion' && provider?.provider === target && provider.connected
  const authForm = !session ? <div className="connection-inline-auth">
    <label><span>project.X email</span><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
    <label><span>project.X password</span><input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && void login()} /></label>
    <button className="connection-primary" type="button" disabled={busy || !isSupabaseConfigured()} onClick={() => void login()}>{busy ? 'Signing in…' : 'Sign in to project.X Cloud'}</button>
  </div> : null

  return createPortal(<div className="connection-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) setTarget(null) }}>
    <section className={`connection-center connection-${target}`} role="dialog" aria-modal="true" aria-label={`${title} connection`}>
      <header><div><small>PROJECT.X CONNECTION</small><h2>{title}</h2></div><button type="button" onClick={() => setTarget(null)} aria-label="Close connection panel">×</button></header>
      {target === 'companion' ? <>
        <div className={`connection-state ${hostOnline ? 'online' : host?.status === 'error' ? 'error' : 'idle'}`}><i/><div><strong>{hostOnline ? 'Windows host is available' : host?.status === 'error' ? 'Companion needs attention' : 'Waiting for Companion'}</strong><p>{host?.detail || 'Sign in on this PC and the Companion with the same project.X account.'}</p><small>{host?.updatedAt ? `Last recorded ${new Date(host.updatedAt).toLocaleString()}` : 'No host check recorded yet'}</small></div></div>
        <div className="connection-facts"><span>Cloud account<b>{session ? 'SIGNED IN' : isSupabaseConfigured() ? 'SIGNED OUT' : 'UNAVAILABLE'}</b></span><span>Local projects<b>{host?.projectCount ?? 0}</b></span></div>
        {message && <p className="connection-message">{message}</p>}
        {authForm}
        {session && <button className="connection-primary" type="button" onClick={() => { setTarget(null); window.dispatchEvent(new CustomEvent('projectx:open-utility', { detail: { category: 'cloud', openCloud: true } })) }}>Manage project.X Cloud account</button>}
      </> : <>
        <div className="provider-auth-flow" aria-label={`${title} authorization steps`}>
          <div className={`provider-auth-step ${session ? 'complete' : 'active'}`}><b>1</b><div><strong>project.X identity</strong><p>{session ? `Signed in as ${session.user.email || 'project.X user'}. This does not sign you into ${title}.` : `First identify your project.X account. This is only the prerequisite for storing your ${title} connection.`}</p></div><span>{session ? 'READY' : 'REQUIRED'}</span></div>
          <div className={`provider-auth-step ${providerConnected ? 'complete' : session ? 'active' : 'locked'}`}><b>2</b><div><strong>{title} authorization</strong><p>{providerConnected ? `${title} granted project.X access to your user-scoped resources.` : session ? `Authorize directly with ${title} in your browser. Your project.X password is never used as your ${title} login.` : `Available after project.X identity is verified.`}</p></div><span>{providerConnected ? 'CONNECTED' : session ? 'AUTHORIZE' : 'LOCKED'}</span></div>
        </div>
        {authForm}
        {session && <>
          <div className={`connection-state ${providerConnected ? 'online' : 'idle'}`}><i/><div><strong>{providerConnected ? `${title} connected` : `${title} authorization not active`}</strong><p>{provider?.message || `Checking ${title} authorization…`}</p><small>{provider?.checkedAt ? `Last checked ${new Date(provider.checkedAt).toLocaleString()}` : 'Not checked yet'}</small></div></div>
          <div className="connection-facts"><span>Accessible {target === 'github' ? 'repositories' : 'projects'}<b>{provider?.resourceCount ?? 0}</b></span><span>Provider permission<b>USER SCOPED</b></span></div>
          <div className="connection-actions"><button className="connection-primary" type="button" disabled={busy} onClick={() => void connect(target)}>{busy ? 'Waiting…' : providerConnected ? `Re-authorize ${title}` : `Authorize ${title} in browser`}</button><button type="button" disabled={busy} onClick={() => void refresh(target)}>Check authorization</button></div>
        </>}
        {message && <p className="connection-message">{message}</p>}
      </>}
    </section>
  </div>, document.body)
}
