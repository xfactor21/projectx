import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (path) => fs.readFileSync(path, 'utf8')
const app = read('src/CompanionApp.tsx')
const css = read('src/companionV302.css')
const onboarding = read('src/CompanionOnboarding.tsx')

test('Companion v3.02 separates Cloud, Windows host and mobile guidance', () => {
  assert.match(app, /companion-connection-banner/)
  assert.match(app, /Cloud account and Windows host are independent connections/)
  assert.match(app, /lastSyncedAt/)
  assert.match(onboarding, /One account keeps the project list in sync/)
  assert.match(onboarding, /Your PC does the local work/)
})

test('Companion project view has explicit PC and cloud filtering', () => {
  assert.match(app, /type ProjectFilter = 'all' \| 'pc' \| 'cloud'/)
  assert.match(app, />On PC</)
  assert.match(app, />Cloud only</)
  assert.match(app, /Remote controls are unavailable while the Windows host is offline/)
})

test('Companion can safely cancel queued actions and retry failed actions', () => {
  assert.match(app, /async function cancelAction/)
  assert.match(app, /updateRemoteAction\(action\.id, 'canceled'/)
  assert.match(app, /async function retryAction/)
  assert.match(app, /action\.status !== 'failed'/)
  assert.match(app, /setActionFilter\('active'\)/)
})

test('Send ZIP has preflight review and separates upload from Windows import', () => {
  assert.match(app, /MAX_PACKAGE_BYTES = 100 \* 1024 \* 1024/)
  assert.match(app, /type PackageStep = 'setup' \| 'review'/)
  assert.match(app, /Review before upload/)
  assert.match(app, /Upload and Windows import are separate stages/)
  assert.match(app, /LAST ZIP HANDOFF/)
})

test('Companion v3.02 meets core mobile accessibility polish', () => {
  assert.match(app, /aria-live="polite"/)
  assert.match(css, /prefers-reduced-motion:reduce/)
  assert.match(css, /focus-visible/)
  assert.match(css, /min-height:44px/)
})
