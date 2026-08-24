import { useMemo, useState } from 'react'

const PROJECTS_KEY = 'projectx.projects.v1'

type Project = { id: string; name: string; coverUrl?: string }

function readProjects(): Project[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(PROJECTS_KEY) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}

export default function ArtworkDock() {
  const [open, setOpen] = useState(false)
  const [projects, setProjects] = useState<Project[]>(readProjects)
  const [projectId, setProjectId] = useState('')
  const [message, setMessage] = useState('Choose a project and supply its icon, cover, banner, or artwork.')
  const selected = useMemo(() => projects.find((project) => project.id === projectId), [projects, projectId])

  function saveCover(dataUrl: string) {
    if (!projectId) return
    const next = readProjects().map((project) => project.id === projectId ? { ...project, coverUrl: dataUrl } : project)
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(next))
    setProjects(next)
    setMessage(`Artwork updated for ${next.find((project) => project.id === projectId)?.name || 'project'}.`)
    window.dispatchEvent(new CustomEvent('projectx:projects-changed'))
  }

  function chooseFile(file?: File) {
    if (!file || !file.type.startsWith('image/')) {
      setMessage('Choose an image file such as PNG, JPG, WEBP, GIF, SVG, or ICO.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' && saveCover(reader.result)
    reader.onerror = () => setMessage('Unable to read that artwork file.')
    reader.readAsDataURL(file)
  }

  function removeArtwork() {
    if (!projectId) return
    const next = readProjects().map((project) => project.id === projectId ? { ...project, coverUrl: '' } : project)
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(next))
    setProjects(next)
    setMessage('Custom artwork removed.')
    window.dispatchEvent(new CustomEvent('projectx:projects-changed'))
  }

  return <aside className={`artwork-dock ${open ? 'open' : ''}`} aria-label="Project artwork">
    <button className="artwork-dock-toggle" type="button" onClick={() => { setProjects(readProjects()); setOpen((value) => !value) }}>
      <strong>ART</strong><span>ICON / COVER</span>
    </button>
    {open && <div className="artwork-panel">
      <header><div><small>PROJECT IDENTITY</small><strong>Artwork manager</strong></div><button type="button" onClick={() => setOpen(false)}>×</button></header>
      <p>{message}</p>
      <label>Project<select value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">Choose project…</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
      {selected?.coverUrl && <div className="artwork-preview" style={{ backgroundImage: `url(${selected.coverUrl})` }} />}
      <label className={`artwork-upload ${projectId ? '' : 'disabled'}`}>Upload artwork<input type="file" accept="image/*,.ico,.svg" disabled={!projectId} onChange={(event) => chooseFile(event.target.files?.[0])}/></label>
      <button type="button" disabled={!projectId || !selected?.coverUrl} onClick={removeArtwork}>Remove custom artwork</button>
      <small className="artwork-note">Automatic local-project artwork discovery is the next layer: project.X will rank likely icon/logo/banner/cover files during import, while this manual override always remains available.</small>
    </div>}
  </aside>
}
