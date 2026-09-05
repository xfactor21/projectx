import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = resolve(import.meta.dirname, '..')
const basename = 'projectX-09.05-v3.0-immersive-hardening'
const artifactsDir = join(root, 'artifacts')
const outputZip = join(artifactsDir, `${basename}-source.zip`)

const status = spawnSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: root, encoding: 'utf8' })
if (status.status !== 0) throw new Error(status.stderr || 'Unable to verify the Git worktree.')
if (status.stdout.trim()) throw new Error('Commit the v3.0 source changes before creating the source archive.')

mkdirSync(artifactsDir, { recursive: true })
rmSync(outputZip, { force: true })
const archive = spawnSync('git', [
  'archive',
  '--format=zip',
  `--prefix=${basename}/`,
  `--output=${outputZip}`,
  'HEAD',
], { cwd: root, encoding: 'utf8' })
if (archive.status !== 0 || !existsSync(outputZip)) throw new Error(archive.stderr || archive.stdout || 'Unable to create source ZIP.')
console.log(`Source ZIP: ${outputZip}`)
