import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const targetUrl = new URL('../src-tauri/icons/icon.ico', import.meta.url)
const target = fileURLToPath(targetUrl)
const size = 64
const xorBytes = size * size * 4
const andStride = Math.ceil(size / 32) * 4
const andBytes = andStride * size
const imageBytes = 40 + xorBytes + andBytes
const file = Buffer.alloc(6 + 16 + imageBytes)

file.writeUInt16LE(0, 0)
file.writeUInt16LE(1, 2)
file.writeUInt16LE(1, 4)
file.writeUInt8(size, 6)
file.writeUInt8(size, 7)
file.writeUInt8(0, 8)
file.writeUInt8(0, 9)
file.writeUInt16LE(1, 10)
file.writeUInt16LE(32, 12)
file.writeUInt32LE(imageBytes, 14)
file.writeUInt32LE(22, 18)

const dib = 22
file.writeUInt32LE(40, dib)
file.writeInt32LE(size, dib + 4)
file.writeInt32LE(size * 2, dib + 8)
file.writeUInt16LE(1, dib + 12)
file.writeUInt16LE(32, dib + 14)
file.writeUInt32LE(0, dib + 16)
file.writeUInt32LE(xorBytes, dib + 20)
file.writeInt32LE(0, dib + 24)
file.writeInt32LE(0, dib + 28)
file.writeUInt32LE(0, dib + 32)
file.writeUInt32LE(0, dib + 36)

const pixelStart = dib + 40
const center = (size - 1) / 2

function mix(a, b, t) {
  return Math.round(a + (b - a) * t)
}

for (let y = 0; y < size; y += 1) {
  for (let x = 0; x < size; x += 1) {
    const dx = x - center
    const dy = y - center
    const radius = Math.hypot(dx, dy)
    const diagA = Math.abs(x - y)
    const diagB = Math.abs(x + y - (size - 1))
    const onX = (diagA < 6 || diagB < 6) && radius < 29
    const onPlate = radius < 30

    let r = 0
    let g = 0
    let b = 0
    let a = 0

    if (onPlate) {
      r = 7
      g = 9
      b = 15
      a = 245
    }

    if (onX) {
      const t = Math.max(0, Math.min(1, x / (size - 1)))
      if (t < 0.5) {
        const u = t * 2
        r = mix(255, 150, u)
        g = mix(43, 76, u)
        b = mix(166, 255, u)
      } else {
        const u = (t - 0.5) * 2
        r = mix(150, 41, u)
        g = mix(76, 224, u)
        b = 255
      }
      a = 255
    }

    const row = size - 1 - y
    const offset = pixelStart + (row * size + x) * 4
    file[offset] = b
    file[offset + 1] = g
    file[offset + 2] = r
    file[offset + 3] = a
  }
}

const maskStart = pixelStart + xorBytes
for (let y = 0; y < size; y += 1) {
  const row = size - 1 - y
  for (let x = 0; x < size; x += 1) {
    const radius = Math.hypot(x - center, y - center)
    if (radius >= 30) {
      const byteIndex = maskStart + row * andStride + Math.floor(x / 8)
      file[byteIndex] |= 0x80 >> (x % 8)
    }
  }
}

await mkdir(dirname(target), { recursive: true })
await writeFile(target, file)
console.log(`Generated Windows-compatible project.X icon (${file.length} bytes).`)
