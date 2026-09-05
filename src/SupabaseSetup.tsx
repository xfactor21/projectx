import { useState } from 'react'
import { clearSupabaseConfig, getSupabaseConfig, saveSupabaseConfig, testSupabaseConfig } from './services/supabase'

export default function SupabaseSetup({ onSaved }: { onSaved?: () => void }) {
  const initial = getSupabaseConfig()
  const [url, setUrl] = useState(initial.url)
  const [key, setKey] = useState(initial.publishableKey)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(initial.source === 'self-hosted' ? 'Self-hosted configuration loaded on this device.' : 'Enter your own Supabase project only when operating a self-hosted deployment.')

  async function verifyAndSave() {
    setBusy(true)
    try {
      await testSupabaseConfig(url, key)
      saveSupabaseConfig(url, key)
      setMessage('Connection verified and saved on this device. Sign in to continue.')
      onSaved?.()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to verify Supabase.') }
    finally { setBusy(false) }
  }

  function clear() {
    clearSupabaseConfig(); setUrl(''); setKey(''); setMessage('Supabase configuration cleared from this device.'); onSaved?.()
  }

  return <section className="supabase-setup">
    <div><small>ADVANCED / SELF-HOSTING</small><strong>Custom Supabase backend</strong></div>
    <p>{message}</p>
    <label><span>Project URL</span><input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://your-project.supabase.co" autoComplete="url" /></label>
    <label><span>Publishable key</span><input type="password" value={key} onChange={(event) => setKey(event.target.value)} placeholder="sb_publishable_..." autoComplete="off" /></label>
    <div className="supabase-setup-actions"><button type="button" disabled={busy || !url.trim() || !key.trim()} onClick={() => void verifyAndSave()}>{busy ? 'Testing...' : 'Test and save'}</button><button type="button" disabled={busy || (!url && !key)} onClick={clear}>Clear</button></div>
    <small className="supabase-setup-note">This is not required for normal project.X accounts. Only browser-safe publishable keys are accepted; secret and service-role keys are rejected.</small>
  </section>
}
