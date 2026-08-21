import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './errorBoundary.css'
import App from './App.tsx'
import ErrorBoundary from './ErrorBoundary.tsx'
import CloudSyncDock from './CloudSyncDock.tsx'
import GitHubDiscoveryModal from './GitHubDiscoveryModal.tsx'
import LocalProjectDock from './LocalProjectDock.tsx'
import ProjectIntelDock from './ProjectIntelDock.tsx'
import DeploymentAnalyticsDock from './DeploymentAnalyticsDock.tsx'
import './viewModes.css'
import './phase3.css'
import './cloudSync.css'
import './githubDiscovery.css'
import './localProjects.css'
import './projectIntel.css'
import './deploymentAnalytics.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
      <CloudSyncDock />
      <LocalProjectDock />
      <ProjectIntelDock />
      <DeploymentAnalyticsDock />
      <GitHubDiscoveryModal />
    </ErrorBoundary>
  </StrictMode>,
)
