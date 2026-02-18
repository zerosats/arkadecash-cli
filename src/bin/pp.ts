#!/usr/bin/env node

import { runCli } from '../transports/cli.js'

runCli().catch((error) => {
  console.error('CLI error:', error)
  process.exit(1)
})
