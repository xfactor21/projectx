import { getDesktopHost } from './desktop'

export async function openHostedLink(value: string): Promise<void> {
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) throw new Error('Only hosted HTTP and HTTPS links can be opened.')
  const desktop = getDesktopHost()
  if (desktop) {
    await desktop.openExternalUrl(url.toString())
    return
  }
  const anchor = document.createElement('a')
  anchor.href = url.toString()
  anchor.target = '_blank'
  anchor.rel = 'noopener noreferrer'
  anchor.click()
}
