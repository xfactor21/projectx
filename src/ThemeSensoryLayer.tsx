import { useEffect, useRef, useState } from 'react'

const SOUND_KEY = 'projectx.theme.sound.v1'

type ThemeMode = 'Grid' | 'Storefront' | 'Vending' | 'Comic' | '3D'

function readEnabled() {
  return localStorage.getItem(SOUND_KEY) === 'on'
}

function tone(context: AudioContext, frequency: number, at: number, duration: number, gainValue: number, type: OscillatorType = 'sine') {
  const oscillator = context.createOscillator()
  const gain = context.createGain()
  oscillator.type = type
  oscillator.frequency.setValueAtTime(frequency, at)
  gain.gain.setValueAtTime(0.0001, at)
  gain.gain.exponentialRampToValueAtTime(gainValue, at + 0.015)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration)
  oscillator.connect(gain).connect(context.destination)
  oscillator.start(at)
  oscillator.stop(at + duration + 0.03)
}

function noiseBurst(context: AudioContext, at: number, duration: number, gainValue: number) {
  const length = Math.max(1, Math.floor(context.sampleRate * duration))
  const buffer = context.createBuffer(1, length, context.sampleRate)
  const data = buffer.getChannelData(0)
  for (let index = 0; index < length; index += 1) data[index] = (Math.random() * 2 - 1) * (1 - index / length)
  const source = context.createBufferSource()
  const gain = context.createGain()
  const filter = context.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = 1250
  filter.Q.value = 1.8
  gain.gain.value = gainValue
  source.buffer = buffer
  source.connect(filter).connect(gain).connect(context.destination)
  source.start(at)
}

function playThemeCue(context: AudioContext, theme: ThemeMode) {
  const now = context.currentTime + 0.015
  if (theme === 'Storefront') {
    tone(context, 880, now, .52, .06, 'sine')
    tone(context, 1320, now + .13, .72, .045, 'sine')
    tone(context, 1760, now + .26, .55, .028, 'sine')
    return
  }
  if (theme === 'Vending') {
    tone(context, 190, now, .08, .045, 'square')
    tone(context, 640, now + .09, .11, .05, 'square')
    tone(context, 980, now + .2, .13, .045, 'square')
    return
  }
  if (theme === 'Comic') {
    noiseBurst(context, now, .09, .025)
    tone(context, 160, now, .12, .065, 'sawtooth')
    tone(context, 330, now + .045, .16, .035, 'square')
    return
  }
  if (theme === '3D') {
    tone(context, 110, now, 1.15, .035, 'sine')
    tone(context, 220, now + .04, 1.4, .025, 'sine')
    tone(context, 440, now + .18, .9, .018, 'sine')
    return
  }
  tone(context, 440, now, .07, .04, 'square')
  tone(context, 760, now + .075, .08, .025, 'sine')
}

export default function ThemeSensoryLayer() {
  const [enabled, setEnabled] = useState(readEnabled)
  const audioRef = useRef<AudioContext | null>(null)

  async function ensureAudio() {
    if (!audioRef.current) audioRef.current = new AudioContext()
    if (audioRef.current.state === 'suspended') await audioRef.current.resume()
    return audioRef.current
  }

  useEffect(() => {
    const handler = (event: Event) => {
      if (!enabled) return
      const theme = (event as CustomEvent<ThemeMode>).detail
      void ensureAudio().then((context) => playThemeCue(context, theme))
      if ('vibrate' in navigator && (theme === 'Vending' || theme === 'Comic')) navigator.vibrate?.(theme === 'Comic' ? [18, 18, 28] : 20)
    }
    window.addEventListener('projectx:theme-changed', handler)
    return () => window.removeEventListener('projectx:theme-changed', handler)
  }, [enabled])

  async function toggle() {
    const next = !enabled
    setEnabled(next)
    localStorage.setItem(SOUND_KEY, next ? 'on' : 'off')
    if (next) {
      const context = await ensureAudio()
      playThemeCue(context, (localStorage.getItem('projectx.view.v1') || 'Grid') as ThemeMode)
    }
  }

  return <button type="button" className={`theme-sound-toggle ${enabled ? 'on' : ''}`} onClick={() => void toggle()} title="Theme sounds">
    <span>{enabled ? '◉' : '○'}</span><strong>SOUND</strong>
  </button>
}
