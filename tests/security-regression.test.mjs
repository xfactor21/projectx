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

test('protected desktop session paths are passed explicitly to PowerShell', () => {
  const source = read('src-tauri/src/secure_session.rs')
  assert.match(source, /PROJECTX_SESSION_PATH/)
  assert.match(source, /\$env:PROJECTX_SESSION_PATH/)
  assert.doesNotMatch(source, /ReadAllBytes\(\$args\[0\]\)/)
  assert.doesNotMatch(source, /WriteAllBytes\(\$args\[0\]/)
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
