import { useEffect, useMemo, useRef, useState } from 'react'
import AddProjectLauncher from './AddProjectLauncher'
import ArtworkDock from './ArtworkDock'
import BetaDiagnosticsDock from './BetaDiagnosticsDock'
import CloudSyncDock from './CloudSyncDock'
import DataBackupDock from './DataBackupDock'
import DeployDock from './DeployDock'
import DeploymentAnalyticsDock from './DeploymentAnalyticsDock'
import DesktopActionsDock from './DesktopActionsDock'
import LocalProjectDock from './LocalProjectDock'
import ProjectIntelDock from './ProjectIntelDock'
import RuntimeDock from './RuntimeDock'
import TaskConsole from './TaskConsole'
import ThemeSensoryLayer from './ThemeSensoryLayer'
import fabX from './assets/brand/fab-x.png'
import { readSettings, saveSettings } from './services/settings'
import type { UtilityCategory } from './services/settings'

const categoryCopy: Record<UtilityCategory, { label: string; description: string }> = {
  projects: { label: 'Projects', description: 'Import, run, artwork and Windows actions' },
  cloud: { label: 'Cloud', description: 'Supabase, deployments and analytics' },
  system: { label: 'System', description: 'Backup, runtimes, diagnostics and sound' },
}

const FAB_SIZE = 86

function defaultPosition() {
  const narrow = window.innerWidth <= 900
  return {
    x: narrow ? 14 : 250 - FAB_SIZE / 2,
    y: Math.max(14, window.innerHeight - FAB_SIZE - (narrow ? 24 : 142)),
  }
}

function clampPosition(position: { x: number; y: number }) {
  return {
    x: Math.min(Math.max(8, position.x), Math.max(8, window.innerWidth - FAB_SIZE - 8)),
    y: Math.min(Math.max(8, position.y), Math.max(8, window.innerHeight - FAB_SIZE - 8)),
  }
}

export default function UtilityHub() {
  const [open, setOpen] = useState(false)
  const [category, setCategory] = useState<UtilityCategory>(() => readSettings().utilityCategory)
  const [position, setPosition] = useState(() => clampPosition(readSettings().utilityPosition || defaultPosition()))
  const [cloudOpenRequest, setCloudOpenRequest] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const drag = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number; moved: boolean } | null>(null)
  const suppressClick = useRef(false)

  const menuStyle = useMemo(() => {
    const width = Math.min(860, Math.max(280, window.innerWidth - 24))
    const rightSide = position.x + FAB_SIZE + 12
    const left = rightSide + width <= window.innerWidth - 12
      ? rightSide
      : Math.max(12, Math.min(position.x - width - 12, window.innerWidth - width - 12))
    const estimatedHeight = window.innerWidth <= 900 ? 430 : 320
    const top = Math.max(12, Math.min(position.y + FAB_SIZE - estimatedHeight, window.innerHeight - estimatedHeight - 12))
    return { position: 'fixed' as const, left, right: 'auto', top, bottom: 'auto', width }
  }, [position])

  useEffect(() => {
    const show = (event: Event) => {
      const detail = (event as CustomEvent<{ category?: UtilityCategory; openCloud?: boolean }>).detail
      const requested = detail?.category
      if (requested && categoryCopy[requested]) setCategory(requested)
      if (requested === 'cloud' && detail?.openCloud) setCloudOpenRequest((value) => value + 1)
      setOpen(true)
    }
    window.addEventListener('projectx:open-utility', show)
    return () => window.removeEventListener('projectx:open-utility', show)
  }, [])
  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => {
      const target = event.target
      const activePanel = document.querySelector('[data-projectx-utility-panel="true"]')
      const modal = target instanceof Element ? target.closest('.project-launcher-backdrop,.github-discovery-backdrop,.modal-backdrop') : null
      if (target instanceof Node && !root.current?.contains(target) && !activePanel?.contains(target) && !modal) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])
  useEffect(() => {
    const resize = () => setPosition((current) => clampPosition(current))
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])

  function select(next: UtilityCategory) {
    setCategory(next)
    const settings = readSettings()
    saveSettings({ ...settings, utilityCategory: next })
  }

  function startDrag(event: React.PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y,
      moved: false,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function moveDrag(event: React.PointerEvent<HTMLButtonElement>) {
    const current = drag.current
    if (!current || current.pointerId !== event.pointerId) return
    const dx = event.clientX - current.startX
    const dy = event.clientY - current.startY
    if (Math.hypot(dx, dy) > 4) current.moved = true
    if (current.moved) setPosition(clampPosition({ x: current.originX + dx, y: current.originY + dy }))
  }

  function finishDrag(event: React.PointerEvent<HTMLButtonElement>) {
    const current = drag.current
    if (!current || current.pointerId !== event.pointerId) return
    suppressClick.current = current.moved
    drag.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    if (current.moved) {
      const finalPosition = clampPosition({
        x: current.originX + event.clientX - current.startX,
        y: current.originY + event.clientY - current.startY,
      })
      setPosition(finalPosition)
      const settings = readSettings()
      saveSettings({ ...settings, utilityPosition: finalPosition })
    }
  }

  function toggle() {
    if (suppressClick.current) {
      suppressClick.current = false
      return
    }
    setOpen((value) => !value)
  }

  return <div ref={root} className={`utility-hub ${open ? 'open' : ''}`} style={{ left: position.x, top: position.y, right: 'auto', bottom: 'auto' }}>
    <button className="utility-fab" type="button" aria-expanded={open} aria-label="Open project.X controls. Drag to reposition." title="Controls - drag to reposition" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={finishDrag} onPointerCancel={finishDrag} onClick={toggle}><img src={fabX} alt="" draggable={false}/><strong>Controls</strong></button>
    {open && <section className="utility-menu" style={menuStyle} aria-label="Project utilities">
      <header><div><small>CONTROL CENTER</small><strong>{categoryCopy[category].label}</strong><span>{categoryCopy[category].description}</span></div><button type="button" onClick={() => window.dispatchEvent(new CustomEvent('projectx:open-settings'))}>Settings</button></header>
      <div className="utility-menu-body">
        <nav>{(Object.keys(categoryCopy) as UtilityCategory[]).map((item) => <button key={item} className={category === item ? 'active' : ''} type="button" onClick={() => select(item)}><strong>{categoryCopy[item].label}</strong><span>{categoryCopy[item].description}</span></button>)}</nav>
        <div className="utility-actions">
          {category === 'projects' && <><AddProjectLauncher/><LocalProjectDock/><ArtworkDock/><TaskConsole/><DesktopActionsDock/></>}
          {category === 'cloud' && <><CloudSyncDock openRequest={cloudOpenRequest}/><DeploymentAnalyticsDock/><DeployDock/></>}
          {category === 'system' && <><ThemeSensoryLayer/><DataBackupDock/><RuntimeDock/><ProjectIntelDock/><BetaDiagnosticsDock/></>}
        </div>
      </div>
    </section>}
  </div>
}
