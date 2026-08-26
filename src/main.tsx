import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './App.css'
import './errorBoundary.css'
import WorkspaceApp from './WorkspaceAppV3.tsx'
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
import AddProjectLauncher from './AddProjectLauncher.tsx'
import ThemeSensoryLayer from './ThemeSensoryLayer.tsx'
import ThemeEnvironmentLayer from './ThemeEnvironmentLayer.tsx'
import ArtworkDock from './ArtworkDock.tsx'
import ArtworkAutoDiscovery from './ArtworkAutoDiscovery.tsx'
import TaskConsole from './TaskConsole.tsx'
import RuntimeDock from './RuntimeDock.tsx'
import SurfaceCoordinator from './SurfaceCoordinator.tsx'
import DataBackupDock from './DataBackupDock.tsx'
import { installTauriDesktopBridge } from './services/tauriDesktop'
import './viewModes.css'
import './immersiveThemes.css'
import './workspaceV2.css'
import './themeEnvironment.css'
import './themeRenderers.css'
import './brandSignature.css'
import './phase3.css'
import './cloudSync.css'
import './githubDiscovery.css'
import './localProjects.css'
import './projectIntel.css'
import './deploymentAnalytics.css'
import './deployDock.css'
import './betaDiagnostics.css'
import './companion.css'
import './companionV2.css'
import './companionBrand.css'
import './companionV17.css'
import './desktopActions.css'
import './addProjectLauncher.css'
import './themeSensory.css'
import './artworkDock.css'
import './taskConsole.css'
import './runtimeDock.css'
import './interactionSafety.css'
import './stabilization.css'
import './dataBackup.css'
import './workflowFixes.css'
import './v16.css'

installTauriDesktopBridge()

window.addEventListener('projectx:open-add-project', () => {
  window.setTimeout(() => document.querySelector<HTMLButtonElement>('.project-launcher-fab')?.click(), 0)
})

const capacitorNative = Boolean((window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.())
const companionMode = capacitorNative || new URLSearchParams(window.location.search).get('mode') === 'companion'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      {companionMode ? <CompanionApp /> : <>
        <ThemeEnvironmentLayer />
        <WorkspaceApp />
        <SurfaceCoordinator />
        <ArtworkAutoDiscovery />
        <CompanionDesktopWorker />
        <div className="utility-rail" aria-label="Project utilities">
          <ThemeSensoryLayer />
          <AddProjectLauncher />
          <CloudSyncDock />
          <LocalProjectDock />
          <ArtworkDock />
          <TaskConsole />
          <DataBackupDock />
          <RuntimeDock />
          <DesktopActionsDock />
          <ProjectIntelDock />
          <DeploymentAnalyticsDock />
          <DeployDock />
          <BetaDiagnosticsDock />
        </div>
        <GitHubDiscoveryModal />
      </>}
    </ErrorBoundary>
  </StrictMode>,
)
