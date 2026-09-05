import test from 'node:test'
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
  assert.match(read('.github/workflows/android-companion.yml'), /- main\r?\n\s+- develop/)
})

test('orphan projectx gitlink is gone', () => {
  const indexed = execFileSync('git', ['ls-files', '-s', 'projectx'], { encoding: 'utf8' }).trim()
  assert.equal(indexed, '')
})
