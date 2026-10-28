import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (path) => fs.readFileSync(path, 'utf8')
const workspace = read('src/WorkspaceAppV3.tsx')
const switcher = read('src/ThemeSwitcher.tsx')
const density = read('src/desktopDensityV303.css')
const preview = read('src/EmbeddedPreview.tsx')
const version = read('src/version.ts')

test('v3.03 workspace uses the compact invisible utility header', () => {
  assert.match(workspace, /desktop-utility-header/)
  assert.match(workspace, /Your project universe\./)
  assert.match(workspace, />\+ Project</)
  assert.match(workspace, /https:\/\/planet-x\.co\/store/)
  assert.doesNotMatch(workspace, /workspace-brand-banner/)
  assert.doesNotMatch(workspace, /More planet\.X Magic/)
})

test('theme controls are a Beta popup instead of permanent workspace deck', () => {
  assert.match(workspace, /environment-trigger/)
  assert.match(workspace, /themePickerOpen/)
  assert.match(switcher, /role="dialog"/)
  assert.match(switcher, /BETA/)
  assert.doesNotMatch(workspace, /<ThemeSwitcher items=\{themes\} value=\{theme\} onChange/)
})

test('Command environment is a compact two-column desktop grid', () => {
  assert.match(density, /\.workspace-v3 \.command-project-grid\{[\s\S]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/)
  assert.match(density, /grid-template-columns:150px minmax\(0,1fr\)!important/)
  assert.match(density, /min-height:224px!important/)
})

test('project overlays keep workspace context visible', () => {
  assert.match(density, /\.v2-detail-backdrop,.settings-backdrop,.connection-backdrop\{background:rgba\(2,3,7,.48\)!important;backdrop-filter:blur\(4px\)!important\}/)
  assert.match(density, /\.v2-detail\{width:min\(390px,88vw\)!important/)
})

test('Preview exposes an explicit native fallback for sites that block framing', () => {
  assert.match(preview, /Some dev servers block iframe embedding/)
  assert.match(preview, /Open native preview/)
  assert.match(preview, /openExternalPreview\(preview\.url\)/)
})

test('v3.03 identity is present', () => {
  assert.match(version, /APP_VERSION = '3\.03'/)
  assert.match(version, /APP_SEMVER = '3\.0\.3'/)
  assert.match(version, /BUILD_DATE_TAG = 'Oct-28'/)
})
