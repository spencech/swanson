import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

class Logger {
  private logFile: string
  private minLevel: LogLevel = 'debug'
  private writeStream: fs.WriteStream | null = null

  constructor() {
    // Log to user data directory (e.g., ~/Library/Application Support/Swanson/logs/)
    const logDir = path.join(app.getPath('userData'), 'logs')

    // Ensure log directory exists
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true })
    }

    // Create log file with date
    const date = new Date().toISOString().split('T')[0]
    this.logFile = path.join(logDir, `swanson-${date}.log`)

    // Open write stream in append mode
    this.writeStream = fs.createWriteStream(this.logFile, { flags: 'a' })

    this.info('Logger', `Log file: ${this.logFile}`)
  }

  private formatMessage(level: LogLevel, context: string, message: string, data?: unknown): string {
    const timestamp = new Date().toISOString()
    const dataStr = data !== undefined ? ` | ${JSON.stringify(data, null, 0)}` : ''
    return `[${timestamp}] [${level.toUpperCase().padEnd(5)}] [${context}] ${message}${dataStr}`
  }

  private write(level: LogLevel, context: string, message: string, data?: unknown): void {
    if (LOG_LEVELS[level] < LOG_LEVELS[this.minLevel]) return

    const formatted = this.formatMessage(level, context, message, data)

    // Write to file
    this.writeStream?.write(formatted + '\n')

    // Also log to console for development
    const consoleFn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
    consoleFn(formatted)
  }

  debug(context: string, message: string, data?: unknown): void {
    this.write('debug', context, message, data)
  }

  info(context: string, message: string, data?: unknown): void {
    this.write('info', context, message, data)
  }

  warn(context: string, message: string, data?: unknown): void {
    this.write('warn', context, message, data)
  }

  error(context: string, message: string, data?: unknown): void {
    this.write('error', context, message, data)
  }

  getLogPath(): string {
    return this.logFile
  }

  close(): void {
    this.writeStream?.end()
  }
}

// Singleton instance
export const logger = new Logger()
