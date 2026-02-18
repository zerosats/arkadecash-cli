#!/usr/bin/env node

import { Command } from 'commander'
import { startDaemon } from '../daemon.js'

const program = new Command()

program
  .name('arkadecash-daemon')
  .description('Arkade Cash Daemon - Bitcoin payments via Arkade, Boltz, Lendasat, Cashu, and Fedimint')
  .version('0.1.0')

program
  .option('-c, --config <path>', 'Config file path')
  .option('-p, --password <password>', 'Unlock password (for auto-unlock)')
  .option('--http', 'Enable HTTP API')
  .option('--http-port <port>', 'HTTP port', '3100')
  .option('--no-mcp', 'Disable MCP server')
  .action(async (options) => {
    try {
      await startDaemon({
        configPath: options.config,
        password: options.password,
      })

      await new Promise(() => {})
    } catch (error) {
      console.error('Failed to start daemon:', error)
      process.exit(1)
    }
  })

program.parse()
