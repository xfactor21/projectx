export type UtilityCategory = 'projects' | 'cloud' | 'system'

export type AppSettings = {
  autoOpenPreview: boolean
  showLaunchSplash: boolean
  reduceMotion: boolean
  themeAudio: boolean
  utilityCategory: UtilityCategory
  utilityPosition: { x: number; y: number } | null
}

const KEY = 'projectx.settings.v1'
const defaults: AppSettings = {
  autoOpenPreview: true,
  showLaunchSplash: true,
  reduceMotion: false,
  themeAudio: false,
  utilityCategory: 'projects',
  utilityPosition: null,
}

export function readSettings(): AppSettings {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || '{}') as Partial<AppSettings>
    return {
      autoOpenPreview: typeof value.autoOpenPreview === 'boolean' ? value.autoOpenPreview : defaults.autoOpenPreview,
      showLaunchSplash: typeof value.showLaunchSplash === 'boolean' ? value.showLaunchSplash : defaults.showLaunchSplash,
      reduceMotion: typeof value.reduceMotion === 'boolean' ? value.reduceMotion : defaults.reduceMotion,
      themeAudio: typeof value.themeAudio === 'boolean' ? value.themeAudio : localStorage.getItem('projectx.theme.sound.v1') === 'on',
      utilityCategory: ['projects', 'cloud', 'system'].includes(value.utilityCategory || '') ? value.utilityCategory! : defaults.utilityCategory,
      utilityPosition: value.utilityPosition
        && Number.isFinite(value.utilityPosition.x)
        && Number.isFinite(value.utilityPosition.y)
        ? { x: value.utilityPosition.x, y: value.utilityPosition.y }
        : defaults.utilityPosition,
    }
  } catch { return defaults }
}

export function saveSettings(next: AppSettings): void {
  localStorage.setItem(KEY, JSON.stringify(next))
  localStorage.setItem('projectx.theme.sound.v1', next.themeAudio ? 'on' : 'off')
  applySettings(next)
  window.dispatchEvent(new CustomEvent('projectx:settings-changed', { detail: next }))
}

export function applySettings(settings = readSettings()): void {
  document.documentElement.classList.toggle('projectx-reduce-motion', settings.reduceMotion)
}
