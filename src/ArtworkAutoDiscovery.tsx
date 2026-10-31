import { useEffect } from 'react'
import { getDesktopHost } from './services/desktop'

const PROJECTS_KEY = 'projectx.projects.v1'
const LOCAL_KEY = 'projectx.local.sources.v1'

type Project = {
  id: string; name?: string; description?: string; descriptionSource?: string
  detectedVersion?: string; coverUrl?: string; artworkSource?: string
}
type Source = { projectId: string; path?: string; kind?: string }

function readArray<T>(key: string): T[] {
  try { const value = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(value) ? value : [] }
  catch { return [] }
}

function placeholder(project: Project) {
  const hash = Array.from(project.id).reduce((acc, char) => ((acc * 31) ^ char.charCodeAt(0)) >>> 0, 2166136261)
  const variant = hash % 24
  const hues = [
    ['#ff3da9', '#6f40e9', '#2eddf4'],
    ['#34d9f2', '#3449b8', '#ee5eab'],
    ['#6fe7bc', '#159da8', '#7554ed'],
    ['#f9b66e', '#dd468a', '#7141c9'],
    ['#80a9ff', '#613bd2', '#21eff3'],
    ['#f66bb1', '#e25d4f', '#31dce5'],
  ][variant % 6]
  const motif = Math.floor(variant / 6)
  const [pink, violet, cyan] = hues
  const marks = motif === 0
    ? '<g opacity=".66" stroke="#d9faff" stroke-width="3" fill="none"><path d="M70 260H160V176H236V90H362M160 260V340H300V276H424M300 340H500"/><circle cx="160" cy="176" r="8" fill="#d9faff"/><circle cx="300" cy="276" r="8" fill="#d9faff"/></g>'
    : motif === 1
    ? '<g fill="none" stroke="#e9ffff" stroke-width="9" stroke-linejoin="round"><rect x="206" y="112" width="228" height="230" rx="45"/><path d="M320 112V72M256 342V385M382 342V385M206 248H162M434 248H478"/><rect x="247" y="185" width="45" height="20" rx="8" fill="#e9ffff"/><rect x="348" y="185" width="45" height="20" rx="8" fill="#e9ffff"/><path d="M265 275Q320 314 376 275"/></g>'
    : motif === 2
    ? '<g font-family="monospace" font-weight="bold" fill="#d8fff7"><text x="76" y="145" font-size="36">&gt; npm run dev</text><text x="76" y="210" font-size="30" opacity=".8">{ ready: true }</text><text x="76" y="275" font-size="30" opacity=".65">010101 1010</text><text x="76" y="335" font-size="38" opacity=".9">_</text></g>'
    : '<g fill="none" stroke="#e6fcff" stroke-width="6"><circle cx="320" cy="215" r="116"/><ellipse cx="320" cy="215" rx="244" ry="78" transform="rotate(-27 320 215)"/><circle cx="320" cy="215" r="53" fill="#ffffff" fill-opacity=".22"/><circle cx="465" cy="128" r="12" fill="#fff"/></g>'
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="440" viewBox="0 0 640 440"><defs><linearGradient id="a" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${pink}"/><stop offset=".56" stop-color="${violet}"/><stop offset="1" stop-color="${cyan}"/></linearGradient><radialGradient id="b"><stop stop-color="#1e2550"/><stop offset="1" stop-color="#050914"/></radialGradient></defs><rect width="640" height="440" rx="24" fill="url(#b)"/><path d="M0 390L245 0H350L90 440ZM430 0L640 330V440H582L360 0Z" fill="url(#a)" opacity=".22"/><g opacity=".18" stroke="url(#a)" stroke-width="2">${Array.from({length:12},(_,i)=>`<path d="M0 ${i*40}H640"/>`).join('')}</g><circle cx="320" cy="216" r="175" fill="url(#a)" opacity=".11"/>${marks}<path d="M0 438H640" stroke="url(#a)" stroke-width="5"/></svg>`
  return { coverUrl: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg), artworkSource: `built-in:${variant+1}` }
}

function mayReplaceCover(project: Project) {
  return !project.coverUrl || project.artworkSource?.startsWith('built-in:') ||
    (project.coverUrl.includes('opengraph.githubassets.com') && !project.artworkSource)
}

/** Scans only the project's previously authorized root. Never replaces user artwork. */
export default function ArtworkAutoDiscovery() {
  useEffect(() => {
    const desktop = getDesktopHost()
    let cancelled = false
    let running = false
    let retry = false
    const scan = async () => {
      if (cancelled) return
      if (running) { retry = true; return }
      running = true
      try {
        const projects = readArray<Project>(PROJECTS_KEY)
        const sources = readArray<Source>(LOCAL_KEY)
        for (const project of projects) {
          if (cancelled) break
          const source = sources.find(item => item.projectId === project.id && item.path)
          let candidate: {dataUrl?: string; relativePath: string} | undefined
          let version: string | undefined
          let description: string | undefined
          if (desktop && source?.path) {
            try {
              const summary = await desktop.inspectProject(source.path)
              version = summary.version
              description = summary.description
              if (mayReplaceCover(project)) {
                const artwork = await desktop.discoverProjectArtwork(source.path)
                candidate = artwork.find(item => Boolean(item.dataUrl))
              }
            } catch {
              // Missing/unavailable local sources do not block the workspace.
            }
          }
          if (cancelled) break
          const latest = readArray<Project>(PROJECTS_KEY)
          let changed = false
          const next = latest.map(item => {
            if (item.id !== project.id) return item
            const update: Project = { ...item }
            if (version && item.detectedVersion !== version) { update.detectedVersion = version; changed = true }
            if (description && !item.description?.trim()) {
              update.description = description
              update.descriptionSource = 'manifest'
              changed = true
            }
            if (mayReplaceCover(item)) {
              const cover = candidate?.dataUrl
                ? { coverUrl: candidate.dataUrl, artworkSource: candidate.relativePath }
                : (!item.coverUrl ? placeholder(item) : null)
              if (cover && (item.coverUrl !== cover.coverUrl || item.artworkSource !== cover.artworkSource)) {
                Object.assign(update, cover)
                changed = true
              }
            }
            return update
          })
          if (changed) {
            try {
              localStorage.setItem(PROJECTS_KEY, JSON.stringify(next))
              window.dispatchEvent(new CustomEvent('projectx:projects-changed'))
            } catch {
              // A full browser storage quota must not block local project access.
            }
          }
        }
      } finally {
        running = false
        if (retry && !cancelled) { retry = false; void scan() }
      }
    }
    const onChanged = () => window.setTimeout(() => void scan(), 400)
    void scan()
    window.addEventListener('projectx:projects-changed', onChanged)
    return () => { cancelled = true; window.removeEventListener('projectx:projects-changed', onChanged) }
  }, [])
  return null
}
