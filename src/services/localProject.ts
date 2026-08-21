export type BrowserLocalProject = {
  name: string
  sourceLabel: string
  packageName?: string
  scripts: string[]
  stack: string[]
  hasGit: boolean
  gitBranch?: string
}

type DirectoryHandle = {
  name: string
  getFileHandle(name: string): Promise<{ getFile(): Promise<File> }>
  getDirectoryHandle(name: string): Promise<DirectoryHandle>
}

async function readText(handle: DirectoryHandle, name: string) {
  try {
    const fileHandle = await handle.getFileHandle(name)
    return await (await fileHandle.getFile()).text()
  } catch {
    return null
  }
}

function detectStack(pkg: Record<string, unknown> | null): string[] {
  if (!pkg) return []
  const deps = { ...(pkg.dependencies as Record<string, string> || {}), ...(pkg.devDependencies as Record<string, string> || {}) }
  const hints: Array<[string, string]> = [
    ['react', 'React'], ['next', 'Next.js'], ['vite', 'Vite'], ['vue', 'Vue'], ['svelte', 'Svelte'],
    ['@tauri-apps/api', 'Tauri'], ['electron', 'Electron'], ['typescript', 'TypeScript'], ['express', 'Express'],
  ]
  return hints.filter(([key]) => key in deps).map(([, label]) => label)
}

export function browserFolderPickerAvailable() {
  return typeof (window as Window & { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function'
}

export async function selectBrowserProjectFolder(): Promise<BrowserLocalProject | null> {
  const picker = (window as Window & { showDirectoryPicker?: () => Promise<DirectoryHandle> }).showDirectoryPicker
  if (!picker) throw new Error('Folder access is not supported in this browser. Use Chrome/Edge or the upcoming Windows desktop build.')

  let handle: DirectoryHandle
  try {
    handle = await picker()
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return null
    throw error
  }

  const packageText = await readText(handle, 'package.json')
  let pkg: Record<string, unknown> | null = null
  if (packageText) {
    try { pkg = JSON.parse(packageText) as Record<string, unknown> } catch { pkg = null }
  }

  let hasGit = false
  let gitBranch: string | undefined
  try {
    const git = await handle.getDirectoryHandle('.git')
    hasGit = true
    const head = await readText(git, 'HEAD')
    if (head?.startsWith('ref: refs/heads/')) gitBranch = head.replace('ref: refs/heads/', '').trim()
  } catch {
    // A folder can still be a valid project even if it is not a Git repository.
  }

  const scripts = pkg && typeof pkg.scripts === 'object' && pkg.scripts
    ? Object.keys(pkg.scripts as Record<string, unknown>)
    : []

  return {
    name: typeof pkg?.name === 'string' && pkg.name ? pkg.name : handle.name,
    sourceLabel: handle.name,
    packageName: typeof pkg?.name === 'string' ? pkg.name : undefined,
    scripts,
    stack: detectStack(pkg),
    hasGit,
    gitBranch,
  }
}
