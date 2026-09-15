const SOURCE_PRODUCT = 'project-x'
const SOURCE_SURFACE = 'web-app'
const SESSION_KEY = 'planetx_analytics_session'
const ANONYMOUS_KEY = 'planetx_analytics_anonymous'

const ACTION_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  [/\b(new|create|add)\b.*\bproject\b|\bproject\b.*\b(new|create|add)\b/i, 'project_create_clicked'],
  [/\b(import|upload)\b/i, 'project_import_clicked'],
  [/\b(export|download|backup)\b/i, 'project_export_clicked'],
  [/\b(deploy|publish)\b/i, 'deployment_started'],
  [/\b(preview|run project|launch)\b/i, 'project_preview_started'],
]

function storedId(storage: Storage, key: string) {
  const existing = storage.getItem(key)
  if (existing) return existing
  const value = crypto.randomUUID()
  storage.setItem(key, value)
  return value
}

export function trackPlanetXEvent(event: string, properties: Record<string, unknown> = {}) {
  if (!/^https?:$/.test(window.location.protocol)) return
  const payload = {
    event,
    timestamp: new Date().toISOString(),
    source_product: SOURCE_PRODUCT,
    source_surface: SOURCE_SURFACE,
    session_id: storedId(sessionStorage, SESSION_KEY),
    anonymous_user_id: storedId(localStorage, ANONYMOUS_KEY),
    path: `${window.location.pathname}${window.location.search}${window.location.hash}`,
    platform: (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform || navigator.platform || 'web',
    properties: { referrer: document.referrer || '', ...properties },
  }
  void fetch('/api/analytics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => undefined)
}

export function startPlanetXAnalytics() {
  const analyticsWindow = window as Window & { __planetXAnalyticsStarted?: boolean }
  if (analyticsWindow.__planetXAnalyticsStarted) return
  analyticsWindow.__planetXAnalyticsStarted = true
  trackPlanetXEvent('page_view')
  let lastUrl = window.location.href
  const trackNavigation = () => {
    if (window.location.href === lastUrl) return
    lastUrl = window.location.href
    trackPlanetXEvent('page_view')
  }
  window.addEventListener('popstate', trackNavigation)
  window.addEventListener('hashchange', trackNavigation)
  window.addEventListener('planetx:navigate', trackNavigation)
  for (const method of ['pushState', 'replaceState'] as const) {
    const original = history[method]
    history[method] = function (...args: Parameters<History[typeof method]>) {
      const result = original.apply(this, args)
      window.dispatchEvent(new Event('planetx:navigate'))
      return result
    }
  }

  document.addEventListener('click', (event) => {
    const control = (event.target as Element | null)?.closest<HTMLElement>('button,a,[role="button"],[data-analytics-event]')
    if (!control || control.hasAttribute('disabled') || control.getAttribute('aria-disabled') === 'true') return
    const explicit = control.dataset.analyticsEvent
    if (explicit && /^[a-z][a-z0-9_]{2,63}$/.test(explicit)) {
      trackPlanetXEvent(explicit, { control: control.tagName.toLowerCase() })
      return
    }
    const label = [control.getAttribute('aria-label'), control.getAttribute('title'), control.textContent]
      .filter(Boolean).join(' ').replace(/\s+/g, ' ').trim().slice(0, 120)
    const match = ACTION_RULES.find(([pattern]) => pattern.test(label))
    if (match) trackPlanetXEvent(match[1], { control: control.tagName.toLowerCase() })
  }, true)

  window.setTimeout(() => {
    if (document.visibilityState === 'visible') trackPlanetXEvent('session_engaged', { threshold_seconds: 10 })
  }, 10_000)
  window.addEventListener('appinstalled', () => trackPlanetXEvent('app_installed'))
  window.addEventListener('error', () => trackPlanetXEvent('app_error', { category: 'runtime' }))
  window.addEventListener('unhandledrejection', () => trackPlanetXEvent('app_error', { category: 'promise' }))
}
