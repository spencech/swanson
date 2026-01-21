import { getGitHubAuth } from './store'
import { listOrgRepos } from './github-api'
import { ensureValidGitHubToken } from './github-auth'
import type { Repository } from './github-api'
import { getRepoPath } from './git-ops'

const TEACHUPBEAT_ORG = 'TeachUpbeat'

// Repository classification
export const AUTOMATIC_REPOS = [
  { name: 'upbeat-aws-infrastructure', url: 'https://github.com/TeachUpbeat/upbeat-aws-infrastructure.git' },
  { name: 'upbeat-engagement-database', url: 'https://github.com/TeachUpbeat/engagement-database.git' },
]

export const SELECTABLE_REPOS = [
  { name: 'upbeat-admin-portal', url: 'https://github.com/TeachUpbeat/administrator-portal.git' },
  { name: 'upbeat-district-administration', url: 'https://github.com/TeachUpbeat/district-administrator.git' },
  { name: 'upbeat-reports', url: 'https://github.com/TeachUpbeat/reports-2.0.git' },
  { name: 'upbeat-survey-administration', url: 'https://github.com/TeachUpbeat/upbeat-survey-administration.git' },
  { name: 'upbeat-survey-editor', url: 'https://github.com/TeachUpbeat/survey-administrator.git' },
  { name: 'upbeat-user-administration', url: 'https://github.com/TeachUpbeat/user-administrator.git' },
  { name: 'upbeat-survey-legacy', url: 'https://github.com/TeachUpbeat/survey.git' },
  { name: 'upbeat-pdf-generator', url: 'https://github.com/TeachUpbeat/pdf-generator.git' },
  { name: 'upbeat-presentation-generator', url: 'https://github.com/TeachUpbeat/google-presentations.git' },
]

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
 * Get repository metadata (description) from GitHub API
 */
export async function getRepoMetadata(repoName: string): Promise<string | null> {
  try {
    const repos = await loadRepositories()
    const repo = repos.find((r) => {
      // Match by name or full name
      const nameMatch = r.name.toLowerCase() === repoName.toLowerCase() || 
                       r.name.toLowerCase().replace(/-/g, '') === repoName.toLowerCase().replace(/-/g, '')
      const fullNameMatch = r.full_name.toLowerCase().includes(repoName.toLowerCase())
      return nameMatch || fullNameMatch
    })
    return repo?.description || null
  } catch (error) {
    return null
  }
}

/**
 * Format repo context for Claude with local paths
 */
export function formatRepoContextWithPaths(
  checkedOutRepos: Array<{ name: string; path: string; description?: string }>,
  metadataOnlyRepos: Repository[],
  isUnsure: boolean
): string {
  const parts: string[] = []

  if (checkedOutRepos.length > 0) {
    parts.push(`## Local Repository Workspace

The following repositories have been checked out to your local filesystem on the \`develop\` branch:

${checkedOutRepos.map((r) => {
  const desc = r.description ? ` - ${r.description}` : ''
  return `- **${r.name}**: \`${r.path}\`${desc}`
}).join('\n')}

**Infrastructure & Database repos are always available** for any features requiring:
- AWS infrastructure changes (Lambda, CloudFormation, Cognito, etc.)
- Database schema changes (MySQL stored procedures, migrations, etc.)

You can read files directly from these paths to understand existing code structure.`)
  }

  if (isUnsure && metadataOnlyRepos.length > 0) {
    parts.push(`## Repository Selection Guidance

The user was unsure which repositories are needed for their request. Use the repository descriptions below and the GitHub API (if needed) to determine which repositories should be included in the spawnee plan:

${metadataOnlyRepos.map((r) => {
  const desc = r.description ? ` - ${r.description}` : ''
  return `- **${r.name}** (${r.full_name})${desc}`
}).join('\n')}

Analyze the user's request and identify which repositories will need changes.`)
  }

  return parts.join('\n\n')
}

/**
 * Format repository list for Claude system prompt injection (legacy, for backward compatibility)
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
