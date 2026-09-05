import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './App.css'
import './errorBoundary.css'
import WorkspaceApp from './WorkspaceAppV3.tsx'
import ErrorBoundary from './ErrorBoundary.tsx'
import GitHubDiscoveryModal from './GitHubDiscoveryModal.tsx'
import CompanionApp from './CompanionApp.tsx'
import CompanionDesktopWorker from './CompanionDesktopWorker.tsx'
import ThemeEnvironmentLayer from './ThemeEnvironmentLayer.tsx'
import ArtworkAutoDiscovery from './ArtworkAutoDiscovery.tsx'
import SurfaceCoordinator from './SurfaceCoordinator.tsx'
import UtilityHub from './UtilityHub.tsx'
import SettingsPanel from './SettingsPanel.tsx'
import AppSplash from './AppSplash.tsx'
import EmbeddedPreview from './EmbeddedPreview.tsx'
import ConnectionCenter from './ConnectionCenter.tsx'
import { installTauriDesktopBridge } from './services/tauriDesktop'
import { applySettings } from './services/settings'
import { bootstrapSecureSession } from './services/supabase'
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
import './companionLaunch.css'
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
import './v18.css'
import './v19.css'
import './uiViewportFixes.css'
import './embeddedPreview.css'
import './v27.css'
import './v28.css'
import './v29.css'
import './phase2Themes.css'
import './themeImmersionRound.css'

installTauriDesktopBridge()
applySettings()
void bootstrapSecureSession()

window.addEventListener('projectx:open-add-project', () => {
  window.dispatchEvent(new CustomEvent('projectx:open-utility', { detail: { category: 'projects' } }))
  window.setTimeout(() => document.querySelector<HTMLButtonElement>('.project-launcher-fab')?.click(), 100)
})

const capacitorNative = Boolean((window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.())
const companionMode = capacitorNative || new URLSearchParams(window.location.search).get('mode') === 'companion'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      {companionMode ? <><AppSplash /><CompanionApp /></> : <>
        <AppSplash />
        <ThemeEnvironmentLayer />
        <WorkspaceApp />
        <SurfaceCoordinator />
        <ArtworkAutoDiscovery />
        <CompanionDesktopWorker />
        <EmbeddedPreview />
        <ConnectionCenter />
        <UtilityHub />
        <SettingsPanel />
        <GitHubDiscoveryModal />
      </>}
    </ErrorBoundary>
  </StrictMode>,
)
