import { useEffect } from 'react'

const ROOTS = [
  '.cloud-dock',
  '.local-dock',
  '.artwork-dock',
  '.task-console',
  '.runtime-dock',
  '.desktop-actions-dock',
  '.intel-dock',
  '.analytics-dock',
  '.deploy-dock',
  '.beta-dock',
]

function closeRoot(root: Element) {
  if (!root.classList.contains('open')) return
  const toggle = root.querySelector<HTMLButtonElement>('button[class*="toggle"]') || root.querySelector<HTMLButtonElement>(':scope > button')
  toggle?.click()
}

export default function SurfaceCoordinator() {
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null
      if (!target) return
      if (target.closest('.project-launcher-backdrop,.v2-detail-backdrop,.github-discovery-backdrop')) return

      const roots = ROOTS.flatMap((selector) => Array.from(document.querySelectorAll(selector)))
      const clickedRoot = roots.find((root) => root.contains(target))

      roots.forEach((root) => {
        if (!root.classList.contains('open') || root === clickedRoot) return
        closeRoot(root)
      })

      if (!clickedRoot) roots.forEach(closeRoot)
    }

    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [])

  return null
}
