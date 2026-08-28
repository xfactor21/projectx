import { useEffect, useState } from 'react'
import { getDesktopHost } from './services/desktop'
import { persistRunTasks, readRunTasks } from './services/runTasks'

type PreviewState = { projectId: string; projectName: string; url: string; pid?: number; revision: number }

export default function EmbeddedPreview() {
  const desktop = getDesktopHost()
  const [preview, setPreview] = useState<PreviewState | null>(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    const open = (event: Event) => {
      const detail = (event as CustomEvent<Omit<PreviewState, 'revision'>>).detail
      if (!detail?.url || !/^https?:\/\//i.test(detail.url)) return
      setMessage('')
      setPreview({ ...detail, revision: Date.now() })
    }
    window.addEventListener('projectx:open-preview', open)
    return () => window.removeEventListener('projectx:open-preview', open)
  }, [])

  if (!preview) return null

  async function stop() {
    if (!desktop || !preview?.pid) return setPreview(null)
    try {
      const result = await desktop.stopDevProject(preview.pid)
      if (!result.ok) throw new Error(result.output || 'Unable to stop the dev server.')
      persistRunTasks(readRunTasks().filter((task) => task.pid !== preview.pid))
      window.dispatchEvent(new CustomEvent('projectx:projects-changed'))
      setPreview(null)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error || 'Unable to stop the dev server.'))
    }
  }

  return <div className="embedded-preview-backdrop">
    <section className="embedded-preview" role="dialog" aria-modal="true" aria-label={`${preview.projectName} preview`}>
      <header>
        <div><small>PROJECT.X WEBVIEW</small><strong>{preview.projectName}</strong><span>{preview.url}</span></div>
        <nav aria-label="Preview controls">
          <button type="button" title="Reload preview" aria-label="Reload preview" onClick={() => setPreview((current) => current ? { ...current, revision: Date.now() } : current)}>↻</button>
          <button type="button" title="Open in default browser" aria-label="Open in default browser" onClick={() => void desktop?.openExternalPreview(preview.url)}>↗</button>
          <button type="button" title="Stop server" aria-label="Stop server" disabled={!preview.pid} onClick={() => void stop()}>■</button>
          <button type="button" title="Close preview" aria-label="Close preview" onClick={() => setPreview(null)}>×</button>
        </nav>
      </header>
      {message && <p>{message}</p>}
      <iframe key={preview.revision} src={preview.url} title={`${preview.projectName} running preview`} allow="clipboard-read; clipboard-write; fullscreen" />
    </section>
  </div>
}
