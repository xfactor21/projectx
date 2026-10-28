import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(path, 'utf8')

test('every environment uses the shared visual hierarchy and project actions', () => {
  const renderer = read('src/ThemeProjectRenderer.tsx')
  assert.match(renderer, /function WorldHeader/)
  assert.match(renderer, /function ProjectActions/)
  assert.match(renderer, /theme-world storefront-street/)
  assert.match(renderer, /theme-world vending-machine/)
  assert.match(renderer, /theme-world comic-book/)
  assert.match(renderer, /theme-world gallery-room/)
  assert.match(renderer, /theme-world xfactor-district/)
  assert.match(renderer, /theme-world planetx-command/)
  assert.match(renderer, /theme-world command-world/)
})

test('the reconstructed themes have distinct authored compositions', () => {
  const renderer = read('src/ThemeProjectRenderer.tsx')
  const styles = read('src/experienceV306.css')
  assert.match(renderer, /comic-spread/)
  assert.match(renderer, /storefront-atmosphere/)
  assert.match(renderer, /ORBITAL NETWORK · NOMINAL/)
  assert.match(styles, /Storefront — authored street/)
  assert.match(styles, /Vending — one coherent machine/)
  assert.match(styles, /Comic — actual panel composition/)
  assert.match(styles, /Gallery — spatial but usable/)
  assert.match(styles, /xFactor — expressive cyberpunk/)
  assert.match(styles, /planet\.X — flagship orbital command/)
})

test('theme selection is visual keyboard-accessible and truthfully remains Beta', () => {
  const picker = read('src/ThemeSwitcher.tsx')
  assert.match(picker, /theme-picker-preview/)
  assert.match(picker, /event\.key === 'Escape'/)
  assert.match(picker, /event\.key !== 'Tab'/)
  assert.match(picker, /aria-labelledby="theme-picker-title"/)
  assert.match(picker, /Environments stay Beta until their visual and hardware acceptance passes are complete/)
})

test('the final visual layer preserves responsive and reduced-motion paths', () => {
  const main = read('src/main.tsx')
  const styles = read('src/experienceV306.css')
  assert.match(main, /experienceV306\.css/)
  assert.match(styles, /@media\(max-width:900px\)/)
  assert.match(styles, /@media\(max-width:680px\)/)
  assert.match(styles, /@media\(prefers-reduced-motion:reduce\)/)
})
