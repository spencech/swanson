import { getGitHubAuth } from './store'
import { listOrgRepos } from './github-api'
import { ensureValidGitHubToken } from './github-auth'
import type { Repository } from './github-api'

const TEACHUPBEAT_ORG = 'TeachUpbeat'

/**
 * Load repositories from TeachUpbeat organization
 */
export async function loadRepositories(): Promise<Repository[]> {
  const auth = getGitHubAuth()
  if (!auth?.accessToken) {
    throw new Error('GitHub not connected')
  }

  // Ensure token is fresh before making API call
  await ensureValidGitHubToken()

  const repos = await listOrgRepos(TEACHUPBEAT_ORG)
  return repos.filter((r) => !r.archived)
}

/**
 * Format repository list for Claude system prompt injection
 */
export function formatRepoContext(repos: Repository[]): string {
  if (repos.length === 0) {
    return 'No repositories available.'
  }

  const repoList = repos
    .map((repo) => {
      const parts = [
        `- **${repo.full_name}**`,
        repo.description ? `  ${repo.description}` : null,
        `  Language: ${repo.language || 'N/A'}`,
        `  Default branch: ${repo.default_branch}`,
        `  URL: ${repo.html_url}`,
      ]
        .filter(Boolean)
        .join('\n')
      return parts
    })
    .join('\n\n')

  return `You have read-only access to ${repos.length} repository/repositories in the TeachUpbeat organization:

${repoList}

Note: You can reference these repositories in your responses, but you cannot push branches, create PRs, or modify repository contents.`
}
