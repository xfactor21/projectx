import { useState } from 'react'
import { isSupabaseConfigured, loadSession } from './services/supabase'
import { fetchVercelDeployments } from './services/vercel'
import { browserFolderPickerAvailable } from './services/localProject'
import { isDesktopHostAvailable } from './services/desktop'

const PROJECTS_KEY = 'projectx.projects.v1'
const LOCAL_KEY = 'projectx.local.sources.v1'

type DiagnosticReport = {
  generatedAt: string
  app: { mode: string; url: string }
  browser: { userAgent: string; language: string; online: boolean }
  storage: { projectCount: number; localSourceCount: number }
  integrations: {
    supabaseConfigured: boolean
    signedIn: boolean
    vercelConnected: boolean
    vercelMessage?: string
    vercelDeploymentCount: number
    browserFolderPicker: boolean
    desktopHost: boolean
  }
}

function countStored(key: string) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '[]')
    return Array.isArray(parsed) ? parsed.length : 0
  } catch { return -1 }
}

export default function BetaDiagnosticsDock() {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [report, setReport] = useState<DiagnosticReport | null>(null)
  const [message, setMessage] = useState('Generate a non-secret support bundle for beta testing.')

  async function runDiagnostics() {
    setBusy(true)
    try {
      const vercel = await fetchVercelDeployments()
      const next: DiagnosticReport = {
        generatedAt: new Date().toISOString(),
        app: {
          mode: new URLSearchParams(window.location.search).get('mode') === 'companion' ? 'companion' : 'main',
          url: `${window.location.origin}${window.location.pathname}`,
        },
        browser: { userAgent: navigator.userAgent, language: navigator.language, online: navigator.onLine },
        storage: { projectCount: countStored(PROJECTS_KEY), localSourceCount: countStored(LOCAL_KEY) },
        integrations: {
          supabaseConfigured: isSupabaseConfigured(),
          signedIn: Boolean(loadSession()),
          vercelConnected: vercel.connected,
          vercelMessage: vercel.message,
          vercelDeploymentCount: vercel.deployments.length,
          browserFolderPicker: browserFolderPickerAvailable(),
          desktopHost: isDesktopHostAvailable(),
        },
      }
      setReport(next)
      setMessage('Diagnostics complete. No tokens, passwords, project notes, or source files are included.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Diagnostics failed.')
    } finally { setBusy(false) }
  }

  function download() {
    if (!report) return
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `project-x-diagnostics-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return <aside className={`beta-dock ${open ? 'open' : ''}`} aria-label="Beta diagnostics">
    <button className="beta-toggle" type="button" onClick={() => setOpen((value) => !value)}><span>β</span><strong>BETA</strong></button>
    {open && <div className="beta-panel"><div className="beta-head"><div><small>TESTER SUPPORT</small><strong>Diagnostics</strong></div><button type="button" onClick={() => setOpen(false)}>×</button></div><p>{message}</p>
      <button className="beta-primary" type="button" disabled={busy} onClick={() => void runDiagnostics()}>{busy ? 'Checking…' : 'Run diagnostics'}</button>
      {report && <><div className="beta-results"><span>Projects <b>{report.storage.projectCount}</b></span><span>Supabase <b>{report.integrations.supabaseConfigured ? 'ready' : 'setup'}</b></span><span>Vercel <b>{report.integrations.vercelConnected ? 'ready' : 'blocked'}</b></span><span>Local folders <b>{report.integrations.desktopHost ? 'Windows host' : report.integrations.browserFolderPicker ? 'browser' : 'limited'}</b></span></div><button className="beta-secondary" type="button" onClick={download}>Download support bundle</button></>}
      <small className="beta-note">The support bundle deliberately excludes credentials, auth tokens, project notes, local paths, source code and cloud row contents.</small>
    </div>}
  </aside>
}
