const SOURCE_PRODUCT = 'project-x'
const SOURCE_SURFACE = 'web-app'
const SESSION_KEY = 'planetx_analytics_session'
const ANONYMOUS_KEY = 'planetx_analytics_anonymous'

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
}
