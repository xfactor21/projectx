import { useEffect, useState } from 'react'

type ThemeMode = 'Grid' | 'Storefront' | 'Vending' | 'Comic' | '3D' | 'XFactor' | 'PlanetX'

function normalizeTheme(value: string | null): ThemeMode {
  if (value === 'Neon') return 'XFactor'
  if (value === 'Orbit') return 'PlanetX'
  return (value || 'Grid') as ThemeMode
}

function readTheme(): ThemeMode {
  return normalizeTheme(localStorage.getItem('projectx.view.v1'))
}

export default function ThemeEnvironmentLayer() {
  const [theme, setTheme] = useState<ThemeMode>(readTheme)

  useEffect(() => {
    const onTheme = (event: Event) => setTheme(normalizeTheme((event as CustomEvent<string>).detail))
    window.addEventListener('projectx:theme-changed', onTheme)
    return () => window.removeEventListener('projectx:theme-changed', onTheme)
  }, [])

  if (theme === 'Storefront') return <div className="theme-environment env-storefront" aria-hidden="true">
    <div className="store-sky"/><div className="store-haze"/><div className="store-roofline"><i/><i/><i/><i/></div>
    <div className="store-sign">PROJECT.X DISTRICT</div><div className="store-window-glow left"/><div className="store-window-glow right"/>
    <div className="store-lamp lamp-left"/><div className="store-lamp lamp-right"/><div className="xfactor-door-mark"/><div className="store-sidewalk"/>
    <div className="street-car car-one"><i/><i/></div><div className="street-car car-two"><i/><i/></div>
    <div className="street-bike"><i/><b/></div>
    <div className="pedestrian ped-one"><i/></div><div className="pedestrian ped-two"><i/></div><div className="pedestrian ped-three"><i/></div>
    <div className="store-awning"/><div className="store-open-sign">OPEN // BUILDS</div>
  </div>

  if (theme === 'Vending') return <div className="theme-environment env-vending" aria-hidden="true">
    <div className="machine-shell"/><div className="machine-marquee">PROJECT.X // BUILD DISPENSER</div><div className="machine-left-rail"/><div className="machine-right-rail"/>
    <div className="machine-keypad">{['1','2','3','4','5','6','7','8','9','X','0','↵'].map((key) => <i key={key}>{key}</i>)}</div>
    <div className="machine-slot"><span>INSERT BUILD</span></div><div className="machine-status"><i/>READY</div>
    <div className="vend-row one"><i/><i/><i/><i/></div><div className="vend-row two"><i/><i/><i/><i/></div>
    <div className="vend-coin">●</div><div className="vend-scan"/>
  </div>

  if (theme === 'Comic') return <div className="theme-environment env-comic" aria-hidden="true">
    <div className="comic-masthead"><b>PROJECT.X</b><span>ISSUE // BUILD UNIVERSE</span></div><div className="comic-page-corner"/>
    <div className="comic-sfx sfx-one">BUILD!</div><div className="comic-sfx sfx-two">SHIP!</div><div className="comic-caption">Meanwhile, inside the project universe…</div>
    <div className="comic-prop one"><b>xFactor</b><span/><small>VS. THE NULL</small></div><div className="comic-prop two"><b>xFactor</b><span/><small>GLITCH CITY #X</small></div>
    <div className="comic-bubble bubble-one">IT COMPILES!</div><div className="comic-bubble bubble-two">SHIP IT →</div><div className="comic-speedlines"/>
  </div>

  if (theme === '3D') return <div className="theme-environment env-gallery" aria-hidden="true">
    <div className="gallery-ceiling"/><div className="gallery-beam beam-one"/><div className="gallery-beam beam-two"/><div className="gallery-beam beam-three"/>
    <div className="gallery-horizon"/><div className="gallery-plaque">PROJECT.X / DIGITAL EXHIBITION</div><div className="gallery-room-number">ROOM 05</div>
    <div className="gallery-visitor one"><i/></div><div className="gallery-visitor two"><i/></div><div className="gallery-orb one"/><div className="gallery-orb two"/>
  </div>

  if (theme === 'XFactor') return <div className="theme-environment env-xfactor" aria-hidden="true">
    <div className="xfactor-sky"/><div className="xfactor-grid"/><div className="xfactor-rain"/>
    <div className="xfactor-building left"><i/><i/><i/></div><div className="xfactor-building right"><i/><i/><i/><i/></div>
    <div className="xfactor-neon-x">X</div><div className="xfactor-sign">xFactor // BUILD LOUD</div>
    <div className="xfactor-graffiti one">X</div><div className="xfactor-graffiti two">xF</div><div className="xfactor-graffiti three">// X //</div>
    <div className="xfactor-sticker">NO QUIET BUILDS</div><div className="xfactor-tape one"/><div className="xfactor-tape two"/>
    <div className="xfactor-walker"><i/></div><div className="xfactor-skater"><i/><b/></div><div className="xfactor-flicker">X // LIVE</div>
  </div>

  if (theme === 'PlanetX') return <div className="theme-environment env-planetx" aria-hidden="true">
    <div className="planetx-stars"/><div className="planetx-aurora"/>
    <div className="planetx-ring outer"/><div className="planetx-ring middle"/><div className="planetx-ring inner"/>
    <div className="planetx-world"><i/><span>planet.X</span></div><div className="planetx-moon"/>
    <div className="planetx-axis"/><div className="planetx-constellation"><i/><i/><i/><i/><i/></div>
    <div className="planetx-env-label">PROJECT UNIVERSE // ORBITAL COMMAND</div>
    <div className="planetx-satellite"><i/><i/></div><div className="planetx-comet one"/><div className="planetx-comet two"/>
  </div>

  return <div className="theme-environment env-command" aria-hidden="true">
    <div className="command-ambient left"/><div className="command-ambient right"/><div className="command-beacon one"/><div className="command-beacon two"/><div className="command-label">PROJECT.X // COMMAND ENVIRONMENT</div>
    <div className="command-scan"/><div className="command-data-stream one">0101 1100 X 0011</div><div className="command-data-stream two">BUILD / RUN / SHIP</div><div className="command-node one"/><div className="command-node two"/><div className="command-node three"/>
  </div>
}
