import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'

const read = (path) => fs.readFileSync(path, 'utf8')

test('release version is v3.0 after hardening', () => {
  assert.equal(JSON.parse(read('package.json')).version, '3.0.0')
})

test('desktop Supabase sessions use protected persistence, not localStorage', () => {
  const source = read('src/services/supabase.ts')
  assert.match(source, /desktop\.saveSecureSession/)
  assert.match(source, /desktop\.loadSecureSession/)
  assert.match(source, /desktopSessionStore\(\)/)
  assert.match(source, /localStorage\.removeItem\(SESSION_KEY\)/)
})

test('Windows cloud sessions use native DPAPI rather than a PowerShell subprocess', () => {
  const source = read('src-tauri/src/secure_session.rs')
  const cargo = read('src-tauri/Cargo.toml')
  assert.match(source, /CryptProtectData/)
  assert.match(source, /CryptUnprotectData/)
  assert.match(source, /secure-session\.bin/)
  assert.doesNotMatch(source, /powershell\.exe/i)
  assert.match(cargo, /winapi/)
  assert.match(cargo, /dpapi/)
})

test('desktop cloud session restores before React mounts', () => {
  const source = read('src/main.tsx')
  const restore = source.indexOf('await bootstrapSecureSession()')
  const mount = source.indexOf("createRoot(document.getElementById('root')!)")
  assert.ok(restore >= 0)
  assert.ok(mount > restore)
})

test('Companion connection panel signs into cloud directly', () => {
  const source = read('src/ConnectionCenter.tsx')
  assert.match(source, /signInWithPassword/)
  assert.match(source, /connection-inline-auth/)
  assert.match(source, /projectx:supabase-session-changed/)
  assert.doesNotMatch(source, /Sign in to project\.X Cloud'\}<\/button>\s*\)\s*=>\s*\{\s*setTarget\(null\);\s*window\.dispatchEvent\(new CustomEvent\('projectx:open-utility'/)
})

test('native provider auth uses the stable production API', () => {
  const client = read('src/services/providerConnections.ts')
  const vercel = read('src/services/vercel.ts')
  const cors = read('api/_cors.ts')
  const connect = read('api/provider-connect.ts')
  assert.match(client, /VITE_PROJECTX_API_ORIGIN/)
  assert.match(client, /projectx-tau-six\.vercel\.app/)
  assert.doesNotMatch(client, /projectx-git-develop-xfactor21s-projects\.vercel\.app/)
  assert.match(client, /apiUrl\('\/api\/provider-connect'\)/)
  assert.match(vercel, /apiUrl\('\/api\/vercel-projects'\)/)
  assert.match(cors, /Access-Control-Allow-Origin/)
  assert.match(cors, /tauri:\/\/localhost/)
  assert.match(connect, /requestOrigin\(request\)/)
})

test('ZIP extraction is guarded before Expand-Archive', () => {
  const source = read('src-tauri/src/imports.rs')
  assert.match(source, /validate_zip_archive\(zip_path\)\?;/)
  assert.match(source, /MAX_ZIP_EXTRACTED_BYTES/)
  assert.match(source, /parent traversal/)
  assert.match(source, /compression ratio/)
})

test('Companion ZIP paths are passed explicitly to PowerShell', () => {
  const source = read('src-tauri/src/imports.rs')
  assert.match(source, /PROJECTX_ZIP_PATH/)
  assert.match(source, /PROJECTX_ZIP_DESTINATION/)
  assert.match(source, /\$env:PROJECTX_ZIP_PATH/)
  assert.doesNotMatch(source, /OpenRead\(\$args\[0\]\)/)
  assert.doesNotMatch(source, /Expand-Archive -LiteralPath \$args\[0\]/)
})

test('main is an artifact-producing release branch', () => {
  assert.match(read('.github/workflows/windows-desktop.yml'), /branches: \[main, develop\]/)
  assert.match(read('.github/workflows/android-companion.yml'), /- main\r?\n\s+- develop/)
})

test('orphan projectx gitlink is gone', () => {
  const indexed = execFileSync('git', ['ls-files', '-s', 'projectx'], { encoding: 'utf8' }).trim()
  assert.equal(indexed, '')
})


test('provider UX distinguishes disconnected, expired and unavailable states', () => {
  const client = read('src/services/providerConnections.ts')
  const center = read('src/ConnectionCenter.tsx')
  assert.match(client, /status: connected \? 'connected'/)
  assert.match(client, /'expired'/)
  assert.match(client, /'unavailable'/)
  assert.match(center, /authorization expired/)
  assert.match(center, /service unavailable/)
})

test('native Vercel deployment API uses production origin and native-safe CORS', () => {
  const client = read('src/services/vercel.ts')
  const api = read('api/vercel-projects.ts')
  assert.match(client, /projectx-tau-six\.vercel\.app/)
  assert.doesNotMatch(client, /projectx-git-develop-xfactor21s-projects/)
  assert.match(api, /applyProviderCors/)
  assert.match(api, /\.\/_auth\.js/)
  assert.match(api, /\.\/_provider-store\.js/)
})


test('cloud reconciliation polls without forcing recurring inventory writes', () => {
  const sync = read('src/services/projectCloudSync.ts')
  const worker = read('src/CompanionDesktopWorker.tsx')
  assert.doesNotMatch(sync, /syncWindow/)
  assert.match(worker, /reconcileCloudProjectInventory/)
  assert.match(worker, /CLOUD_RECONCILE_MS = 15_000/)
  assert.match(worker, /if \(reconciled\.changed\) syncedInventory = ''/)
})

test('desktop connection status exposes cloud and local inventory separately', () => {
  const worker = read('src/CompanionDesktopWorker.tsx')
  const center = read('src/ConnectionCenter.tsx')
  assert.match(worker, /cloudProjectCount/)
  assert.match(worker, /localProjectCount/)
  assert.match(center, /Cloud projects/)
  assert.match(center, /Desktop records/)
})
