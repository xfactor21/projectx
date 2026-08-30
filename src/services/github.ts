export type GitHubRepo = {
  id: number
  name: string
  full_name: string
  html_url: string
  homepage: string | null
  description: string | null
  language: string | null
  topics: string[]
  stargazers_count: number
  forks_count: number
  open_issues_count: number
  archived: boolean
  fork: boolean
  default_branch: string
  pushed_at: string
  updated_at: string
  owner?: { login: string }
}

import { loadSession } from './supabase'

export const GITHUB_DISCOVERY_EVENT = 'projectx:github-discovery'

const PROJECT_STORAGE_KEY = 'projectx.projects.v1'
const LOCAL_SOURCE_KEY = 'projectx.local.sources.v1'

const githubHeaders = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
}

function repoKey(url: string) {
  return url.toLowerCase().replace(/\.git$/i, '').replace(/\/$/, '')
}

function trackedRepoKeys(): Set<string> {
  try {
    const projects = JSON.parse(localStorage.getItem(PROJECT_STORAGE_KEY) || '[]') as Array<{ id?: string; repoUrl?: string; archived?: boolean }>
    const sources = JSON.parse(localStorage.getItem(LOCAL_SOURCE_KEY) || '[]') as Array<{ projectId?: string; path?: string }>
    if (!Array.isArray(projects) || !Array.isArray(sources)) return new Set()
    const locallyInstalled = new Set(sources.filter((source) => source.path).map((source) => source.projectId))
    const requireLocalInstall = Boolean(window.projectXDesktop)
    return new Set(projects
      .filter((project) => !requireLocalInstall || project.archived || locallyInstalled.has(project.id))
      .map((project) => project.repoUrl || '')
      .filter(Boolean)
      .map(repoKey))
  } catch {
    return new Set()
  }
}

async function requestPublicRepos(owner: string): Promise<GitHubRepo[]> {
  const cleanOwner = owner.trim()
  if (!cleanOwner) throw new Error('GitHub owner is required.')

  const response = await fetch(
    `https://api.github.com/users/${encodeURIComponent(cleanOwner)}/repos?per_page=100&sort=updated&type=owner`,
    { headers: githubHeaders },
  )

  if (!response.ok) {
    const rateRemaining = response.headers.get('x-ratelimit-remaining')
    if (response.status === 403 && rateRemaining === '0') {
      throw new Error('GitHub public API rate limit reached. Try again later.')
    }
    if (response.status === 404) throw new Error(`GitHub user “${cleanOwner}” was not found.`)
    throw new Error(`GitHub sync failed (${response.status}).`)
  }

  const repos = await response.json() as GitHubRepo[]
  return repos.filter((repo) => !repo.fork)
}

async function requestConnectedRepos(owner: string): Promise<GitHubRepo[] | null> {
  const session = loadSession()
  if (!session) return null
  try {
    const response = await fetch('/api/provider-resources?provider=github', { headers: { Authorization: `Bearer ${session.access_token}` } })
    const body = await response.json() as { resources?: GitHubRepo[] }
    if (!response.ok || !Array.isArray(body.resources)) return null
    const normalized = owner.trim().toLowerCase()
    return body.resources.filter((repo) => !repo.fork && repo.owner?.login.toLowerCase() === normalized)
  } catch { return null }
}

/**
 * Sync intentionally returns only repositories that are already represented in
 * project.X. Discovery is emitted separately so a GitHub account with many
 * experiments cannot silently flood the user's curated project workspace.
 */
export async function fetchPublicRepos(owner: string): Promise<GitHubRepo[]> {
  const repos = await requestConnectedRepos(owner) || await requestPublicRepos(owner)
  const tracked = trackedRepoKeys()
  const existing = repos.filter((repo) => tracked.has(repoKey(repo.html_url)))
  const discovered = repos.filter((repo) => !tracked.has(repoKey(repo.html_url)))

  window.dispatchEvent(new CustomEvent<GitHubRepo[]>(GITHUB_DISCOVERY_EVENT, { detail: discovered }))
  return existing
}

export async function discoverPublicRepos(owner: string): Promise<GitHubRepo[]> {
  return await requestConnectedRepos(owner) || requestPublicRepos(owner)
}

export function repoNameFromUrl(repoUrl: string) {
  try {
    const url = new URL(repoUrl)
    if (url.hostname !== 'github.com') return null
    const parts = url.pathname.split('/').filter(Boolean)
    if (parts.length < 2) return null
    return `${parts[0]}/${parts[1].replace(/\.git$/i, '')}`
  } catch {
    return null
  }
}

export async function fetchRepoByFullName(fullName: string): Promise<GitHubRepo> {
  const response = await fetch(`https://api.github.com/repos/${fullName}`, { headers: githubHeaders })
  if (!response.ok) throw new Error(`Unable to load ${fullName} from GitHub.`)
  return response.json() as Promise<GitHubRepo>
}

export function relativeDate(isoDate: string) {
  const timestamp = new Date(isoDate).getTime()
  if (!Number.isFinite(timestamp)) return 'Unknown'
  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60000))
  if (minutes < 2) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.round(days / 30)
  if (months < 12) return `${months}mo ago`
  return `${Math.round(months / 12)}y ago`
}
