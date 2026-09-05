from pathlib import Path
import json


def replace(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    if old not in text:
        raise SystemExit(f'Expected patch anchor missing in {path}: {old[:80]!r}')
    p.write_text(text.replace(old, new, 1), encoding='utf-8')


# 1) Protect persistent Windows cloud sessions with DPAPI and keep live tokens out of localStorage.
replace('src-tauri/src/main.rs', 'mod remote_packages;\nmod system_tools;', 'mod remote_packages;\nmod secure_session;\nmod system_tools;')
replace('src-tauri/src/main.rs', '            remote_packages::remove_remote_package,\n            preview::open_preview_window,', '            remote_packages::remove_remote_package,\n            secure_session::save_secure_session,\n            secure_session::load_secure_session,\n            secure_session::clear_secure_session,\n            preview::open_preview_window,')
replace('src/services/desktop.ts', '  removeRemotePackage(path: string): Promise<void>\n  openPreviewWindow', '  removeRemotePackage(path: string): Promise<void>\n  saveSecureSession(content: string): Promise<void>\n  loadSecureSession(): Promise<string | null>\n  clearSecureSession(): Promise<void>\n  openPreviewWindow')
replace('src/services/tauriDesktop.ts', "    removeRemotePackage: (path) => invoke<void>('remove_remote_package', { path }),\n    openPreviewWindow", "    removeRemotePackage: (path) => invoke<void>('remove_remote_package', { path }),\n    saveSecureSession: (content) => invoke<void>('save_secure_session', { content }),\n    loadSecureSession: () => invoke<string | null>('load_secure_session'),\n    clearSecureSession: () => invoke<void>('clear_secure_session'),\n    openPreviewWindow")

p = Path('src/services/supabase.ts')
text = p.read_text(encoding='utf-8')
if "import { getDesktopHost } from './desktop'" not in text:
    text = "import { getDesktopHost } from './desktop'\n" + text
old = "export function loadSession(): SupabaseSession | null { try { const raw = localStorage.getItem(SESSION_KEY); return raw ? parseSession(JSON.parse(raw)) : null } catch { return null } }\nexport function saveSession(session: SupabaseSession | null): void {\n  if (!session) localStorage.removeItem(SESSION_KEY)\n  else localStorage.setItem(SESSION_KEY, JSON.stringify(session))\n  window.dispatchEvent(new CustomEvent('projectx:supabase-session-changed'))\n}"
new = "function desktopSessionStore(): Storage { return getDesktopHost() ? sessionStorage : localStorage }\nexport function loadSession(): SupabaseSession | null { try { const raw = desktopSessionStore().getItem(SESSION_KEY); return raw ? parseSession(JSON.parse(raw)) : null } catch { return null } }\nexport function saveSession(session: SupabaseSession | null): void {\n  const desktop = getDesktopHost()\n  const store = desktop ? sessionStorage : localStorage\n  if (!session) store.removeItem(SESSION_KEY)\n  else store.setItem(SESSION_KEY, JSON.stringify(session))\n  if (desktop) {\n    localStorage.removeItem(SESSION_KEY)\n    if (session) void desktop.saveSecureSession(JSON.stringify(session)).catch(() => undefined)\n    else void desktop.clearSecureSession().catch(() => undefined)\n  }\n  window.dispatchEvent(new CustomEvent('projectx:supabase-session-changed'))\n}\nexport async function bootstrapSecureSession(): Promise<void> {\n  const desktop = getDesktopHost()\n  if (!desktop) return\n  const current = sessionStorage.getItem(SESSION_KEY)\n  if (current) {\n    try { if (parseSession(JSON.parse(current))) return } catch { sessionStorage.removeItem(SESSION_KEY) }\n  }\n  const legacy = localStorage.getItem(SESSION_KEY)\n  if (legacy) {\n    try {\n      const parsed = parseSession(JSON.parse(legacy))\n      if (parsed) {\n        sessionStorage.setItem(SESSION_KEY, JSON.stringify(parsed))\n        await desktop.saveSecureSession(JSON.stringify(parsed))\n      }\n    } finally { localStorage.removeItem(SESSION_KEY) }\n    window.dispatchEvent(new CustomEvent('projectx:supabase-session-changed'))\n    return\n  }\n  try {\n    const protectedSession = await desktop.loadSecureSession()\n    if (!protectedSession) return\n    const parsed = parseSession(JSON.parse(protectedSession))\n    if (!parsed) { await desktop.clearSecureSession(); return }\n    sessionStorage.setItem(SESSION_KEY, JSON.stringify(parsed))\n    window.dispatchEvent(new CustomEvent('projectx:supabase-session-changed'))\n  } catch { await desktop.clearSecureSession().catch(() => undefined) }\n}"
if old not in text:
    raise SystemExit('Supabase session patch anchor missing')
p.write_text(text.replace(old, new, 1), encoding='utf-8')
replace('src/main.tsx', "import { applySettings } from './services/settings'", "import { applySettings } from './services/settings'\nimport { bootstrapSecureSession } from './services/supabase'")
replace('src/main.tsx', 'installTauriDesktopBridge()\napplySettings()', 'installTauriDesktopBridge()\napplySettings()\nvoid bootstrapSecureSession()')


# 2) Validate ZIPs before extraction to block path traversal, bombs, abusive depth/count, and huge entries.
p = Path('src-tauri/src/imports.rs')
text = p.read_text(encoding='utf-8')
anchor = 'fn expand_zip(zip_path: &Path, destination: &Path) -> Result<(), String> {\n    fs::create_dir_all(destination)'
hardened = r'''const MAX_ZIP_COMPRESSED_BYTES: u64 = 100 * 1024 * 1024;
const MAX_ZIP_EXTRACTED_BYTES: u64 = 512 * 1024 * 1024;
const MAX_ZIP_ENTRY_BYTES: u64 = 128 * 1024 * 1024;
const MAX_ZIP_ENTRIES: u64 = 25_000;

fn validate_zip_archive(zip_path: &Path) -> Result<(), String> {
    let compressed = fs::metadata(zip_path)
        .map_err(|error| format!("Unable to inspect ZIP: {error}"))?
        .len();
    if compressed == 0 || compressed > MAX_ZIP_COMPRESSED_BYTES {
        return Err("ZIP archives must be between 1 byte and 100 MB compressed.".into());
    }
    let script = r#"
Add-Type -AssemblyName System.IO.Compression.FileSystem
try {
  $archive = [IO.Compression.ZipFile]::OpenRead($args[0])
  try {
    if ($archive.Entries.Count -gt 25000) { throw 'ZIP contains too many entries (25,000 maximum).' }
    [int64]$total = 0
    foreach ($entry in $archive.Entries) {
      $name = $entry.FullName.Replace('\\','/')
      if ([string]::IsNullOrWhiteSpace($name)) { continue }
      if ($name.StartsWith('/') -or $name -match '^[A-Za-z]:' ) { throw "Unsafe absolute ZIP path: $name" }
      $parts = $name.Split('/', [StringSplitOptions]::RemoveEmptyEntries)
      if ($parts -contains '..') { throw "Unsafe parent traversal in ZIP path: $name" }
      if ($parts.Count -gt 40) { throw "ZIP path nesting is too deep: $name" }
      if ($name.Length -gt 512) { throw 'ZIP entry path exceeds 512 characters.' }
      if (-not $name.EndsWith('/')) {
        if ($entry.Length -gt 134217728) { throw "ZIP entry exceeds 128 MB: $name" }
        $total += $entry.Length
        if ($total -gt 536870912) { throw 'ZIP expands beyond the 512 MB safety limit.' }
        if ($entry.CompressedLength -gt 0 -and $entry.Length -gt 1048576) {
          $ratio = $entry.Length / [double]$entry.CompressedLength
          if ($ratio -gt 1000) { throw "Suspicious ZIP compression ratio: $name" }
        }
      }
    }
  } finally { if ($archive) { $archive.Dispose() } }
} catch {
  [Console]::Error.Write($_.Exception.Message)
  exit 1
}
"#;
    let mut command = Command::new("powershell.exe");
    command.args(["-NoProfile", "-NonInteractive", "-Command", script]).arg(zip_path);
    let result = command_output_with_timeout(&mut command, Duration::from_secs(30))?;
    if result.ok { Ok(()) } else { Err(format!("ZIP safety validation failed: {}", result.output)) }
}

fn expand_zip(zip_path: &Path, destination: &Path) -> Result<(), String> {
    validate_zip_archive(zip_path)?;
    fs::create_dir_all(destination)'''
if anchor not in text:
    raise SystemExit('ZIP hardening anchor missing')
p.write_text(text.replace(anchor, hardened, 1), encoding='utf-8')


# 3) Add regression tests and make CI run frontend/static + native Rust tests.
package_path = Path('package.json')
package = json.loads(package_path.read_text(encoding='utf-8'))
package.setdefault('scripts', {})['test'] = 'node --test tests/*.test.mjs'
package_path.write_text(json.dumps(package, indent=2) + '\n', encoding='utf-8')
Path('tests').mkdir(exist_ok=True)
Path('tests/security-regression.test.mjs').write_text(r'''import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'

const read = (path) => fs.readFileSync(path, 'utf8')

test('release version is not bumped during hardening', () => {
  assert.equal(JSON.parse(read('package.json')).version, '2.9.0')
})

test('desktop Supabase sessions use protected persistence, not localStorage', () => {
  const source = read('src/services/supabase.ts')
  assert.match(source, /desktop\.saveSecureSession/)
  assert.match(source, /desktop\.loadSecureSession/)
  assert.match(source, /desktopSessionStore\(\)/)
  assert.match(source, /localStorage\.removeItem\(SESSION_KEY\)/)
})

test('ZIP extraction is guarded before Expand-Archive', () => {
  const source = read('src-tauri/src/imports.rs')
  assert.match(source, /validate_zip_archive\(zip_path\)\?;/)
  assert.match(source, /MAX_ZIP_EXTRACTED_BYTES/)
  assert.match(source, /parent traversal/)
  assert.match(source, /compression ratio/)
})

test('main is an artifact-producing release branch', () => {
  assert.match(read('.github/workflows/windows-desktop.yml'), /branches: \[main, develop\]/)
  assert.match(read('.github/workflows/android-companion.yml'), /- main\n\s+- develop/)
})

test('orphan projectx gitlink is gone', () => {
  const indexed = execFileSync('git', ['ls-files', '-s', 'projectx'], { encoding: 'utf8' }).trim()
  assert.equal(indexed, '')
})
''', encoding='utf-8')

ci_path = Path('.github/workflows/ci.yml')
ci = ci_path.read_text(encoding='utf-8')
ci_anchor = '      - name: Lint\n        run: npm run lint\n'
if ci_anchor not in ci:
    raise SystemExit('CI patch anchor missing')
ci = ci.replace(ci_anchor, '      - name: Lint\n        run: npm run lint\n\n      - name: Regression tests\n        run: npm test\n\n  windows-native-tests:\n    runs-on: windows-latest\n    steps:\n      - name: Checkout\n        uses: actions/checkout@v4\n      - name: Setup Rust\n        uses: dtolnay/rust-toolchain@stable\n      - name: Native Rust tests\n        working-directory: src-tauri\n        run: cargo test\n', 1)
ci_path.write_text(ci, encoding='utf-8')


# 4) Stable main now produces release artifacts; develop remains pre-release validation.
replace('.github/workflows/windows-desktop.yml', '    branches: [develop]', '    branches: [main, develop]')
replace('.github/workflows/android-companion.yml', '    branches:\n      - develop\n      - mobile/android-companion-build', '    branches:\n      - main\n      - develop\n      - mobile/android-companion-build')
