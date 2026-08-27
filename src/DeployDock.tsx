import { useState } from 'react'
import { deployGitHubProject } from './services/vercelDeploy'

const PROJECTS_KEY = 'projectx.projects.v1'

type Project = {
  id: string
  name: string
  repoUrl?: string
  github?: { defaultBranch?: string }
}

function loadDeployableProjects(): Project[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(PROJECTS_KEY) || '[]')
    return Array.isArray(parsed) ? parsed.filter((project) => project?.repoUrl?.includes('github.com/')) : []
  } catch { return [] }
}

export default function DeployDock() {
  const [open, setOpen] = useState(false)
  const [selectedId, setSelectedId] = useState('')
  const [target, setTarget] = useState<'preview' | 'production'>('preview')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('Deploy a tracked GitHub project through project.X.')
  const projects = loadDeployableProjects()
  const selected = projects.find((project) => project.id === selectedId) || projects[0]

  async function deploy() {
    if (!selected) return setMessage('Add or connect a GitHub project first.')
    setBusy(true)
    try {
      const result = await deployGitHubProject({
        projectName: selected.name,
        repoUrl: selected.repoUrl || '',
        ref: selected.github?.defaultBranch || 'main',
        target,
      })
      if (!result.ok) {
        setMessage(result.message || 'Deployment failed.')
        return
      }
      setMessage(`${target === 'production' ? 'Production' : 'Preview'} deployment ${result.status || 'started'}${result.url ? ` · ${result.url}` : ''}`)
    } finally { setBusy(false) }
  }

  return <aside className={`deploy-dock ${open ? 'open' : ''}`} aria-label="Deploy project">
    <button className="deploy-toggle" type="button" onClick={() => setOpen((value) => !value)}><span>△</span><strong>DEPLOY</strong></button>
    {open && <div className="deploy-panel"><div className="deploy-head"><div><small>VERCEL ACTION</small><strong>Deploy project</strong></div><button type="button" onClick={() => setOpen(false)}>×</button></div>
      <p>{message}</p>
      <label><span>Project</span><select value={selected?.id || ''} onChange={(event) => setSelectedId(event.target.value)}>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
      <label><span>Target</span><select value={target} onChange={(event) => setTarget(event.target.value as 'preview' | 'production')}><option value="preview">Preview</option><option value="production">Production</option></select></label>
      <button className="deploy-primary" type="button" onClick={() => void deploy()} disabled={busy || !selected}>{busy ? 'Deploying…' : `Deploy ${target}`}</button>
      <small className="deploy-note">The Vercel token remains server-side. Production deploys are explicit; project.X never promotes a build merely because GitHub metadata changed.</small>
    </div>}
  </aside>
}
