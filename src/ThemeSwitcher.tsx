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
  if (!open) return null
  return <div className="theme-picker-backdrop" onMouseDown={onClose}>
    <section className="theme-picker-v303" role="dialog" aria-modal="true" aria-label="Choose project themes" onMouseDown={(event) => event.stopPropagation()}>
      <header>
        <div><span>THEMES <b>BETA</b></span><h2>Find your workspace vibe.</h2><p>Switch presentation without changing your project data.</p></div>
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
          <i aria-hidden="true">{themeSymbols[item.id] || String(index + 1).padStart(2, '0')}</i>
          <span><strong>{item.label}</strong><small>{item.sub}</small></span>
          {value === item.id && <em>ACTIVE</em>}
        </button>)}
      </div>
      <footer><span>BETA</span><p>Command is the recommended environment while the experimental environments continue to be refined.</p></footer>
    </section>
  </div>
}
