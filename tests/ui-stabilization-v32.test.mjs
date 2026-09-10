import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const worker = fs.readFileSync(new URL('../src/CompanionDesktopWorker.tsx', import.meta.url), 'utf8')
const center = fs.readFileSync(new URL('../src/ConnectionCenter.tsx', import.meta.url), 'utf8')
const css = fs.readFileSync(new URL('../src/uxStabilizationV32.css', import.meta.url), 'utf8')
const main = fs.readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8')

test('desktop distinguishes its own cloud heartbeat from Android Companion presence', () => {
  assert.match(worker, /listCompanionDevices/)
  assert.match(worker, /device\.platform !== 'windows'/)
  assert.match(worker, /companionConnected/)
  assert.match(worker, /Companion is not currently connected/)
  assert.doesNotMatch(worker, /publishHostStatus\('online', `Companion connected\./)
})

test('connection center exposes separate Cloud Windows and Companion states', () => {
  assert.match(center, /Cloud access/)
  assert.match(center, /Windows host/)
  assert.match(center, /Companion/)
  assert.match(center, /NOT CONNECTED/)
  assert.match(center, /companionLastSeenAt/)
})

test('all seven environment selectors are forced visible', () => {
  assert.match(css, /grid-template-columns:repeat\(7,minmax\(92px,1fr\)\)!important/)
  assert.match(css, /\.workspace-v3 \.v2-theme-deck button\{[\s\S]*display:grid!important/)
  assert.match(css, /visibility:visible!important/)
})

test('stabilization stylesheet is loaded last', () => {
  const stabilization = main.indexOf("import './uxStabilizationV32.css'")
  const previous = main.indexOf("import './environmentIsolationV31.css'")
  assert.ok(stabilization > previous)
})

test('connection auth fields are constrained and responsive', () => {
  assert.match(css, /\.connection-inline-auth input\{[\s\S]*width:100%!important/)
  assert.match(css, /max-width:100%!important/)
  assert.match(css, /@media\(max-width:620px\)/)
})
