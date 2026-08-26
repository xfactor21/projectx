import { useRef, useState } from 'react'
import { getDesktopHost } from './services/desktop'
import { clearProjectXPersonalData, createWorkspaceBackup, parseWorkspaceBackup, restoreWorkspaceBackup } from './services/workspaceBackup'

function backupName() {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-')
  return `projectX-workspace-${stamp}.json`
}

function downloadBackup(content: string, name: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function DataBackupDock() {
  const desktop = getDesktopHost()
  const input = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('Save or restore this workspace without cloud access.')
  const [backupCreated, setBackupCreated] = useState(false)

  async function exportBackup() {
    setBusy(true)
    try {
      const content = JSON.stringify(createWorkspaceBackup(), null, 2)
      const name = backupName()
      if (desktop) {
        const path = await desktop.saveWorkspaceBackup(content, name)
        if (!path) return setMessage('Backup canceled. No file was written.')
        setMessage(`Backup saved: ${path}`)
      } else {
        downloadBackup(content, name)
        setMessage(`Backup downloaded: ${name}`)
      }
      setBackupCreated(true)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to create workspace backup.') }
    finally { setBusy(false) }
  }

  function applyRestore(content: string, source: string) {
    const backup = parseWorkspaceBackup(content)
    if (!window.confirm(`Replace this workspace with ${backup.data.projects.length} projects from ${source}? Project folders on disk will not be changed.`)) return
    restoreWorkspaceBackup(backup)
    setMessage(`Restored ${backup.data.projects.length} projects and ${backup.data.localSources.length} local links. Reloading...`)
    window.setTimeout(() => window.location.reload(), 500)
  }

  async function selectRestore() {
    setBusy(true)
    try {
      if (desktop) {
        const selected = await desktop.selectWorkspaceBackup()
        if (!selected) return setMessage('Restore canceled. No file was selected.')
        applyRestore(selected.content, selected.path)
      } else input.current?.click()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to restore workspace backup.') }
    finally { setBusy(false) }
  }

  async function restoreBrowserFile(file: File) {
    setBusy(true)
    try { applyRestore(await file.text(), file.name) }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to restore workspace backup.') }
    finally { setBusy(false) }
  }

  function clearPersonalData() {
    const warning = backupCreated
      ? 'Clear all project.X projects, local paths, GitHub owner, account sessions, preferences and recovery data from this device? Project folders on disk will not be deleted.'
      : 'No backup was created during this session. Clear all project.X personal data from this device anyway? Project folders on disk will not be deleted.'
    if (!window.confirm(warning)) return
    const removed = clearProjectXPersonalData()
    setMessage(`Cleared ${removed} stored project.X entries. Reloading to a blank workspace...`)
    window.setTimeout(() => window.location.reload(), 500)
  }

  return <aside className={`data-backup-dock ${open ? 'open' : ''}`} aria-label="Workspace backup and restore">
    <button className="data-backup-toggle" type="button" onClick={() => setOpen((value) => !value)}><strong>DATA</strong><span>BACKUP</span></button>
    {open && <div className="data-backup-panel">
      <header><div><small>LOCAL WORKSPACE</small><strong>Backup and restore</strong></div><button type="button" onClick={() => setOpen(false)}>×</button></header>
      <p>{message}</p>
      <div className="data-backup-summary"><span>INCLUDED</span><strong>Projects, local links, artwork and preferences</strong><small>Passwords, access tokens and cloud sessions are never exported.</small></div>
      <div className="data-backup-actions"><button type="button" disabled={busy} onClick={() => void exportBackup()}>Save backup</button><button type="button" disabled={busy} onClick={() => void selectRestore()}>Restore backup</button></div>
      <button className="data-backup-clear" type="button" disabled={busy} onClick={clearPersonalData}>Clear personal data</button>
      <small className="data-backup-note">Clearing removes app data only. It never deletes project folders or repositories from disk.</small>
      <input ref={input} hidden type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void restoreBrowserFile(file); event.target.value = '' }} />
    </div>}
  </aside>
}
