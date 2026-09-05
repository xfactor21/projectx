import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const workspace=fs.readFileSync('src/WorkspaceAppV3.tsx','utf8')
const storage=fs.readFileSync('src/services/projectStorage.ts','utf8')

test('Activity uses cloud events with a local fallback',()=>{
  assert.match(workspace,/fetchCloudActivity\(cloudState\.session,100\)/)
  assert.match(workspace,/cloudActivity\.map/)
  assert.match(workspace,/LOCAL FALLBACK/)
})

test('run and delete activity refresh the cloud-backed Activity view',()=>{
  assert.match(workspace,/project\.run\.succeeded/)
  assert.match(workspace,/project\.run\.failed/)
  assert.match(storage,/projectx:activity-changed/)
})
