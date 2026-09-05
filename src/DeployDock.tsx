import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { deployGitHubProject } from './services/vercelDeploy'
import { fetchVercelDeployments, type VercelDeployment } from './services/vercel'
import { deploymentState, healthFor, writeProjectHealth } from './services/projectHealth'
import { connectProvider } from './services/providerConnections'

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
  const [deployments, setDeployments] = useState<VercelDeployment[]>([])
  const [selectedDeploymentId, setSelectedDeploymentId] = useState('')
  const projects = loadDeployableProjects()
  const selected = projects.find((project) => project.id === selectedId) || projects[0]
  const vercelProjects = useMemo(() => Array.from(new Map(deployments.map((deployment) => [deployment.name, deployment])).values()), [deployments])

  async function loadDeployments(projectId = selected?.id) {
    setMessage('Loading Vercel projects and current deployment states…')
    const result = await fetchVercelDeployments()
    setDeployments(result.deployments)
    if (!result.connected) return setMessage(result.message || 'Vercel is not connected.')
    const linked = projectId ? healthFor(projectId).deployment.link : undefined
    const match = linked ? result.deployments.find((deployment) => deployment.id === linked.deploymentId || deployment.name === linked.projectName) : undefined
    if (match && projectId) {
      setSelectedDeploymentId(match.id)
      writeProjectHealth(projectId, { deployment: { state: deploymentState(match.state), detail: `${match.name} is ${match.state.toLowerCase()} on Vercel.`, checkedAt: new Date().toISOString(), link: { provider: 'vercel', projectName: match.name, deploymentId: match.id, url: match.url } } })
    }
    setMessage(result.deployments.length ? 'Choose the Vercel project that belongs to this project.X record.' : 'Vercel is connected, but no deployments were returned.')
  }

  useEffect(() => {
    const handle = (event: Event) => {
      const detail = (event as CustomEvent<{ projectId?: string }>).detail
      if (!detail?.projectId) return
      setSelectedId(detail.projectId)
      setOpen(true)
      void loadDeployments(detail.projectId)
    }
    window.addEventListener('projectx:open-deployment', handle)
    return () => window.removeEventListener('projectx:open-deployment', handle)
  }, [])

  function linkDeployment() {
    if (!selected) return setMessage('Choose a project.X project first.')
    const deployment = deployments.find((item) => item.id === selectedDeploymentId)
    if (!deployment) return setMessage('Choose a Vercel project to link.')
    writeProjectHealth(selected.id, { deployment: { state: deploymentState(deployment.state), detail: `${deployment.name} is ${deployment.state.toLowerCase()} on Vercel.`, checkedAt: new Date().toISOString(), link: { provider: 'vercel', projectName: deployment.name, deploymentId: deployment.id, url: deployment.url } } })
    setMessage(`${selected.name} is now linked to ${deployment.name} on Vercel.`)
  }

  async function connect(provider: 'github' | 'vercel') {
    setBusy(true)
    try { setMessage(await connectProvider(provider)) }
    catch (error) { setMessage(error instanceof Error ? error.message : `Unable to connect ${provider}.`) }
    finally { setBusy(false) }
  }

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
      setMessage(`${target === 'production' ? 'Production' : 'Preview'} deployment ${result.status || 'started'}${result.url ? ` · ${result.url}` : ''}${result.githubDeploymentRegistered ? ' · GitHub deployment registered' : result.githubMessage ? ` · GitHub: ${result.githubMessage}` : ''}`)
      await loadDeployments(selected.id)
    } finally { setBusy(false) }
  }

  return <aside className={`deploy-dock ${open ? 'open' : ''}`} aria-label="Deploy project">
    <button className="deploy-toggle" type="button" onClick={() => setOpen((value) => !value)}><span>△</span><strong>DEPLOY</strong></button>
    {open && createPortal(<div className="utility-modal-layer" onPointerDown={(event) => { if (event.target === event.currentTarget) setOpen(false) }}><div className="deploy-panel" data-projectx-utility-panel="true" role="dialog" aria-modal="true" aria-label="Deploy project"><div className="deploy-head"><div><small>VERCEL ACTION</small><strong>Deploy project</strong></div><button type="button" onClick={() => setOpen(false)}>×</button></div>
      <p>{message}</p>
      <div className="provider-connect-row"><button type="button" disabled={busy} onClick={() => void connect('github')}>Connect GitHub</button><button type="button" disabled={busy} onClick={() => void connect('vercel')}>Connect Vercel</button></div>
      <label><span>Project</span><select value={selected?.id || ''} onChange={(event) => setSelectedId(event.target.value)}>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
      <label><span>Target</span><select value={target} onChange={(event) => setTarget(event.target.value as 'preview' | 'production')}><option value="preview">Preview</option><option value="production">Production</option></select></label>
      <div className="deploy-link-row"><label><span>Linked Vercel project</span><select value={selectedDeploymentId} onChange={(event) => setSelectedDeploymentId(event.target.value)}><option value="">Choose deployment</option>{vercelProjects.map((deployment) => <option key={deployment.id} value={deployment.id}>{deployment.name} · {deployment.state}</option>)}</select></label><button type="button" onClick={() => void loadDeployments()}>Refresh</button><button type="button" onClick={linkDeployment} disabled={!selectedDeploymentId}>Link</button></div>
      <button className="deploy-primary" type="button" onClick={() => void deploy()} disabled={busy || !selected}>{busy ? 'Deploying…' : `Deploy ${target}`}</button>
      <small className="deploy-note">Production deploys are explicit. The deployment circle reports only the linked Vercel project; a local dev server never marks a project online.</small>
    </div></div>, document.body)}
  </aside>
}
