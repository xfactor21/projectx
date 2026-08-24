import type {
  ArtworkCandidate,
  DesktopHostBridge,
  DesktopProjectSummary,
  DesktopRelocationResult,
  ProjectInitializationResult,
  ProjectRelocation,
  ProjectRunResult,
  ToolStatus,
  ZipMergePreview,
  ZipMergeResult,
} from './desktop'

type TauriInternals = { invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> }
declare global { interface Window { __TAURI_INTERNALS__?: TauriInternals } }
function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const internals = window.__TAURI_INTERNALS__
  if (!internals) return Promise.reject(new Error('project.X desktop host is not available.'))
  return internals.invoke<T>(command, args)
}

export function installTauriDesktopBridge(): boolean {
  if (!window.__TAURI_INTERNALS__) return false
  const bridge: DesktopHostBridge = {
    version: '0.7.0',
    selectProjectFolder: () => invoke<DesktopProjectSummary | null>('select_project_folder'),
    inspectProject: (path) => invoke<DesktopProjectSummary>('inspect_project', { path }),
    moveProjectIntoWorkspace: (path) => invoke<DesktopRelocationResult>('move_project_into_workspace', { path }),
    restoreProjectLocation: (managedPath) => invoke<DesktopRelocationResult>('restore_project_location', { managedPath }),
    listProjectRelocations: () => invoke<ProjectRelocation[]>('list_project_relocations'),
    selectZipFile: () => invoke<string | null>('select_zip_file'),
    initializeZipProject: (zipPath, install) => invoke<ProjectInitializationResult>('initialize_zip_project', { zipPath, install }),
    previewZipMerge: (zipPath, targetPath) => invoke<ZipMergePreview>('preview_zip_merge', { zipPath, targetPath }),
    applyZipMerge: (zipPath, targetPath) => invoke<ZipMergeResult>('apply_zip_merge', { zipPath, targetPath }),
    createViteProject: (name, template) => invoke<ProjectInitializationResult>('create_vite_project', { name, template }),
    runDevProject: (path, script) => invoke<ProjectRunResult>('run_dev_project', { path, script }),
    stopDevProject: (pid) => invoke<{ ok: boolean; output: string }>('stop_dev_project', { pid }),
    discoverProjectArtwork: (path) => invoke<ArtworkCandidate[]>('discover_project_artwork', { path }),
    toolchainPreflight: () => invoke<ToolStatus[]>('toolchain_preflight'),
    downloadRemotePackage: (url, fileName) => invoke<string>('download_remote_package', { url, fileName }),
    openPreviewWindow: (projectId, projectName, url) => invoke<void>('open_preview_window', { projectId, projectName, url }),
    reloadPreviewWindow: (projectId) => invoke<void>('reload_preview_window', { projectId }),
    closePreviewWindow: (projectId) => invoke<void>('close_preview_window', { projectId }),
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
