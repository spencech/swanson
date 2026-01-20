import { spawn, ChildProcess, execFile } from 'child_process'
import { BrowserWindow } from 'electron'
import { logger } from './logger'
import * as os from 'os'
import { loadRepositories, formatRepoContext } from './repos'

let claudeProcess: ChildProcess | null = null
let currentSessionId: string | null = null

interface ClaudeOutputChunk {
  type: 'text' | 'error' | 'done' | 'start'
  content?: string
  error?: string
}

/**
 * Start a Claude Code CLI session
 */
export async function startClaudeSession(
  mainWindow: BrowserWindow,
  prompt: string,
  workingDirectory?: string
): Promise<void> {
  // Kill any existing session
  if (claudeProcess) {
    stopClaudeSession()
  }

  // Load repositories and format context
  let repoContext = ''
  try {
    const repos = await loadRepositories()
    repoContext = formatRepoContext(repos)
    logger.info('Claude', 'Loaded repositories', { count: repos.length })
  } catch (error) {
    logger.warn('Claude', 'Failed to load repositories', { error: (error as Error).message })
    // Continue without repo context if GitHub not connected
  }

  // Enhance prompt with repository context
  const enhancedPrompt = repoContext
    ? `${prompt}

## Available Repositories
${repoContext}`
    : prompt

  // Notify renderer that we're starting
  logger.info('Claude', 'Starting session', { prompt: enhancedPrompt.substring(0, 100), workingDirectory })
  mainWindow.webContents.send('claude-output', {
    type: 'start',
  } as ClaudeOutputChunk)

  try {
    const home = os.homedir()
    const fs = require('fs')

    // Find the claude binary - check nvm paths first, then common locations
    let claudeBinary = 'claude'
    const nvmDir = `${home}/.nvm/versions/node`

    if (fs.existsSync(nvmDir)) {
      const nodeVersions = fs.readdirSync(nvmDir).sort().reverse()
      for (const version of nodeVersions) {
        const candidatePath = `${nvmDir}/${version}/bin/claude`
        if (fs.existsSync(candidatePath)) {
          claudeBinary = candidatePath
          break
        }
      }
    }

    // If not found in nvm, check other common locations
    if (claudeBinary === 'claude') {
      const commonPaths = [
        '/usr/local/bin/claude',
        '/opt/homebrew/bin/claude',
        `${home}/.local/bin/claude`,
      ]
      for (const path of commonPaths) {
        if (fs.existsSync(path)) {
          claudeBinary = path
          break
        }
      }
    }

    const args = [
      '--print',
      '--verbose',
      '--output-format', 'stream-json',
      '--dangerously-skip-permissions',
      '--include-partial-messages',
    ]

    // If we have a previous session, resume it to maintain conversation context
    if (currentSessionId) {
      args.push('--resume', currentSessionId)
      logger.info('Claude', 'Resuming session', { sessionId: currentSessionId })
    }

    args.push(enhancedPrompt)

    logger.debug('Claude', 'Spawning process', { command: claudeBinary, args })

    // Set up environment
    const envWithPath = {
      ...process.env,
      HOME: home,
      TERM: 'xterm-256color',
    }

    // Spawn claude directly without shell
    // Use 'ignore' for stdin since we're using --print mode (non-interactive)
    claudeProcess = spawn(claudeBinary, args, {
      cwd: workingDirectory || process.cwd(),
      env: envWithPath,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    logger.info('Claude', 'Process spawned', { pid: claudeProcess.pid })

    let buffer = ''

    claudeProcess.stdout?.on('data', (data: Buffer) => {
      const rawData = data.toString()
      logger.debug('Claude', 'stdout data received', { bytes: data.length, raw: rawData.substring(0, 500) })
      buffer += rawData

      // Process complete JSON lines
      const lines = buffer.split('\n')
      buffer = lines.pop() || '' // Keep incomplete line in buffer

      logger.debug('Claude', 'Processing lines', { lineCount: lines.length, remainingBuffer: buffer.length })

      for (const line of lines) {
        if (!line.trim()) continue

        logger.debug('Claude', 'Processing line', { line: line.substring(0, 200) })

        try {
          const parsed = JSON.parse(line)
          logger.debug('Claude', 'Parsed JSON', { type: parsed.type, keys: Object.keys(parsed) })

          // Handle different message types from Claude CLI stream-json format
          // We use 'assistant' for streaming text as it arrives, and skip 'result'
          // to avoid duplicate output
          if (parsed.type === 'assistant' && parsed.message?.content) {
            // Stream text from assistant message content blocks
            logger.info('Claude', 'Received assistant message', {
              contentBlocks: parsed.message.content.length
            })
            for (const block of parsed.message.content) {
              if (block.type === 'text' && block.text) {
                logger.debug('Claude', 'Sending text block', { length: block.text.length })
                mainWindow.webContents.send('claude-output', {
                  type: 'text',
                  content: block.text,
                } as ClaudeOutputChunk)
              }
            }
          } else if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
            // Streaming delta - for real-time token-by-token streaming
            logger.debug('Claude', 'Sending delta', { length: parsed.delta.text.length })
            mainWindow.webContents.send('claude-output', {
              type: 'text',
              content: parsed.delta.text,
            } as ClaudeOutputChunk)
          } else if (parsed.type === 'result') {
            // Final result - skip this since we already got content from 'assistant'
            logger.info('Claude', 'Received result (skipping, already streamed)', {
              length: parsed.result?.length
            })
          } else if (parsed.type === 'system') {
            // System messages (init, etc.) - capture session_id for conversation continuity
            logger.debug('Claude', 'Received system message', { subtype: parsed.subtype })
            if (parsed.subtype === 'init' && parsed.session_id) {
              currentSessionId = parsed.session_id
              logger.info('Claude', 'Captured session ID for continuity', { sessionId: currentSessionId })
            }
          } else {
            // Unknown message type - log it for debugging
            logger.debug('Claude', 'Other message type', { type: parsed.type })
          }
        } catch {
          // If not JSON, treat as plain text output
          logger.debug('Claude', 'Non-JSON line, treating as text', { line: line.substring(0, 100) })
          mainWindow.webContents.send('claude-output', {
            type: 'text',
            content: line,
          } as ClaudeOutputChunk)
        }
      }
    })

    claudeProcess.stderr?.on('data', (data: Buffer) => {
      const errorText = data.toString()
      logger.debug('Claude', 'stderr data received', { errorText: errorText.substring(0, 500) })
      // Filter out common non-error messages
      if (!errorText.includes('Debugger') && !errorText.includes('DevTools')) {
        logger.warn('Claude', 'Sending error to renderer', { errorText })
        mainWindow.webContents.send('claude-output', {
          type: 'error',
          error: errorText,
        } as ClaudeOutputChunk)
      }
    })

    claudeProcess.on('close', (code) => {
      logger.info('Claude', 'Process closed', { exitCode: code, remainingBuffer: buffer.length })
      // Process any remaining buffer - but skip 'result' type to avoid duplication
      if (buffer.trim()) {
        logger.debug('Claude', 'Processing remaining buffer', { buffer: buffer.substring(0, 200) })
        try {
          const parsed = JSON.parse(buffer)
          // Only send if it's an assistant message with content, not a result
          if (parsed.type === 'assistant' && parsed.message?.content) {
            for (const block of parsed.message.content) {
              if (block.type === 'text' && block.text) {
                mainWindow.webContents.send('claude-output', {
                  type: 'text',
                  content: block.text,
                } as ClaudeOutputChunk)
              }
            }
          } else if (parsed.type !== 'result' && parsed.type !== 'system') {
            // Non-JSON or unknown type - send as text
            logger.debug('Claude', 'Buffer has unknown type, skipping')
          }
        } catch {
          // Not valid JSON - send as raw text
          logger.debug('Claude', 'Buffer not JSON, sending as text')
          mainWindow.webContents.send('claude-output', {
            type: 'text',
            content: buffer,
          } as ClaudeOutputChunk)
        }
      }

      logger.info('Claude', 'Sending done signal')
      mainWindow.webContents.send('claude-output', {
        type: 'done',
        content: code === 0 ? undefined : `Process exited with code ${code}`,
      } as ClaudeOutputChunk)

      claudeProcess = null
    })

    claudeProcess.on('error', (error) => {
      logger.error('Claude', 'Process error', { error: error.message, code: (error as NodeJS.ErrnoException).code })
      mainWindow.webContents.send('claude-output', {
        type: 'error',
        error: error.message.includes('ENOENT')
          ? 'Claude CLI not found. Please ensure Claude Code is installed and in your PATH.'
          : error.message,
      } as ClaudeOutputChunk)

      claudeProcess = null
    })

  } catch (error) {
    logger.error('Claude', 'Failed to start session', { error: error instanceof Error ? error.message : error })
    mainWindow.webContents.send('claude-output', {
      type: 'error',
      error: error instanceof Error ? error.message : 'Failed to start Claude session',
    } as ClaudeOutputChunk)
  }
}

/**
 * Send input to the running Claude session
 */
export function sendToClaudeSession(input: string): boolean {
  if (!claudeProcess || !claudeProcess.stdin) {
    return false
  }

  claudeProcess.stdin.write(input + '\n')
  return true
}

/**
 * Stop the current Claude session
 */
export function stopClaudeSession(): void {
  if (claudeProcess) {
    logger.info('Claude', 'Stopping session', { pid: claudeProcess.pid })
    claudeProcess.kill('SIGTERM')
    claudeProcess = null
  }
}

/**
 * Check if a Claude session is running
 */
export function isClaudeSessionActive(): boolean {
  return claudeProcess !== null && !claudeProcess.killed
}

/**
 * Clear the current session ID to start a fresh conversation
 */
export function clearClaudeSession(): void {
  logger.info('Claude', 'Clearing session', { previousSessionId: currentSessionId })
  currentSessionId = null
}

/**
 * Get the current session ID
 */
export function getClaudeSessionId(): string | null {
  return currentSessionId
}
