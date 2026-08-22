import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

const source = new URL('../src-tauri/icons/icon-data.txt', import.meta.url)
const target = new URL('../src-tauri/icons/icon.ico', import.meta.url)

try {
  const base64 = (await readFile(source, 'utf8')).trim()
  if (!base64) process.exit(0)
  await mkdir(dirname(target.pathname), { recursive: true })
  await writeFile(target, Buffer.from(base64, 'base64'))
} catch (error) {
  if (error?.code !== 'ENOENT') throw error
}
