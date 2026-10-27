import type { ProjectHealth } from './services/projectHealth'

type LocalSource = { path?: string; hasGit?: boolean; gitBranch?: string }

type Props = {
  name: string
  repoUrl?: string
  source?: LocalSource
  health: ProjectHealth
  onOpen(): void
  onDeployment(): void
}

function checkedAt(value?: string) {
  if (!value) return 'not checked'
  const time = new Date(value).getTime()
  if (!Number.isFinite(time)) return 'not checked'
  const minutes = Math.max(0, Math.floor((Date.now() - time) / 60_000))
  return minutes < 1 ? 'now' : minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h`
}

export default function ProjectStatusBar({ name, repoUrl, source, health, onOpen, onDeployment }: Props) {
  const local = Boolean(source?.path)
  const runtimeState = !local ? 'remote' : health.build.runUrl ? 'running' : health.build.state === 'ready' ? 'ready' : health.build.state === 'error' ? 'blocked' : 'unknown'
  const gitState = source?.hasGit ? 'ready' : repoUrl ? 'remote' : local ? 'none' : 'unknown'
  const gitText = source?.hasGit ? (source.gitBranch || 'GIT') : repoUrl ? 'REMOTE GIT' : 'NO GIT'
  return <div className="project-health-bar-v301" aria-label={`Health for ${name}`}>
    <button type="button" className="project-health-title-v301" onClick={onOpen}>{name}</button>
    <div className="project-health-signals-v301">
      <button type="button" className={`health-chip build ${health.build.state}`} onClick={onOpen} title={health.build.detail}><span>BUILD</span><b>{health.build.state.toUpperCase()}</b><small>{checkedAt(health.build.checkedAt)}</small></button>
      <button type="button" className={`health-chip runtime ${runtimeState}`} onClick={onOpen} title={!local ? 'Cloud/remote record: link or import a local source to run it.' : health.build.runUrl ? `Running at ${health.build.runUrl}` : health.build.detail}><span>RUNTIME</span><b>{runtimeState.toUpperCase()}</b><small>{local ? 'LOCAL' : 'REMOTE'}</small></button>
      <button type="button" className={`health-chip git ${gitState}`} onClick={onOpen} title={source?.hasGit ? `Local Git detected${source.gitBranch ? ` on ${source.gitBranch}` : ''}.` : repoUrl ? 'Remote repository is known, but this desktop record has no local Git source.' : 'No Git source detected.'}><span>GIT</span><b>{gitText}</b><small>{local ? 'LOCAL' : 'CLOUD'}</small></button>
      <button type="button" className={`health-chip deployment ${health.deployment.state}`} onClick={onDeployment} title={health.deployment.detail}><span>DEPLOY</span><b>{health.deployment.state.toUpperCase()}</b><small>{checkedAt(health.deployment.checkedAt)}</small></button>
    </div>
  </div>
}
