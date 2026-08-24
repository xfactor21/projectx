import { useEffect, useState } from 'react'

type ThemeMode = 'Grid' | 'Storefront' | 'Vending' | 'Comic' | '3D'

function readTheme(): ThemeMode {
  return (localStorage.getItem('projectx.view.v1') || 'Grid') as ThemeMode
}

export default function ThemeEnvironmentLayer() {
  const [theme, setTheme] = useState<ThemeMode>(readTheme)

  useEffect(() => {
    const onTheme = (event: Event) => setTheme((event as CustomEvent<ThemeMode>).detail)
    window.addEventListener('projectx:theme-changed', onTheme)
    return () => window.removeEventListener('projectx:theme-changed', onTheme)
  }, [])

  if (theme === 'Storefront') return <div className="theme-environment env-storefront" aria-hidden="true">
    <div className="store-sky"/><div className="store-brick-wall"/><div className="store-awning"><i/><i/><i/><i/><i/><i/></div>
    <div className="store-sign">PROJECT.X SHOWROOM</div><div className="store-window-glow left"/><div className="store-window-glow right"/>
    <div className="store-lamp lamp-left"/><div className="store-lamp lamp-right"/><div className="xfactor-door-mark"/><div className="store-sidewalk"/>
  </div>

  if (theme === 'Vending') return <div className="theme-environment env-vending" aria-hidden="true">
    <div className="machine-shell"/><div className="machine-marquee">PROJECT.X // BUILD DISPENSER</div><div className="machine-left-rail"/><div className="machine-right-rail"/>
    <div className="machine-keypad">{['1','2','3','4','5','6','7','8','9','X','0','↵'].map((key) => <i key={key}>{key}</i>)}</div>
    <div className="machine-slot"><span>INSERT BUILD</span></div><div className="machine-status"><i/>READY</div>
  </div>

  if (theme === 'Comic') return <div className="theme-environment env-comic" aria-hidden="true">
    <div className="comic-masthead"><b>PROJECT.X</b><span>ISSUE // BUILD UNIVERSE</span></div><div className="comic-page-corner"/>
    <div className="comic-sfx sfx-one">BUILD!</div><div className="comic-sfx sfx-two">SHIP!</div><div className="comic-caption">Meanwhile, inside the project universe…</div>
    <div className="comic-prop one"><b>xFactor</b><span/><small>VS. THE NULL</small></div><div className="comic-prop two"><b>xFactor</b><span/><small>GLITCH CITY #X</small></div>
  </div>

  if (theme === '3D') return <div className="theme-environment env-gallery" aria-hidden="true">
    <div className="gallery-ceiling"/><div className="gallery-beam beam-one"/><div className="gallery-beam beam-two"/><div className="gallery-beam beam-three"/>
    <div className="gallery-horizon"/><div className="gallery-plaque">PROJECT.X / DIGITAL EXHIBITION</div><div className="gallery-room-number">ROOM 05</div>
  </div>

  return <div className="theme-environment env-command" aria-hidden="true"><div className="command-backdrop-grid"/><div className="command-scan"/><div className="command-label">PROJECT.X // COMMAND ENVIRONMENT</div></div>
}
