type ThemeItem = { id: string; label: string; sub: string }

type Props = {
  items: ThemeItem[]
  value: string
  open: boolean
  onClose(): void
  onChange(id: string): void
}

export default function ThemeSwitcher({ items, value, open, onClose, onChange }: Props) {
  if (!open) return null
  return <div className="theme-picker-backdrop" onMouseDown={onClose}>
    <section className="theme-picker-v303" role="dialog" aria-modal="true" aria-label="Beta project environments" onMouseDown={(event) => event.stopPropagation()}>
      <header>
        <div><span>ENVIRONMENTS <b>BETA</b></span><h2>Choose how projects are presented.</h2><p>These visual environments are experimental. They change presentation only and may still need tuning.</p></div>
        <button type="button" onClick={onClose} aria-label="Close environments">×</button>
      </header>
      <div className="theme-picker-grid">
        {items.map((item, index) => <button
          key={item.id}
          type="button"
          className={value === item.id ? 'active' : ''}
          aria-pressed={value === item.id}
          onClick={() => { onChange(item.id); onClose() }}
        >
          <i aria-hidden="true">{String(index + 1).padStart(2, '0')}</i>
          <span><strong>{item.label}</strong><small>{item.sub}</small></span>
          {value === item.id && <em>ACTIVE</em>}
        </button>)}
      </div>
      <footer><span>BETA</span><p>Command is the recommended environment while the experimental environments continue to be refined.</p></footer>
    </section>
  </div>
}
