export type DesktopProjectSummary = {
  name: string
  path: string
  packageName?: string
  scripts?: string[]
  frameworkHints?: string[]
  git?: { branch?: string; remote?: string; dirty?: boolean }
  packageManager?: string
  dependenciesInstalled?: boolean
  runReady?: boolean
  readinessDetail?: string
}

export type ProjectRelocation = {
  id: string
  originalPath: string
  managedPath: string
  movedAt: string
  restoredAt?: string
}

export type DesktopRelocationResult = {
  summary: DesktopProjectSummary
  relocation: ProjectRelocation
}

export type ProjectInitializationResult = {
  summary: DesktopProjectSummary
  packageManager?: string
  installCommand?: string
  install?: { ok: boolean; output: string }
  source: string
}

export type ProjectRunResult = {
  ok: boolean
  output: string
  pid?: number
  script: string
  packageManager?: string
  url?: string
  lanUrl?: string
  logPath?: string
}

export type ArtworkCandidate = {
  path: string
  relativePath: string
  fileName: string
  kind: 'icon' | 'logo' | 'banner' | 'cover' | 'screenshot' | 'image' | string
  score: number
  bytes: number
  dataUrl?: string
}

export type ToolStatus = {
  name: string
  command: string
  installed: boolean
  version?: string
}

export type ZipMergePreview = {
  targetPath: string
  zipPath: string
  added: string[]
  replaced: string[]
  addedCount: number
  replacedCount: number
}

export type ZipMergeResult = {
  summary: DesktopProjectSummary
  backupPath: string
  addedCount: number
  replacedCount: number
}

export type WorkspaceBackupFile = { path: string; content: string }

export type DesktopHostBridge = {
  version: string
  selectProjectFolder(): Promise<DesktopProjectSummary | null>
  inspectProject(path: string): Promise<DesktopProjectSummary>
  moveProjectIntoWorkspace(path: string): Promise<DesktopRelocationResult>
  restoreProjectLocation(managedPath: string): Promise<DesktopRelocationResult>
  listProjectRelocations(): Promise<ProjectRelocation[]>
  selectZipFile(): Promise<string | null>
  initializeZipProject(zipPath: string, install: boolean): Promise<ProjectInitializationResult>
  cloneGitHubProject(repoUrl: string, name: string): Promise<ProjectInitializationResult>
  previewZipMerge(zipPath: string, targetPath: string): Promise<ZipMergePreview>
  applyZipMerge(zipPath: string, targetPath: string): Promise<ZipMergeResult>
  createViteProject(name: string, template: string): Promise<ProjectInitializationResult>
  runDevProject(path: string, script: string, networkAccess?: boolean): Promise<ProjectRunResult>
  stopDevProject(pid: number): Promise<{ ok: boolean; output: string }>
  discoverProjectArtwork(path: string): Promise<ArtworkCandidate[]>
  toolchainPreflight(): Promise<ToolStatus[]>
  downloadRemotePackage(url: string, fileName: string): Promise<string>
  removeRemotePackage(path: string): Promise<void>
  openPreviewWindow(projectId: string, projectName: string, url: string, pid?: number): Promise<void>
  openExternalPreview(url: string): Promise<void>
  openExternalUrl(url: string): Promise<void>
  openInExplorer(path: string): Promise<void>
  openInTerminal(path: string): Promise<void>
  gitStatus(path: string): Promise<DesktopProjectSummary['git']>
  gitCommit(path: string, message: string): Promise<{ ok: boolean; output: string }>
  gitPush(path: string): Promise<{ ok: boolean; output: string }>
  runScript(path: string, script: string): Promise<{ ok: boolean; output: string }>
  saveWorkspaceBackup(content: string, suggestedName: string): Promise<string | null>
  selectWorkspaceBackup(): Promise<WorkspaceBackupFile | null>
}

declare global { interface Window { projectXDesktop?: DesktopHostBridge } }
export function getDesktopHost(): DesktopHostBridge | null { return window.projectXDesktop || null }
export function isDesktopHostAvailable(): boolean { return Boolean(window.projectXDesktop) }
