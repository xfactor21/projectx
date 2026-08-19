import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './errorBoundary.css'
import App from './App.tsx'
import ErrorBoundary from './ErrorBoundary.tsx'
import CloudSyncDock from './CloudSyncDock.tsx'
import './viewModes.css'
import './phase3.css'
import './cloudSync.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
      <CloudSyncDock />
    </ErrorBoundary>
  </StrictMode>,
)
