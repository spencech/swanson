import { exec } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'
import { setClonedRepo, getClonedRepos, setWorkspaceRepoBasePath, getWorkspaceConfig } from './store'
import { logger } from './logger'

const execAsync = promisify(exec)

const REPO_BASE_PATH = path.join(app.getPath('userData'), 'repos')
const DEFAULT_BRANCH = 'develop'

// Ensure repo base path is set in store
if (!getWorkspaceConfig().repoBasePath) {
  setWorkspaceRepoBasePath(REPO_BASE_PATH)
}

interface CloneResult {
  success: boolean
  repoName: string
  localPath: string
  error?: string
}

/**
 * Check if a repo is already cloned locally
 */
export function isRepoCloned(repoName: string): boolean {
  const clonedRepos = getClonedRepos()
  if (!clonedRepos[repoName]) return false
  
  const repoPath = clonedRepos[repoName].path
  return fs.existsSync(repoPath) && fs.existsSync(path.join(repoPath, '.git'))
}

/**
 * Get the local path for a repo
 */
export function getRepoPath(repoName: string): string {
  const clonedRepos = getClonedRepos()
  if (clonedRepos[repoName]) {
    return clonedRepos[repoName].path
  }
  return path.join(REPO_BASE_PATH, repoName)
}

/**
 * Clone a repo or pull latest if already cloned
 * Always checks out 'develop' branch
 */
export async function ensureRepo(repoUrl: string, repoName: string): Promise<CloneResult> {
  const localPath = getRepoPath(repoName)
  const isCloned = isRepoCloned(repoName)

  try {
    // Ensure base directory exists
    if (!fs.existsSync(REPO_BASE_PATH)) {
      fs.mkdirSync(REPO_BASE_PATH, { recursive: true })
      logger.info('GitOps', 'Created repo base directory', { path: REPO_BASE_PATH })
    }

    if (isCloned) {
      // Update existing repo
      logger.info('GitOps', 'Updating existing repo', { repoName, localPath })
      
      try {
        // Fetch latest changes
        await execAsync('git fetch origin', { cwd: localPath })
        
        // Checkout develop branch
        await execAsync('git checkout develop', { cwd: localPath })
        
        // Reset to origin/develop (force update)
        await execAsync('git reset --hard origin/develop', { cwd: localPath })
        
        logger.info('GitOps', 'Repo updated successfully', { repoName })
        setClonedRepo(repoName, localPath)
        
        return {
          success: true,
          repoName,
          localPath,
        }
      } catch (error) {
        // If develop branch doesn't exist, try default branch
        const errorMessage = (error as Error).message
        if (errorMessage.includes('fatal:') && errorMessage.includes('develop')) {
          logger.warn('GitOps', 'Develop branch not found, trying default branch', { repoName })
          
          // Get default branch name
          const { stdout: defaultBranch } = await execAsync('git symbolic-ref refs/remotes/origin/HEAD | sed "s@^refs/remotes/origin/@@"', { cwd: localPath })
          const branchName = defaultBranch.trim() || 'main'
          
          await execAsync(`git checkout ${branchName}`, { cwd: localPath })
          await execAsync(`git reset --hard origin/${branchName}`, { cwd: localPath })
          
          logger.info('GitOps', 'Repo updated with default branch', { repoName, branch: branchName })
          setClonedRepo(repoName, localPath)
          
          return {
            success: true,
            repoName,
            localPath,
          }
        }
        
        throw error
      }
    } else {
      // Clone new repo
      logger.info('GitOps', 'Cloning new repo', { repoName, repoUrl, localPath })
      
      try {
        // Try cloning develop branch first
        await execAsync(`git clone --branch ${DEFAULT_BRANCH} --single-branch ${repoUrl} "${localPath}"`, {
          cwd: REPO_BASE_PATH,
        })
        
        logger.info('GitOps', 'Repo cloned successfully', { repoName })
        setClonedRepo(repoName, localPath)
        
        return {
          success: true,
          repoName,
          localPath,
        }
      } catch (error) {
        // If develop branch doesn't exist, clone default branch
        const errorMessage = (error as Error).message
        if (errorMessage.includes('fatal:') && errorMessage.includes('develop')) {
          logger.warn('GitOps', 'Develop branch not found, cloning default branch', { repoName })
          
          await execAsync(`git clone ${repoUrl} "${localPath}"`, {
            cwd: REPO_BASE_PATH,
          })
          
          // Try to checkout develop if it exists, otherwise stay on default
          try {
            await execAsync('git checkout develop', { cwd: localPath })
          } catch {
            // Default branch is fine
          }
          
          logger.info('GitOps', 'Repo cloned with default branch', { repoName })
          setClonedRepo(repoName, localPath)
          
          return {
            success: true,
            repoName,
            localPath,
          }
        }
        
        throw error
      }
    }
  } catch (error) {
    const errorMessage = (error as Error).message
    logger.error('GitOps', 'Failed to ensure repo', { repoName, error: errorMessage })
    
    return {
      success: false,
      repoName,
      localPath,
      error: errorMessage,
    }
  }
}

/**
 * Clone/update multiple repos in parallel
 */
export async function ensureRepos(repos: Array<{ url: string; name: string }>): Promise<CloneResult[]> {
  logger.info('GitOps', 'Ensuring multiple repos', { count: repos.length })
  
  const results = await Promise.all(
    repos.map((repo) => ensureRepo(repo.url, repo.name))
  )
  
  const successCount = results.filter((r) => r.success).length
  logger.info('GitOps', 'Repos ensured', { total: repos.length, success: successCount })
  
  return results
}
