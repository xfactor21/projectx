import { useEffect, useState } from 'react'
import { getDesktopHost } from './services/desktop'
import type { ToolStatus } from './services/desktop'

export default function RuntimeDock() {
  const desktop = getDesktopHost()
  const [open, setOpen] = useState(false)
  const [tools, setTools] = useState<ToolStatus[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(desktop ? 'Check the local runtimes project.X can use.' : 'Runtime inspection requires the Windows app.')

  async function scan() {
    if (!desktop) return
    setBusy(true)
    try {
      const result = await desktop.toolchainPreflight()
      setTools(result)
      const available = result.filter((tool) => tool.installed).length
      setMessage(`${available}/${result.length} supported tools detected on this PC.`)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to inspect local toolchains.') }
    finally { setBusy(false) }
  }

  useEffect(() => { if (open && desktop && tools.length === 0) void scan() }, [open])

  return <aside className={`runtime-dock ${open ? 'open' : ''}`} aria-label="Runtime toolchain status">
    <button className="runtime-dock-toggle" type="button" onClick={() => setOpen((value) => !value)}><strong>ENV</strong><span>RUNTIMES</span></button>
    {open && <div className="runtime-panel">
      <header><div><small>LOCAL TOOLCHAIN</small><strong>Environment preflight</strong></div><button type="button" onClick={() => setOpen(false)}>×</button></header>
      <p>{message}</p>
      <button className="runtime-scan" type="button" disabled={!desktop || busy} onClick={() => void scan()}>{busy ? 'Scanning…' : '↻ Rescan this PC'}</button>
      <div className="runtime-list">{tools.map((tool) => <div key={tool.name} className={tool.installed ? 'ready' : 'missing'}><i/><span><strong>{tool.name}</strong><small>{tool.installed ? tool.version || 'Detected' : `Not found (${tool.command})`}</small></span><b>{tool.installed ? 'READY' : 'MISSING'}</b></div>)}</div>
      <small className="runtime-note">project.X uses this preflight before automated initialization/run flows. Missing optional package managers do not block npm projects.</small>
    </div>}
  </aside>
}
