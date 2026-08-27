import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { getDesktopHost } from './services/desktop'
import type { ArtworkCandidate } from './services/desktop'

const PROJECTS_KEY = 'projectx.projects.v1'
const LOCAL_KEY = 'projectx.local.sources.v1'

type Project = { id: string; name: string; coverUrl?: string; artworkSource?: string }
type LocalSource = { projectId: string; path?: string }

function readArray<T>(key: string): T[] {
  try { const parsed = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(parsed) ? parsed : [] }
  catch { return [] }
}

export default function ArtworkDock() {
  const desktop = getDesktopHost()
  const [open, setOpen] = useState(false)
  const [projects, setProjects] = useState<Project[]>(() => readArray(PROJECTS_KEY))
  const [projectId, setProjectId] = useState('')
  const [message, setMessage] = useState('Choose a project and supply its icon, cover, banner, or artwork.')
  const [candidates, setCandidates] = useState<ArtworkCandidate[]>([])
  const [scanning, setScanning] = useState(false)
  const [saved, setSaved] = useState(false)
  const selected = useMemo(() => projects.find((project) => project.id === projectId), [projects, projectId])
  const source = useMemo(() => readArray<LocalSource>(LOCAL_KEY).find((item) => item.projectId === projectId), [projectId])
  const previewTheme = (localStorage.getItem('projectx.view.v1') || 'Grid').toLowerCase()

  function saveCover(dataUrl: string, artworkSource = 'manual upload') {
    if (!projectId) return
    const next = readArray<Project>(PROJECTS_KEY).map((project) => project.id === projectId ? { ...project, coverUrl: dataUrl, artworkSource } : project)
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(next))
    setProjects(next)
    setSaved(true)
    setMessage(`Artwork saved for ${next.find((project) => project.id === projectId)?.name || 'project'}. Select Done when finished.`)
    window.dispatchEvent(new CustomEvent('projectx:projects-changed'))
  }

  function chooseFile(file?: File) {
    if (!file || !file.type.startsWith('image/')) { setMessage('Choose an image file such as PNG, JPG, WEBP, GIF, SVG, or ICO.'); return }
    if (file.size > 3_000_000) { setMessage('That image is over 3 MB. Use a smaller project cover to keep the local workspace responsive.'); return }
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' && saveCover(reader.result, file.name)
    reader.onerror = () => setMessage('Unable to read that artwork file.')
    reader.readAsDataURL(file)
  }

  async function scanProject(autoApply = false) {
    if (!desktop || !source?.path) { setMessage('Native artwork scanning requires a local project on this Windows host.'); return }
    setScanning(true); setCandidates([])
    try {
      const found = await desktop.discoverProjectArtwork(source.path)
      setCandidates(found)
      const previewable = found.filter((item) => item.dataUrl).length
      const best = found.find((item) => item.dataUrl)
      if (autoApply && best?.dataUrl && !selected?.coverUrl) {
        saveCover(best.dataUrl, best.relativePath)
        setMessage(`Automatically selected ${best.fileName} as the project artwork. ${found.length} candidates found.`)
      } else {
        setMessage(found.length ? `Found ${found.length} ranked image candidates (${previewable} previewable).` : 'No likely project artwork was found. Manual upload remains available.')
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Artwork scan failed.') }
    finally { setScanning(false) }
  }

  async function selectProject(nextId: string) {
    setProjectId(nextId); setCandidates([])
    if (!nextId || !desktop) return
    const currentProject = readArray<Project>(PROJECTS_KEY).find((project) => project.id === nextId)
    const currentSource = readArray<LocalSource>(LOCAL_KEY).find((item) => item.projectId === nextId)
    if (currentProject?.coverUrl || !currentSource?.path) return
    setScanning(true)
    try {
      const found = await desktop.discoverProjectArtwork(currentSource.path)
      setCandidates(found)
      const best = found.find((item) => item.dataUrl)
      if (best?.dataUrl) {
        const next = readArray<Project>(PROJECTS_KEY).map((project) => project.id === nextId ? { ...project, coverUrl: best.dataUrl, artworkSource: best.relativePath } : project)
        localStorage.setItem(PROJECTS_KEY, JSON.stringify(next)); setProjects(next)
        setSaved(true); setMessage(`Automatically selected and saved ${best.fileName}. You can choose another candidate below, then select Done.`)
        window.dispatchEvent(new CustomEvent('projectx:projects-changed'))
      } else setMessage(found.length ? `Found ${found.length} candidates, but none small enough to preview automatically.` : 'No likely project artwork was found.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Artwork scan failed.') }
    finally { setScanning(false) }
  }

  function applyCandidate(candidate: ArtworkCandidate) {
    if (!candidate.dataUrl) { setMessage('That candidate is too large for an inline preview. Choose it manually after optimizing it, or use another candidate.'); return }
    saveCover(candidate.dataUrl, candidate.relativePath)
  }

  function removeArtwork() {
    if (!projectId) return
    const next = readArray<Project>(PROJECTS_KEY).map((project) => project.id === projectId ? { ...project, coverUrl: '', artworkSource: '' } : project)
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(next)); setProjects(next); setCandidates([])
    setSaved(true); setMessage('Project artwork removal saved. Select Done when finished.'); window.dispatchEvent(new CustomEvent('projectx:projects-changed'))
  }

  return <aside className={`artwork-dock ${open ? 'open' : ''}`} aria-label="Project artwork">
    <button className="artwork-dock-toggle" type="button" onClick={() => { setProjects(readArray(PROJECTS_KEY)); setSaved(false); setOpen((value) => !value) }}><strong>ART</strong><span>ICON / COVER</span></button>
    {open && createPortal(<div className="artwork-panel" data-projectx-utility-panel="true" role="dialog" aria-modal="true" aria-label="Artwork manager">
      <header><div><small>PROJECT IDENTITY</small><strong>Artwork manager</strong></div><button type="button" onClick={() => setOpen(false)}>×</button></header>
      <p>{message}</p>
      <label>Project<select value={projectId} onChange={(event) => void selectProject(event.target.value)}><option value="">Choose project…</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
      {selected?.coverUrl && <><div className={`artwork-preview theme-preview-${previewTheme}`} style={{ backgroundImage: `url(${selected.coverUrl})` }} /><small>{selected.artworkSource ? `Source: ${selected.artworkSource} · ${previewTheme} preview` : `Current artwork · ${previewTheme} preview`}</small></>}
      <div className="artwork-actions">
        <button type="button" disabled={!projectId || !desktop || !source?.path || scanning} onClick={() => void scanProject(false)}>{scanning ? 'Scanning…' : '⌕ Scan project artwork'}</button>
        <label className={`artwork-upload ${projectId ? '' : 'disabled'}`}>Upload + save artwork<input type="file" accept="image/*,.ico,.svg" disabled={!projectId} onChange={(event) => { chooseFile(event.target.files?.[0]); event.target.value = '' }}/></label>
        <button type="button" disabled={!projectId || !selected?.coverUrl} onClick={removeArtwork}>Remove artwork</button>
      </div>
      {candidates.length > 0 && <div className="artwork-candidates"><small>RANKED PROJECT ART</small>{candidates.map((candidate) => <button key={candidate.path} type="button" className="artwork-candidate" disabled={!candidate.dataUrl} onClick={() => applyCandidate(candidate)}>
        <span className="artwork-thumb" style={candidate.dataUrl ? { backgroundImage: `url(${candidate.dataUrl})` } : undefined}>{!candidate.dataUrl && 'LARGE'}</span>
        <span><strong>{candidate.fileName}</strong><small>{candidate.kind.toUpperCase()} · SCORE {candidate.score}</small><em>{candidate.relativePath}</em></span>
      </button>)}</div>}
      <div className={`artwork-complete ${saved ? 'saved' : ''}`}><span>{saved ? 'Changes saved' : 'Uploads save immediately'}</span><button type="button" onClick={() => setOpen(false)}>Done</button></div>
      <small className="artwork-note">Automatic scan skips build/cache/vendor folders and ranks icons/logos ahead of banners, covers, and screenshots. Manual override always wins.</small>
    </div>, document.body)}
  </aside>
}
