import { useEffect, useState } from 'react'
import SupabaseSetup from './SupabaseSetup'
import { APP_VERSION } from './version'
import { isSupabaseConfigured, loadSession } from './services/supabase'
import { readSettings, saveSettings } from './services/settings'
import { getDesktopHost } from './services/desktop'
import type { AppSettings } from './services/settings'

type Tab = 'general' | 'cloud' | 'runtime' | 'data' | 'about'

function openUtility(category: 'projects' | 'cloud' | 'system', selector?: string) {
  window.dispatchEvent(new CustomEvent('projectx:open-utility', { detail: { category } }))
  if (selector) window.setTimeout(() => document.querySelector<HTMLButtonElement>(selector)?.click(), 80)
}

export default function SettingsPanel() {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('general')
  const [settings, setSettings] = useState<AppSettings>(readSettings)
  const [, refresh] = useState(0)

  useEffect(() => {
    const show = () => { setSettings(readSettings()); setOpen(true) }
    window.addEventListener('projectx:open-settings', show)
    return () => window.removeEventListener('projectx:open-settings', show)
  }, [])
  useEffect(() => {
    if (!open) return
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', close)
    return () => document.removeEventListener('keydown', close)
  }, [open])

  function update<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    const next = { ...settings, [key]: value }
    setSettings(next)
    saveSettings(next)
  }

  if (!open) return null
  return <div className="settings-backdrop" onMouseDown={() => setOpen(false)}>
    <section className="settings-workspace" role="dialog" aria-modal="true" aria-label="project.X settings" onMouseDown={(event) => event.stopPropagation()}>
      <header><div><small>PROJECT.X CONTROL</small><strong>Settings</strong></div><button type="button" onClick={() => setOpen(false)} aria-label="Close settings">x</button></header>
      <nav aria-label="Settings sections">{(['general','cloud','runtime','data','about'] as Tab[]).map((item) => <button key={item} className={tab === item ? 'active' : ''} type="button" onClick={() => setTab(item)}>{item}</button>)}</nav>
      <div className="settings-content">
        {tab === 'general' && <><div className="settings-heading"><small>APPLICATION</small><h2>Workspace behavior</h2></div>
          <label className="settings-toggle"><span><strong>Open preview after Run</strong><small>Launch the verified local URL in your default browser.</small></span><input type="checkbox" checked={settings.autoOpenPreview} onChange={(event) => update('autoOpenPreview', event.target.checked)} /></label>
          <label className="settings-toggle"><span><strong>Show launch splash</strong><small>Display project.X branding while the desktop UI initializes.</small></span><input type="checkbox" checked={settings.showLaunchSplash} onChange={(event) => update('showLaunchSplash', event.target.checked)} /></label>
          <label className="settings-toggle"><span><strong>Reduce motion</strong><small>Disable nonessential interface transitions and animation.</small></span><input type="checkbox" checked={settings.reduceMotion} onChange={(event) => update('reduceMotion', event.target.checked)} /></label>
        </>}
        {tab === 'cloud' && <><div className="settings-heading"><small>INTEGRATIONS</small><h2>Cloud and Companion</h2><p>{isSupabaseConfigured() ? loadSession() ? 'Supabase configured and signed in.' : 'Supabase configured. Sign in from Cloud.' : 'Cloud is not configured on this device.'}</p></div><SupabaseSetup onSaved={() => refresh((value) => value + 1)} /><button className="settings-command" type="button" onClick={() => { setOpen(false); openUtility('cloud', '.cloud-dock-toggle') }}>Open Cloud account</button></>}
        {tab === 'runtime' && <><div className="settings-heading"><small>LOCAL DEVELOPMENT</small><h2>Run environment</h2><p>project.X stops duplicate project servers before starting a new run and closes owned servers when the Windows app exits.</p></div><button className="settings-command" type="button" onClick={() => { setOpen(false); openUtility('system', '.runtime-dock-toggle') }}>Inspect runtimes</button><button className="settings-command" type="button" onClick={() => { setOpen(false); openUtility('projects', '.task-console-toggle') }}>Open task console</button></>}
        {tab === 'data' && <><div className="settings-heading"><small>PORTABILITY</small><h2>Workspace data</h2><p>Manual backup, restore, and personal-data cleanup are available without cloud access.</p></div><button className="settings-command" type="button" onClick={() => { setOpen(false); openUtility('system', '.data-backup-toggle') }}>Backup and restore</button><button className="settings-command" type="button" onClick={() => { setOpen(false); openUtility('system', '.beta-toggle') }}>Run diagnostics</button></>}
        {tab === 'about' && <><div className="settings-heading"><small>RELEASE</small><h2>project.X v{APP_VERSION}</h2><p>Windows application manager and Companion control surface.</p></div><div className="settings-about-grid"><span>Desktop host <b>{getDesktopHost() ? 'ONLINE' : 'WEB MODE'}</b></span><span>Supabase <b>{isSupabaseConfigured() ? 'CONFIGURED' : 'SETUP NEEDED'}</b></span><span>Session <b>{loadSession() ? 'SIGNED IN' : 'SIGNED OUT'}</b></span></div></>}
      </div>
    </section>
  </div>
}
