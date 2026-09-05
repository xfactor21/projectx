import { useEffect, useState } from 'react'

const cache = new Map<string, string>()

function comicize(source: string): Promise<string> {
  const cached = cache.get(source)
  if (cached) return Promise.resolve(cached)
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => {
      const size = 520
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context) return reject(new Error('Canvas is unavailable.'))
      const scale = Math.max(size / image.naturalWidth, size / image.naturalHeight)
      const width = image.naturalWidth * scale
      const height = image.naturalHeight * scale
      context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height)
      const pixels = context.getImageData(0, 0, size, size)
      const original = new Uint8ClampedArray(pixels.data)
      const luminance = new Float32Array(size * size)
      for (let index = 0; index < original.length; index += 4) {
        const pixel = index / 4
        luminance[pixel] = original[index] * .299 + original[index + 1] * .587 + original[index + 2] * .114
      }
      const quantize = (value: number) => Math.min(255, Math.round(value / 64) * 64)
      for (let y = 1; y < size - 1; y += 1) {
        for (let x = 1; x < size - 1; x += 1) {
          const pixel = y * size + x
          const index = pixel * 4
          const gx = -luminance[pixel - size - 1] + luminance[pixel - size + 1] - 2 * luminance[pixel - 1] + 2 * luminance[pixel + 1] - luminance[pixel + size - 1] + luminance[pixel + size + 1]
          const gy = -luminance[pixel - size - 1] - 2 * luminance[pixel - size] - luminance[pixel - size + 1] + luminance[pixel + size - 1] + 2 * luminance[pixel + size] + luminance[pixel + size + 1]
          const edge = Math.hypot(gx, gy)
          const dot = (x % 6 < 2 && y % 6 < 2) ? 16 : 0
          if (edge > 115) pixels.data[index] = pixels.data[index + 1] = pixels.data[index + 2] = 14
          else {
            pixels.data[index] = Math.max(0, quantize(original[index] * 1.12) - dot)
            pixels.data[index + 1] = Math.max(0, quantize(original[index + 1] * 1.08) - dot)
            pixels.data[index + 2] = Math.max(0, quantize(original[index + 2] * 1.05) - dot)
          }
        }
      }
      context.putImageData(pixels, 0, 0)
      const result = canvas.toDataURL('image/webp', .88)
      cache.set(source, result)
      resolve(result)
    }
    image.onerror = () => reject(new Error('Artwork could not be transformed.'))
    image.src = source
  })
}

export default function ComicProjectArt({ source, name }: { source: string; name: string }) {
  const [result, setResult] = useState(() => cache.get(source) || source)
  useEffect(() => {
    let active = true
    void comicize(source).then((value) => { if (active) setResult(value) }).catch(() => { if (active) setResult(source) })
    return () => { active = false }
  }, [source])
  return <img src={result} alt={`${name} comic-style artwork`} />
}
