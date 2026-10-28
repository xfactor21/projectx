type ThemeItem = { id: string; label: string; sub: string }

type Props = {
  items: ThemeItem[]
  value: string
  onChange(id: string): void
}

export default function ThemeSwitcher({ items, value, onChange }: Props) {
  return <section className="theme-switcher-v301" aria-label="Workspace environments">
    <div className="theme-switcher-v301__label">
      <span>ENVIRONMENTS</span>
      <strong>{items.length} AVAILABLE</strong>
    </div>
    <div className="theme-switcher-v301__grid">
      {items.map((item, index) => <button
        key={item.id}
        type="button"
        className={value === item.id ? 'active' : ''}
        aria-pressed={value === item.id}
        title={item.sub}
        onClick={() => onChange(item.id)}
      >
        <i aria-hidden="true">{String(index + 1).padStart(2, '0')}</i>
        <span><strong>{item.label}</strong><small>{item.sub}</small></span>
      </button>)}
    </div>
  </section>
}
