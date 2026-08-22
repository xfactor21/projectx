import type { DesktopHostBridge, DesktopProjectSummary } from './desktop'

type TauriInternals = {
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>
}

declare global {
  interface Window {
    __TAURI_INTERNALS__?: TauriInternals
  }
}

function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const internals = window.__TAURI_INTERNALS__
  if (!internals) return Promise.reject(new Error('project.X desktop host is not available.'))
  return internals.invoke<T>(command, args)
}

export function installTauriDesktopBridge(): boolean {
  if (!window.__TAURI_INTERNALS__) return false

  const bridge: DesktopHostBridge = {
    version: '0.1.0',
    selectProjectFolder: () => invoke<DesktopProjectSummary | null>('select_project_folder'),
    inspectProject: (path) => invoke<DesktopProjectSummary>('inspect_project', { path }),
    openInExplorer: (path) => invoke<void>('open_in_explorer', { path }),
    openInTerminal: (path) => invoke<void>('open_in_terminal', { path }),
    gitStatus: (path) => invoke<DesktopProjectSummary['git']>('git_status', { path }),
    gitCommit: (path, message) => invoke<{ ok: boolean; output: string }>('git_commit', { path, message }),
    gitPush: (path) => invoke<{ ok: boolean; output: string }>('git_push', { path }),
    runScript: (path, script) => invoke<{ ok: boolean; output: string }>('run_script', { path, script }),
  }

  window.projectXDesktop = bridge
  return true
}
