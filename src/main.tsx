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
import DeployDock from './DeployDock.tsx'
import BetaDiagnosticsDock from './BetaDiagnosticsDock.tsx'
import CompanionApp from './CompanionApp.tsx'
import DesktopActionsDock from './DesktopActionsDock.tsx'
import CompanionDesktopWorker from './CompanionDesktopWorker.tsx'
import { installTauriDesktopBridge } from './services/tauriDesktop'
import './viewModes.css'
import './immersiveThemes.css'
import './phase3.css'
import './cloudSync.css'
import './githubDiscovery.css'
import './localProjects.css'
import './projectIntel.css'
import './deploymentAnalytics.css'
import './deployDock.css'
import './betaDiagnostics.css'
import './companion.css'
import './desktopActions.css'

installTauriDesktopBridge()

const companionMode = new URLSearchParams(window.location.search).get('mode') === 'companion'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      {companionMode ? <CompanionApp /> : <>
        <App />
        <CloudSyncDock />
        <LocalProjectDock />
        <DesktopActionsDock />
        <CompanionDesktopWorker />
        <ProjectIntelDock />
        <DeploymentAnalyticsDock />
        <DeployDock />
        <BetaDiagnosticsDock />
        <GitHubDiscoveryModal />
      </>}
    </ErrorBoundary>
  </StrictMode>,
)
