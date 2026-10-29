import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(path, 'utf8')

test('every environment uses only the four command tools on its primary surface', () => {
  const renderer = read('src/ThemeProjectRendererV307.tsx')
  assert.match(renderer, />Run</)
  assert.match(renderer, />Git</)
  assert.match(renderer, />Files</)
  assert.match(renderer, />Workbook</)
  assert.doesNotMatch(renderer, /Open details|>Deploy<|ProjectStatusBar|project\.description/)
  assert.match(read('src/WorkspaceAppV3.tsx'), /ThemeProjectRendererV307/)
})

test('theme titles are compact and the removed promotional header does not return', () => {
  const renderer = read('src/ThemeProjectRendererV307.tsx')
  assert.match(renderer, /function Title/)
  assert.doesNotMatch(renderer, /PROJECT\.X COMMAND|A focused operational view|WorldHeader/)
})

test('planet.X selection pauses worlds and xFactor is a city with air traffic', () => {
  const renderer = read('src/ThemeProjectRendererV307.tsx')
  const styles = read('src/experienceV307.css')
  assert.match(renderer, /has-selection/)
  assert.match(renderer, /selectedId===project\.id\?onOpen/)
  assert.match(styles, /animation-play-state:paused/)
  assert.match(styles, /black-hole-burst/)
  assert.match(renderer, /xfactor-skyline/)
  assert.match(renderer, /xfactor-air-traffic/)
})

test('settings is a readable control center and mobile preview verifies LAN binding', () => {
  const settings = read('src/SettingsPanelV307.tsx')
  const rust = read('src-tauri/src/dev_preview.rs')
  const companion = read('src/CompanionApp.tsx')
  assert.match(settings, /settings-choice-grid/)
  assert.match(settings, /Environment audio/)
  assert.match(rust, /did not accept connections on its LAN address/)
  assert.match(rust, /is_reachable/)
  assert.match(companion, /Open live preview/)
  assert.match(companion, /Capacitor.*Plugins.*Browser/s)
})
