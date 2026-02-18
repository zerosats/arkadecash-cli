import { mkdirSync, existsSync } from 'node:fs'
import { dirname } from 'node:path'
import { loadConfig, type DaemonConfig } from './config/index.js'
import { initStorage, closeStorage } from './storage/index.js'
import { unlockSeed } from './state/seed.js'
import { getDaemonState, isUnlocked } from './state/machine.js'
import { initOrchestrator, getOrchestrator } from './services/orchestrator.js'
import { startMcpServer } from './transports/mcp.js'
import { startHttpServer } from './transports/http.js'

export interface DaemonOptions {
  configPath?: string
  password?: string
  autoUnlock?: boolean
}

export class Daemon {
  private config: DaemonConfig
  private running: boolean = false

  constructor(options: DaemonOptions = {}) {
    this.config = loadConfig(options.configPath)

    const dataDir = dirname(this.config.dbPath!)
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true })
    }

    initStorage(this.config.dbPath!)
    initOrchestrator(
      this.config.arkade,
      this.config.defaultSplitStrategy,
      this.config.boltz,
      this.config.lendasat,
      this.config.dbPath,
    )
  }

  async start(password?: string): Promise<void> {
    if (this.running) {
      console.log('Daemon already running')
      return
    }

    console.log('Starting arkadecash daemon...')

    const state = getDaemonState()
    console.log(`Current state: ${state}`)

    if (state === 'UNINITIALIZED') {
      console.log('Not initialized. Run `arkadecash init` first.')
      return
    }

    if (state === 'LOCKED' && password) {
      console.log('Unlocking with provided password...')
      const mnemonic = unlockSeed(password)
      await getOrchestrator().initialize(mnemonic)
      console.log('Daemon unlocked')
    }

    if (!isUnlocked()) {
      console.log('Daemon is locked. Waiting for unlock...')
    }

    this.running = true

    const startPromises: Promise<void>[] = []

    if (this.config.mcp.enabled) {
      console.log('Starting MCP server...')
      startPromises.push(startMcpServer())
    }

    if (this.config.http.enabled) {
      console.log(`Starting HTTP server on ${this.config.http.host}:${this.config.http.port}...`)
      startPromises.push(startHttpServer(this.config.http.port, this.config.http.host))
    }

    if (startPromises.length > 0) {
      await Promise.all(startPromises)
    }

    console.log('Daemon started')

    process.on('SIGINT', () => this.stop())
    process.on('SIGTERM', () => this.stop())
  }

  async stop(): Promise<void> {
    if (!this.running) return

    console.log('Stopping daemon...')
    this.running = false

    closeStorage()
    console.log('Daemon stopped')

    process.exit(0)
  }

  getConfig(): DaemonConfig {
    return this.config
  }

  isRunning(): boolean {
    return this.running
  }
}

export async function startDaemon(options: DaemonOptions = {}): Promise<Daemon> {
  const daemon = new Daemon(options)
  await daemon.start(options.password)
  return daemon
}
