import { useEffect, useState } from 'react'
import SupabaseSetup from './SupabaseSetup'
import { APP_VERSION } from './version'
import { getSupabaseConfig, isSelfHostingEnabled, isSupabaseConfigured, loadSession, setSelfHostingEnabled } from './services/supabase'
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
  const cloudConfig = getSupabaseConfig()

  useEffect(() => {
    const show = (event: Event) => {
      const requestedTab = (event as CustomEvent<{ tab?: Tab }>).detail?.tab
      setSettings(readSettings())
      if (requestedTab) setTab(requestedTab)
      setOpen(true)
    }
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
          <label className="settings-toggle"><span><strong>Open preview after Run</strong><small>Load the verified local URL inside project.X Preview.</small></span><input type="checkbox" checked={settings.autoOpenPreview} onChange={(event) => update('autoOpenPreview', event.target.checked)} /></label>
          <label className="settings-toggle"><span><strong>Show launch splash</strong><small>Display project.X branding while the desktop UI initializes.</small></span><input type="checkbox" checked={settings.showLaunchSplash} onChange={(event) => update('showLaunchSplash', event.target.checked)} /></label>
          <label className="settings-toggle"><span><strong>Reduce motion</strong><small>Disable nonessential interface transitions and animation.</small></span><input type="checkbox" checked={settings.reduceMotion} onChange={(event) => update('reduceMotion', event.target.checked)} /></label>
        </>}
        {tab === 'cloud' && <><div className="settings-heading"><small>PROJECT.X ACCOUNT</small><h2>Cloud and Companion</h2><p>{cloudConfig.source === 'managed' ? loadSession() ? 'Connected to project.X Cloud and signed in.' : 'project.X Cloud is ready. Sign in to sync your workspace.' : cloudConfig.source === 'self-hosted' ? 'Using a self-hosted cloud connection on this device.' : 'Cloud service is unavailable in this development build.'}</p></div>
          <div className={`managed-cloud-status ${isSupabaseConfigured() ? 'ready' : ''}`}><i/><span><strong>{cloudConfig.source === 'managed' ? 'Managed project.X Cloud' : cloudConfig.source === 'self-hosted' ? 'Self-hosted cloud' : 'Cloud unavailable'}</strong><small>{cloudConfig.source === 'managed' ? 'No backend setup is required.' : cloudConfig.source === 'self-hosted' ? 'This device is using a custom backend.' : 'Production builds require managed cloud configuration.'}</small></span></div>
          <button className="settings-command" type="button" disabled={!isSupabaseConfigured()} onClick={() => { setOpen(false); openUtility('cloud', '.cloud-dock-toggle') }}>Open account and cloud sync</button>
          <details className="self-hosting-settings" open={isSelfHostingEnabled()}><summary>Advanced self-hosting</summary><p>Use a custom Supabase project instead of the managed project.X service.</p><label className="settings-toggle"><span><strong>Use a self-hosted backend</strong><small>For administrators and source deployments only.</small></span><input type="checkbox" checked={isSelfHostingEnabled()} onChange={(event) => { setSelfHostingEnabled(event.target.checked); refresh((value) => value + 1) }} /></label>{isSelfHostingEnabled() && <SupabaseSetup onSaved={() => refresh((value) => value + 1)} />}</details>
        </>}
        {tab === 'runtime' && <><div className="settings-heading"><small>LOCAL DEVELOPMENT</small><h2>Run environment</h2><p>project.X stops duplicate project servers before starting a new run and closes owned servers when the Windows app exits.</p></div><button className="settings-command" type="button" onClick={() => { setOpen(false); openUtility('system', '.runtime-dock-toggle') }}>Inspect runtimes</button><button className="settings-command" type="button" onClick={() => { setOpen(false); openUtility('projects', '.task-console-toggle') }}>Open task console</button></>}
        {tab === 'data' && <><div className="settings-heading"><small>PORTABILITY</small><h2>Workspace data</h2><p>Manual backup, restore, and personal-data cleanup are available without cloud access.</p></div><button className="settings-command" type="button" onClick={() => { setOpen(false); openUtility('system', '.data-backup-toggle') }}>Backup and restore</button><button className="settings-command" type="button" onClick={() => { setOpen(false); openUtility('system', '.beta-toggle') }}>Run diagnostics</button></>}
        {tab === 'about' && <><div className="settings-heading"><small>RELEASE</small><h2>project.X v{APP_VERSION}</h2><p>Windows application manager and Companion control surface.</p></div><div className="settings-about-grid"><span>Desktop host <b>{getDesktopHost() ? 'ONLINE' : 'WEB MODE'}</b></span><span>Cloud <b>{isSupabaseConfigured() ? cloudConfig.source === 'managed' ? 'MANAGED' : 'SELF-HOSTED' : 'UNAVAILABLE'}</b></span><span>Session <b>{loadSession() ? 'SIGNED IN' : 'SIGNED OUT'}</b></span></div></>}
      </div>
    </section>
  </div>
}
