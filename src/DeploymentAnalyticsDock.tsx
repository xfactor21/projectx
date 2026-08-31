import { useState } from 'react'
import { createPortal } from 'react-dom'
import { fetchVercelDeployments } from './services/vercel'
import { openHostedLink } from './services/externalLinks'

type Rollup = { name: string; total: number; ready: number; latestState: string; latestAt: number; latestUrl: string }

function rollupDeployments(deployments: Awaited<ReturnType<typeof fetchVercelDeployments>>['deployments']) {
  const groups = new Map<string, Rollup>()
  deployments.forEach((deployment) => {
    const current = groups.get(deployment.name)
    if (!current) {
      groups.set(deployment.name, {
        name: deployment.name,
        total: 1,
        ready: deployment.state === 'READY' ? 1 : 0,
        latestState: deployment.state,
        latestAt: deployment.createdAt,
        latestUrl: deployment.url,
      })
      return
    }
    current.total += 1
    if (deployment.state === 'READY') current.ready += 1
    if (deployment.createdAt > current.latestAt) {
      current.latestAt = deployment.createdAt
      current.latestState = deployment.state
      current.latestUrl = deployment.url
    }
  })
  return [...groups.values()].sort((a, b) => b.latestAt - a.latestAt)
}

export default function DeploymentAnalyticsDock() {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('Load deployment health when you want it.')
  const [rollups, setRollups] = useState<Rollup[]>([])

  async function load() {
    setBusy(true)
    try {
      const result = await fetchVercelDeployments()
      if (!result.connected) {
        setRollups([])
        setMessage(result.message || 'Vercel analytics unavailable.')
        return
      }
      const next = rollupDeployments(result.deployments)
      setRollups(next)
      setMessage(`${result.deployments.length} recent deployments across ${next.length} Vercel projects.`)
    } finally {
      setBusy(false)
    }
  }

  return <aside className={`analytics-dock ${open ? 'open' : ''}`} aria-label="Deployment analytics">
    <button className="analytics-toggle" type="button" onClick={() => setOpen((value) => !value)}><span>⌁</span><strong>ANALYTICS</strong></button>
    {open && createPortal(<div className="utility-modal-layer" onPointerDown={(event) => { if (event.target === event.currentTarget) setOpen(false) }}><div className="analytics-panel" data-projectx-utility-panel="true" role="dialog" aria-modal="true" aria-label="Deployment health"><div className="analytics-head"><div><small>OPTIONAL / DEPLOYED APPS</small><strong>Deployment health</strong></div><button type="button" onClick={() => setOpen(false)}>×</button></div>
      <p>{message}</p><button className="analytics-load" type="button" onClick={() => void load()} disabled={busy}>{busy ? 'Loading…' : 'Refresh Vercel analytics'}</button>
      <div className="analytics-list">{rollups.slice(0, 12).map((item) => <div className="analytics-row" key={item.name}><div><strong>{item.name}</strong><span>{item.latestState} · {new Date(item.latestAt).toLocaleString()}</span></div><div><b>{item.total}</b><small>DEPLOYS</small></div><div><b>{Math.round((item.ready / Math.max(1, item.total)) * 100)}%</b><small>READY</small></div><button type="button" onClick={() => void openHostedLink(item.latestUrl)}>↗</button></div>)}</div>
      <small className="analytics-note">This intentionally starts with deployment reliability. Traffic, runtime-error, performance and cost adapters can plug into the same surface without becoming required for project.X.</small>
    </div></div>, document.body)}
  </aside>
}
