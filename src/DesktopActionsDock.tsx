import { useEffect, useState } from 'react'
import { getDesktopHost } from './services/desktop'

const LOCAL_KEY = 'projectx.local.sources.v1'

type LocalSource = {
  projectId: string
  kind: 'desktop' | 'browser' | 'managed' | 'zip' | 'generated'
  label: string
  path?: string
  gitBranch?: string
  hasGit?: boolean
  scripts?: string[]
}

function readSources(): LocalSource[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}

export default function DesktopActionsDock() {
  const desktop = getDesktopHost()
  const [sources, setSources] = useState(() => readSources().filter((source) => source.kind !== 'browser' && source.path))
  const [expanded, setExpanded] = useState(false)
  const [selectedId, setSelectedId] = useState(sources[0]?.projectId || '')
  const [commitMessage, setCommitMessage] = useState('')
  const [script, setScript] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(desktop ? 'Windows host ready.' : 'Open the Windows app to use native project actions.')

  useEffect(() => {
    const refresh = () => setSources(readSources().filter((source) => source.kind !== 'browser' && source.path))
    window.addEventListener('projectx:projects-changed', refresh)
    window.addEventListener('storage', refresh)
    return () => { window.removeEventListener('projectx:projects-changed', refresh); window.removeEventListener('storage', refresh) }
  }, [])

  if (!desktop) return null
  const source = sources.find((item) => item.projectId === selectedId) || sources[0]

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true)
    try {
      const result = await action()
      if (typeof result === 'object' && result && 'ok' in result && (result as { ok?: unknown }).ok === false) {
        throw new Error(String((result as { output?: unknown }).output || 'Desktop action failed.'))
      }
      const output = typeof result === 'object' && result && 'output' in result ? String((result as { output?: unknown }).output || '') : ''
      setMessage(output ? `${success}\n${output}` : success)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Desktop action failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <aside className={`desktop-actions-dock ${expanded ? 'open' : ''}`} aria-label="Windows project actions">
      <button className="desktop-actions-toggle" type="button" onClick={() => setExpanded((value) => !value)}>
        <span className="desktop-actions-dot"/><strong>WINDOWS</strong><span>{sources.length} LOCAL</span>
      </button>
      {expanded && <div className="desktop-actions-panel">
        <div className="desktop-actions-head"><div><small>NATIVE HOST</small><strong>Project operations</strong></div><button type="button" onClick={() => setExpanded(false)}>×</button></div>
        {sources.length === 0 ? <p>Choose a local project folder first.</p> : <>
          <label><span>Authorized project</span><select value={source?.projectId || ''} onChange={(event) => { setSelectedId(event.target.value); setScript('') }}>
            {sources.map((item) => <option key={item.projectId} value={item.projectId}>{item.label}</option>)}
          </select></label>
          <p className="desktop-actions-message">{message}</p>
          {source?.path && <>
            <div className="desktop-actions-grid">
              <button disabled={busy} type="button" onClick={() => run(() => desktop.openInExplorer(source.path!), 'Opened Explorer.')}>Explorer</button>
              <button disabled={busy} type="button" onClick={() => run(() => desktop.openInTerminal(source.path!), 'Opened terminal.')}>Terminal</button>
              <button disabled={busy || !source.hasGit} type="button" onClick={() => run(() => desktop.gitStatus(source.path!), 'Git status refreshed.')}>Git status</button>
              <button disabled={busy || !source.hasGit} type="button" onClick={() => run(() => desktop.gitPush(source.path!), 'Push finished.')}>Push</button>
            </div>
            {source.hasGit && <div className="desktop-commit-row"><input value={commitMessage} onChange={(event) => setCommitMessage(event.target.value)} placeholder="Commit message"/><button disabled={busy || !commitMessage.trim()} type="button" onClick={() => run(() => desktop.gitCommit(source.path!, commitMessage.trim()), 'Commit finished.')}>Commit all</button></div>}
            {(source.scripts?.length || 0) > 0 && <div className="desktop-script-row"><select value={script} onChange={(event) => setScript(event.target.value)}><option value="">Choose npm script…</option>{source.scripts!.map((item) => <option key={item}>{item}</option>)}</select><button disabled={busy || !script} type="button" onClick={() => run(() => desktop.runScript(source.path!, script), `npm run ${script} finished.`)}>Run</button></div>}
          </>}
          <small>Commands are limited to folders you selected through project.X. Commit stages all changes in that authorized project before committing.</small>
        </>}
      </div>}
    </aside>
  )
}
