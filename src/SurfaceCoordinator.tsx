import { useEffect } from 'react'

const ROOTS = [
  '.cloud-dock',
  '.local-dock',
  '.artwork-dock',
  '.task-console',
  '.data-backup-dock',
  '.runtime-dock',
  '.desktop-actions-dock',
  '.intel-dock',
  '.analytics-dock',
  '.deploy-dock',
  '.beta-dock',
]

function closeRoot(root: Element) {
  if (!root.classList.contains('open') || root.hasAttribute('data-projectx-closing')) return
  const toggle = root.querySelector<HTMLButtonElement>('button[class*="toggle"]') || root.querySelector<HTMLButtonElement>(':scope > button')
  if (!toggle) return
  root.setAttribute('data-projectx-closing', '')
  toggle.click()
  window.setTimeout(() => root.removeAttribute('data-projectx-closing'), 0)
}

export default function SurfaceCoordinator() {
  useEffect(() => {
    const closeOutsideTarget = (event: Event) => {
      const target = event.target instanceof Element ? event.target : null
      if (!target) return
      if (target.closest('[data-projectx-utility-panel="true"]')) return
      const roots = ROOTS.flatMap((selector) => Array.from(document.querySelectorAll(selector)))
      const clickedRoot = roots.find((root) => root.contains(target))

      roots.forEach((root) => {
        if (!root.classList.contains('open') || root === clickedRoot) return
        closeRoot(root)
      })

      if (!clickedRoot) roots.forEach(closeRoot)
    }

    document.addEventListener('pointerdown', closeOutsideTarget, true)
    document.addEventListener('click', closeOutsideTarget)
    const onEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') ROOTS.flatMap((selector) => Array.from(document.querySelectorAll(selector))).forEach(closeRoot) }
    document.addEventListener('keydown', onEscape)
    const modalObserver = new MutationObserver(() => {
      if (document.querySelector('.project-launcher-backdrop,.v2-detail-backdrop,.github-discovery-backdrop,.modal-backdrop,.companion-package-backdrop')) {
        ROOTS.flatMap((selector) => Array.from(document.querySelectorAll(selector))).forEach(closeRoot)
      }
    })
    modalObserver.observe(document.body, { childList: true, subtree: true })
    return () => { document.removeEventListener('pointerdown', closeOutsideTarget, true); document.removeEventListener('click', closeOutsideTarget); document.removeEventListener('keydown', onEscape); modalObserver.disconnect() }
  }, [])

  return null
}
