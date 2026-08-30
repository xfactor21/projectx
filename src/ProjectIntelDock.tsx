import { useMemo, useState } from 'react'
import { healthFor, readProjectHealth, type ProjectHealth } from './services/projectHealth'

const PROJECTS_KEY = 'projectx.projects.v1'

type Project = {
  id: string
  name: string
  status?: string
  repoUrl?: string
  liveUrl?: string
  progress?: number
  archived?: boolean
  github?: { lastPush?: string; openIssues?: number }
}

type Finding = { projectId: string; project: string; level: 'high' | 'medium' | 'low'; message: string }

function loadProjects(): Project[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(PROJECTS_KEY) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}

function daysSince(value?: string) {
  if (!value) return null
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? Math.floor((Date.now() - timestamp) / 86400000) : null
}

function analyze(projects: Project[], healthMap: Record<string, ProjectHealth>): Finding[] {
  const findings: Finding[] = []
  projects.filter((project) => !project.archived).forEach((project) => {
    const health = healthFor(project.id, healthMap)
    if (health.build.state === 'error') findings.push({ projectId: project.id, project: project.name, level: 'high', message: `Run readiness failed: ${health.build.detail}` })
    if (health.deployment.state === 'error') findings.push({ projectId: project.id, project: project.name, level: 'high', message: `Deployment failed: ${health.deployment.detail}` })
    if (health.deployment.state === 'offline') findings.push({ projectId: project.id, project: project.name, level: 'medium', message: `Linked deployment is offline: ${health.deployment.detail}` })
    if (!project.repoUrl) findings.push({ projectId: project.id, project: project.name, level: 'medium', message: 'No repository is connected.' })
    const staleDays = daysSince(project.github?.lastPush)
    if (staleDays !== null && staleDays >= 30 && project.status === 'Building') findings.push({ projectId: project.id, project: project.name, level: 'medium', message: `Building project has not been pushed in ${staleDays} days.` })
    if ((project.github?.openIssues || 0) >= 10) findings.push({ projectId: project.id, project: project.name, level: 'low', message: `${project.github?.openIssues} open GitHub issues.` })
    if ((project.progress || 0) >= 90 && project.status === 'Building') findings.push({ projectId: project.id, project: project.name, level: 'low', message: 'Near completion but still marked Building.' })
  })
  const rank = { high: 0, medium: 1, low: 2 }
  return findings.sort((a, b) => rank[a.level] - rank[b.level] || a.project.localeCompare(b.project))
}

export default function ProjectIntelDock() {
  const [open, setOpen] = useState(false)
  const projects = loadProjects()
  const findings = useMemo(() => analyze(projects, readProjectHealth()), [projects])

  return <aside className={`intel-dock ${open ? 'open' : ''}`} aria-label="Project intelligence">
    <button className="intel-toggle" type="button" onClick={() => setOpen((value) => !value)}><span>✦</span><strong>ATTENTION</strong><b>{findings.length}</b></button>
    {open && <div className="intel-panel"><div className="intel-head"><div><small>PROJECT INTELLIGENCE</small><strong>Needs attention</strong></div><button type="button" onClick={() => setOpen(false)}>×</button></div>
      {findings.length ? <div className="intel-findings">{findings.map((finding, index) => <div className={`intel-finding ${finding.level}`} key={`${finding.projectId}-${index}`}><span>{finding.level}</span><strong>{finding.project}</strong><p>{finding.message}</p></div>)}</div> : <div className="intel-empty"><strong>No obvious blockers.</strong><span>The current local project records look clean.</span></div>}
      <small className="intel-note">This scanner combines deterministic local checks with the last verified build and linked deployment states. Provider status is refreshed while Cloud is signed in.</small>
    </div>}
  </aside>
}
