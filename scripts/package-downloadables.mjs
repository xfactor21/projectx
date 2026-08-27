import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = resolve(import.meta.dirname, '..')
const basename = 'projectX_8-27_v2.5'
const targetDir = process.env.CARGO_TARGET_DIR ? resolve(process.env.CARGO_TARGET_DIR) : join(root, 'src-tauri', 'target')
const bundleDir = join(targetDir, 'release', 'bundle', 'nsis')
const artifactsDir = join(root, 'artifacts')
const stagingDir = join(root, '.artifact-staging', basename)
const outputExe = join(artifactsDir, `${basename}.exe`)
const outputZip = join(artifactsDir, `${basename}-windows.zip`)

if (!existsSync(bundleDir)) throw new Error('The NSIS bundle directory does not exist. Build the v2.5 installer first.')
const installers = readdirSync(bundleDir)
  .filter((name) => /^project\.X_2\.5\.0_x64-setup\.exe$/i.test(name))
  .map((name) => join(bundleDir, name))
if (installers.length !== 1) throw new Error(`Expected exactly one project.X 2.5.0 NSIS installer, found ${installers.length}.`)
if (statSync(installers[0]).size < 1_000_000) throw new Error('The NSIS installer is unexpectedly small and will not be packaged.')

rmSync(stagingDir, { recursive: true, force: true })
mkdirSync(stagingDir, { recursive: true })
mkdirSync(artifactsDir, { recursive: true })
rmSync(outputExe, { force: true })
rmSync(outputZip, { force: true })
cpSync(installers[0], outputExe)
cpSync(outputExe, join(stagingDir, `${basename}.exe`))

const stagedNames = readdirSync(stagingDir)
if (stagedNames.some((name) => /(^|\.)env($|\.)|secret|credential|token/i.test(name))) {
  throw new Error('Packaging stopped because a secret-bearing filename entered staging.')
}

const archive = spawnSync('powershell.exe', [
  '-NoProfile', '-NonInteractive', '-Command',
  'Compress-Archive -LiteralPath $env:PROJECTX_STAGE -DestinationPath $env:PROJECTX_ZIP -CompressionLevel Optimal -Force',
], {
  cwd: root,
  encoding: 'utf8',
  env: { ...process.env, PROJECTX_STAGE: stagingDir, PROJECTX_ZIP: outputZip },
})
if (archive.status !== 0 || !existsSync(outputZip)) throw new Error(archive.stderr || archive.stdout || 'Unable to create delivery ZIP.')

console.log(`Installer: ${outputExe}`)
console.log(`Windows ZIP: ${outputZip}`)
