import { useEffect, useRef } from 'react'

type ThemeItem = { id: string; label: string; sub: string }
const themeSymbols: Record<string,string> = { Grid:'▦', Storefront:'⌂', Vending:'▤', Comic:'✦', '3D':'⬡', XFactor:'✕', PlanetX:'◎' }

type Props = {
  items: ThemeItem[]
  value: string
  open: boolean
  onClose(): void
  onChange(id: string): void
}

export default function ThemeSwitcher({ items, value, open, onClose, onChange }: Props) {
  const dialogRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key !== 'Tab' || !dialogRef.current) return
      const controls = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')).filter((element) => !element.hasAttribute('disabled'))
      const first = controls[0]
      const last = controls.at(-1)
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    const focusFrame = window.requestAnimationFrame(() => dialogRef.current?.focus())
    return () => {
      window.cancelAnimationFrame(focusFrame)
      window.removeEventListener('keydown', onKeyDown)
      previous?.focus()
    }
  }, [open, onClose])
  if (!open) return null
  return <div className="theme-picker-backdrop" onMouseDown={onClose}>
    <section ref={dialogRef} className="theme-picker-v303" role="dialog" aria-modal="true" aria-labelledby="theme-picker-title" tabIndex={-1} onMouseDown={(event) => event.stopPropagation()}>
      <header>
        <div><span>ENVIRONMENTS <b>BETA</b></span><h2 id="theme-picker-title">Choose how your projects live.</h2><p>Each environment is a complete presentation system. Your project data and actions stay consistent.</p></div>
        <button type="button" onClick={onClose} aria-label="Close environments">×</button>
      </header>
      <div className="theme-picker-grid">
        {items.map((item, index) => <button
          key={item.id}
          type="button"
          className={value === item.id ? 'active' : ''}
          data-theme-preview={item.id.toLowerCase()}
          aria-pressed={value === item.id}
          onClick={() => { onChange(item.id); onClose() }}
        >
          <span className="theme-picker-preview" aria-hidden="true"><i>{themeSymbols[item.id] || String(index + 1).padStart(2, '0')}</i><b/><b/><b/></span>
          <span><strong>{item.label}</strong><small>{item.sub}</small></span>
          {value === item.id && <em>ACTIVE</em>}
        </button>)}
      </div>
      <footer><span>BETA</span><p>Command remains the stable workspace. Environments stay Beta until their visual and hardware acceptance passes are complete.</p></footer>
    </section>
  </div>
}
