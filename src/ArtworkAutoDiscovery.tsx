import { useEffect } from 'react'
import { getDesktopHost } from './services/desktop'

const PROJECTS_KEY = 'projectx.projects.v1'
const LOCAL_KEY = 'projectx.local.sources.v1'

type Project = { id: string; name?: string; coverUrl?: string; artworkSource?: string }
type Source = { projectId: string; path?: string; kind?: string }

function readArray<T>(key: string): T[] {
  try { const value = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(value) ? value : [] }
  catch { return [] }
}

export default function ArtworkAutoDiscovery() {
  useEffect(() => {
    const desktop = getDesktopHost()
    if (!desktop) return
    let cancelled = false
    let running = false

    const scan = async () => {
      if (running || cancelled) return
      running = true
      try {
        const projects = readArray<Project>(PROJECTS_KEY)
        const sources = readArray<Source>(LOCAL_KEY)
        for (const project of projects) {
          if (cancelled || project.coverUrl) continue
          const source = sources.find((item) => item.projectId === project.id && item.path)
          if (!source?.path) continue
          try {
            const candidates = await desktop.discoverProjectArtwork(source.path)
            const best = candidates.find((candidate) => candidate.dataUrl)
            if (!best?.dataUrl) continue
            const latest = readArray<Project>(PROJECTS_KEY)
            const next = latest.map((item) => item.id === project.id && !item.coverUrl ? { ...item, coverUrl: best.dataUrl, artworkSource: best.relativePath } : item)
            localStorage.setItem(PROJECTS_KEY, JSON.stringify(next))
            window.dispatchEvent(new CustomEvent('projectx:projects-changed'))
          } catch {
            // Artwork is optional. A failed scan must never block the project lifecycle.
          }
        }
      } finally { running = false }
    }

    const onChanged = () => window.setTimeout(() => void scan(), 250)
    void scan()
    window.addEventListener('projectx:projects-changed', onChanged)
    return () => { cancelled = true; window.removeEventListener('projectx:projects-changed', onChanged) }
  }, [])

  return null
}
