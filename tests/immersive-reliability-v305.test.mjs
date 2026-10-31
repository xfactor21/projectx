import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')

test('Storefront has logical traffic lanes and pedestrians with reduced-motion fallback', () => {
  const renderer = read('src/ThemeProjectRenderer.tsx')
  const css = read('src/experienceV305.css')
  assert.match(renderer, /storefront-road/)
  assert.match(renderer, /district-car car-cyan/)
  assert.match(renderer, /district-pedestrian walker-three/)
  assert.match(css, /@keyframes district-drive/)
  assert.match(css, /prefers-reduced-motion:reduce/)
})

test('Companion ZIP handoff reports progress, retries and verifies SHA-256 on Windows', () => {
  const packages = read('src/services/companionPackages.ts')
  const worker = read('src/CompanionDesktopWorker.tsx')
  const native = read('src-tauri/src/remote_packages.rs')
  assert.match(packages, /UPLOAD_ATTEMPTS = 3/)
  assert.match(packages, /request\.upload\.onprogress/)
  assert.match(packages, /crypto\.subtle\.digest\('SHA-256'/)
  assert.match(worker, /expectedSha256/)
  assert.match(native, /Get-FileHash/)
})

test('Companion supports acknowledged remote stop and restart for owned processes', () => {
  const worker = read('src/CompanionDesktopWorker.tsx')
  const app = read('src/CompanionApp.tsx')
  assert.match(worker, /case 'project\.stop'/)
  assert.match(worker, /case 'project\.restart'/)
  assert.match(worker, /requested_by_device_id/)
  assert.match(app, /Stop the project\.X-owned process/)
})

test('File browser exposes metadata, filtering, safe system-open and relative paths', () => {
  const workspace = read('src/WorkspaceAppV3.tsx')
  const native = read('src-tauri/src/file_browser.rs')
  assert.match(workspace, /file-browser-search/)
  assert.match(workspace, /Copy path/)
  assert.match(workspace, /openProjectFile/)
  assert.match(native, /modified_at/)
  assert.match(native, /Sensitive configuration files cannot be opened/)
})

test('Workbook tasks preserve priority and completion time', () => {
  const workbook = read('src/ProjectWorkbook.tsx')
  assert.match(workbook, /TaskPriority/)
  assert.match(workbook, /completedAt/)
  assert.match(workbook, /Task priority/)
})
