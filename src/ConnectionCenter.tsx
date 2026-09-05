import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { connectProvider, fetchProviderConnection, type ProviderConnectionState, type ProviderId } from './services/providerConnections'
import { isSupabaseConfigured, loadSession } from './services/supabase'

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

export default function ConnectionCenter() {
  const [target, setTarget] = useState<ConnectionTarget | null>(null)
  const [host, setHost] = useState<HostStatus | null>(readHostStatus)
  const [provider, setProvider] = useState<ProviderConnectionState | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [clock, setClock] = useState(Date.now())
  const session = loadSession()

  useEffect(() => {
    const open = (event: Event) => {
      const next = (event as CustomEvent<{ target?: ConnectionTarget }>).detail?.target
      if (!next || !['companion', 'github', 'vercel'].includes(next)) return
      setTarget(next)
      setMessage('')
      if (next === 'companion') setHost(readHostStatus())
      else void refresh(next)
    }
    const refreshHost = () => setHost(readHostStatus())
    window.addEventListener('projectx:open-connection', open)
    window.addEventListener('projectx:companion-status', refreshHost)
    return () => {
      window.removeEventListener('projectx:open-connection', open)
      window.removeEventListener('projectx:companion-status', refreshHost)
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

  async function connect(next: ProviderId) {
    setBusy(true)
    try { setMessage(await connectProvider(next)) }
    catch (error) { setMessage(error instanceof Error ? error.message : `Unable to connect ${next}.`) }
    finally { setBusy(false) }
  }

  if (!target) return null
  const title = target === 'companion' ? 'Companion' : target === 'github' ? 'GitHub' : 'Vercel'
  const hostOnline = host?.status === 'online' && Boolean(host.updatedAt) && clock - new Date(host.updatedAt).getTime() < HOST_FRESH_MS
  const providerConnected = target !== 'companion' && provider?.provider === target && provider.connected

  return createPortal(<div className="connection-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) setTarget(null) }}>
    <section className={`connection-center connection-${target}`} role="dialog" aria-modal="true" aria-label={`${title} connection`}>
      <header><div><small>PROJECT.X CONNECTION</small><h2>{title}</h2></div><button type="button" onClick={() => setTarget(null)} aria-label="Close connection panel">×</button></header>
      {target === 'companion' ? <>
        <div className={`connection-state ${hostOnline ? 'online' : host?.status === 'error' ? 'error' : 'idle'}`}><i/><div><strong>{hostOnline ? 'Windows host is available' : host?.status === 'error' ? 'Companion needs attention' : 'Waiting for Companion'}</strong><p>{host?.detail || 'Sign in on this PC and the Companion with the same project.X account.'}</p><small>{host?.updatedAt ? `Last recorded ${new Date(host.updatedAt).toLocaleString()}` : 'No host check recorded yet'}</small></div></div>
        <div className="connection-facts"><span>Cloud account<b>{session ? 'SIGNED IN' : isSupabaseConfigured() ? 'SIGNED OUT' : 'UNAVAILABLE'}</b></span><span>Local projects<b>{host?.projectCount ?? 0}</b></span></div>
        <button className="connection-primary" type="button" onClick={() => { setTarget(null); window.dispatchEvent(new CustomEvent('projectx:open-utility', { detail: { category: 'cloud', openCloud: true } })) }}>{session ? 'Manage account and Companion' : 'Sign in to project.X Cloud'}</button>
      </> : <>
        <div className={`connection-state ${providerConnected ? 'online' : 'idle'}`}><i/><div><strong>{providerConnected ? `${title} connected` : `${title} is not connected`}</strong><p>{provider?.message || `Checking ${title} connection…`}</p><small>{provider?.checkedAt ? `Last checked ${new Date(provider.checkedAt).toLocaleString()}` : 'Not checked yet'}</small></div></div>
        <div className="connection-facts"><span>Accessible {target === 'github' ? 'repositories' : 'projects'}<b>{provider?.resourceCount ?? 0}</b></span><span>Permission model<b>USER SCOPED</b></span></div>
        {message && <p className="connection-message">{message}</p>}
        <div className="connection-actions"><button className="connection-primary" type="button" disabled={busy || !session} onClick={() => void connect(target)}>{providerConnected ? `Reconnect ${title}` : `Connect ${title}`}</button><button type="button" disabled={busy} onClick={() => void refresh(target)}>Refresh status</button></div>
        {!session && <p className="connection-note">Sign in to project.X Cloud first so this provider connection belongs only to your account.</p>}
      </>}
    </section>
  </div>, document.body)
}
