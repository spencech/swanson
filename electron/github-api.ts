import { ensureValidGitHubToken } from './github-auth'

export interface GitHubUser {
  login: string
  name: string
  avatar_url: string
  email?: string
}

export interface Repository {
  id: number
  name: string
  full_name: string
  description: string | null
  private: boolean
  archived: boolean
  html_url: string
  default_branch: string
  language: string | null
  updated_at: string
}

/**
 * Make authenticated GitHub API request with automatic token refresh
 */
async function githubRequest<T>(endpoint: string): Promise<T> {
  const token = await ensureValidGitHubToken()

  const response = await fetch(`https://api.github.com${endpoint}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
    },
  })

  // Handle 401 by attempting refresh
  if (response.status === 401) {
    // Try refreshing token once
    const refreshedToken = await ensureValidGitHubToken()
    const retryResponse = await fetch(`https://api.github.com${endpoint}`, {
      headers: {
        Authorization: `Bearer ${refreshedToken}`,
        Accept: 'application/vnd.github.v3+json',
      },
    })

    if (!retryResponse.ok) {
      throw new Error(`GitHub API error: ${retryResponse.statusText}`)
    }

    return retryResponse.json()
  }

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.statusText}`)
  }

  return response.json()
}

/**
 * Get authenticated GitHub user
 */
export async function getAuthenticatedUser(): Promise<GitHubUser> {
  return githubRequest<GitHubUser>('/user')
}

/**
 * List repositories for an organization
 */
export async function listOrgRepos(org: string): Promise<Repository[]> {
  const repos: Repository[] = []
  let page = 1
  const perPage = 100

  while (true) {
    const response = await githubRequest<Repository[]>(`/orgs/${org}/repos?per_page=${perPage}&page=${page}`)
    
    if (response.length === 0) {
      break
    }

    repos.push(...response)
    
    if (response.length < perPage) {
      break
    }
    
    page++
  }

  return repos
}

/**
 * Get repository details
 */
export async function getRepoDetails(owner: string, repo: string): Promise<Repository> {
  return githubRequest<Repository>(`/repos/${owner}/${repo}`)
}
