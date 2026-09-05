import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const read = (path) => fs.readFileSync(path, 'utf8')

test('remote actions use guarded RPC transitions', () => {
  const companion = read('src/services/companion.ts')
  const migration = read('supabase/migrations/20260905_projectx_remote_action_protocol.sql')
  assert.match(companion, /projectx_approve_remote_action/)
  assert.match(companion, /projectx_start_remote_action/)
  assert.match(companion, /projectx_finish_remote_action/)
  assert.match(migration, /drop policy if exists "projectx_remote_actions_update_own"/)
  assert.match(migration, /requested_by_device_id = p_requesting_device_id/)
  assert.match(migration, /target_device_id = p_target_device_id/)
})

test('cloud sync tracks tombstones and detects conflicts', () => {
  const sync = read('src/services/projectCloudSync.ts')
  assert.match(sync, /SYNC_STATE_KEY/)
  assert.match(sync, /deletedIds/)
  assert.match(sync, /deleteCloudProject/)
  assert.match(sync, /remoteChanged/)
  assert.match(sync, /conflicts\.push/)
})

test('Android ZIP handoff refreshes auth and accepts Android ZIP MIME types', () => {
  const packages = read('src/services/companionPackages.ts')
  const app = read('src/CompanionApp.tsx')
  assert.match(packages, /getFreshSession/)
  assert.match(packages, /'Content-Type': 'application\/zip'/)
  assert.match(app, /application\/x-zip-compressed/)
  assert.match(app, /application\/octet-stream/)
})
