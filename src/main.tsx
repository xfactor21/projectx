import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './errorBoundary.css'
import App from './App.tsx'
import ErrorBoundary from './ErrorBoundary.tsx'
import CloudSyncDock from './CloudSyncDock.tsx'
import GitHubDiscoveryModal from './GitHubDiscoveryModal.tsx'
import './viewModes.css'
import './phase3.css'
import './cloudSync.css'
import './githubDiscovery.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
      <CloudSyncDock />
      <GitHubDiscoveryModal />
    </ErrorBoundary>
  </StrictMode>,
)
