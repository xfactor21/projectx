import type { ProjectHealth } from './services/projectHealth'

type Props = { name: string; health: ProjectHealth; onOpen(): void; onDeployment(): void }

export default function ProjectStatusBar({ name, health, onOpen, onDeployment }: Props) {
  return <div className="project-health-bar">
    <button type="button" className={`health-orb build ${health.build.state}`} onClick={onOpen} title={`Build: ${health.build.detail}`} aria-label={`Build status for ${name}: ${health.build.detail}`}><span/></button>
    <button type="button" className={`health-orb deployment ${health.deployment.state}`} onClick={onDeployment} title={`Vercel: ${health.deployment.detail}`} aria-label={`Deployment status for ${name}: ${health.deployment.detail}`}><span/></button>
    <button type="button" className="project-health-title" onClick={onOpen}>{name}</button>
  </div>
}
