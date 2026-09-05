import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const workspace = fs.readFileSync('src/WorkspaceAppV3.tsx', 'utf8')
const environment = fs.readFileSync('src/ThemeEnvironmentLayer.tsx', 'utf8')
const sensory = fs.readFileSync('src/ThemeSensoryLayer.tsx', 'utf8')
const css = fs.readFileSync('src/phase2Themes.css', 'utf8')
const version = fs.readFileSync('src/version.ts', 'utf8')

test('theme overhaul keeps v2.9 while introducing xFactor and planet.X', () => {
  assert.match(version, /2\.9\.0/)
  assert.match(workspace, /label:'xFactor'/)
  assert.match(workspace, /label:'planet\.X'/)
  assert.match(workspace, /raw==='Neon'\?'XFactor'/)
  assert.match(workspace, /raw==='Orbit'\?'PlanetX'/)
})

test('immersive themes extend into the application shell', () => {
  assert.match(css, /data-projectx-theme="xfactor".*v2-sidebar/s)
  assert.match(css, /data-projectx-theme="planetx".*v2-topbar/s)
  assert.match(environment, /xfactor-graffiti/)
  assert.match(environment, /planetx-ring outer/)
})

test('theme audio remains optional and has dedicated branded cues', () => {
  assert.match(sensory, /theme==='XFactor'/)
  assert.match(sensory, /theme==='PlanetX'/)
  assert.match(sensory, /SOUND_KEY/)
})
