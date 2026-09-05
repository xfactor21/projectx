import { useEffect, useState } from 'react'
import splash from './assets/brand/launch-splash.png'
import { readSettings } from './services/settings'

export default function AppSplash() {
  const [visible, setVisible] = useState(() => readSettings().showLaunchSplash)
  const [leaving, setLeaving] = useState(false)
  useEffect(() => {
    if (!visible) return
    const fade = window.setTimeout(() => setLeaving(true), 1100)
    const remove = window.setTimeout(() => setVisible(false), 1450)
    return () => { window.clearTimeout(fade); window.clearTimeout(remove) }
  }, [visible])
  if (!visible) return null
  return <div className={`app-splash ${leaving ? 'leaving' : ''}`} aria-label="project.X is loading"><img src={splash} alt="project.X"/><span>INITIALIZING WORKSPACE</span></div>
}
