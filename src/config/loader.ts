import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { DaemonConfigSchema, type DaemonConfig } from './schema.js'

const DEFAULT_CONFIG_PATHS = [
  './arkadecash.config.json',
  './config/arkadecash.json',
  '~/.config/arkadecash/config.json',
  './ppd.config.json',
  './config/ppd.json',
  '~/.config/ppd/config.json',
]

function expandTilde(path: string): string {
  if (path.startsWith('~')) {
    const home = process.env.HOME || process.env.USERPROFILE || ''
    return path.replace('~', home)
  }
  return path
}

function findConfigFile(customPath?: string): string | null {
  if (customPath) {
    const expanded = expandTilde(customPath)
    if (existsSync(expanded)) {
      return expanded
    }
    throw new Error(`Config file not found: ${customPath}`)
  }

  for (const path of DEFAULT_CONFIG_PATHS) {
    const expanded = expandTilde(path)
    if (existsSync(expanded)) {
      return expanded
    }
  }

  return null
}

function loadConfigFromFile(path: string): Partial<DaemonConfig> {
  const content = readFileSync(path, 'utf-8')
  return JSON.parse(content)
}

function loadConfigFromEnv(): Partial<DaemonConfig> {
  const config: Partial<DaemonConfig> = {}

  if (process.env.PPD_DATA_DIR) {
    config.dataDir = process.env.PPD_DATA_DIR
  }

  if (process.env.PPD_LOG_LEVEL) {
    const level = process.env.PPD_LOG_LEVEL as DaemonConfig['logLevel']
    if (['debug', 'info', 'warn', 'error'].includes(level)) {
      config.logLevel = level
    }
  }

  if (process.env.PPD_HTTP_ENABLED === 'true') {
    config.http = { enabled: true, port: 3100, host: '127.0.0.1' }
  }

  if (process.env.PPD_HTTP_PORT) {
    const port = parseInt(process.env.PPD_HTTP_PORT, 10)
    if (!isNaN(port)) {
      config.http = { ...config.http, enabled: true, port, host: '127.0.0.1' }
    }
  }

  if (process.env.PPD_ARKADE_SERVER_URL || process.env.ARKADECASH_ARKADE_SERVER_URL) {
    config.arkade = {
      serverUrl: process.env.ARKADECASH_ARKADE_SERVER_URL || process.env.PPD_ARKADE_SERVER_URL || 'https://arkade.computer',
      esploraUrl: process.env.ARKADECASH_ARKADE_ESPLORA_URL || process.env.PPD_ARKADE_ESPLORA_URL || 'https://blockstream.info/api',
      boltzApiUrl: process.env.ARKADECASH_ARKADE_BOLTZ_URL || process.env.PPD_ARKADE_BOLTZ_URL || 'https://api.ark.boltz.exchange',
    }
  }

  if (process.env.ARKADECASH_BOLTZ_API_URL) {
    config.boltz = {
      apiUrl: process.env.ARKADECASH_BOLTZ_API_URL,
      network: process.env.ARKADECASH_BOLTZ_NETWORK || 'bitcoin',
    }
  }

  if (process.env.ARKADECASH_LENDASAT_API_URL) {
    config.lendasat = {
      apiUrl: process.env.ARKADECASH_LENDASAT_API_URL,
      network: process.env.ARKADECASH_LENDASAT_NETWORK || 'bitcoin',
      arkadeUrl: process.env.ARKADECASH_LENDASAT_ARKADE_URL || 'https://arkade.computer',
      esploraUrl: process.env.ARKADECASH_LENDASAT_ESPLORA_URL || 'https://mempool.space/api',
    }
  }

  return config
}

export function loadConfig(customPath?: string): DaemonConfig {
  let fileConfig: Partial<DaemonConfig> = {}

  const configPath = findConfigFile(customPath)
  if (configPath) {
    fileConfig = loadConfigFromFile(configPath)
    console.log(`Loaded config from: ${configPath}`)
  }

  const envConfig = loadConfigFromEnv()

  const merged = {
    ...fileConfig,
    ...envConfig,
    arkade: { ...fileConfig.arkade, ...envConfig.arkade },
    boltz: { ...fileConfig.boltz, ...envConfig.boltz },
    lendasat: { ...fileConfig.lendasat, ...envConfig.lendasat },
    http: { ...fileConfig.http, ...envConfig.http },
    mcp: { ...fileConfig.mcp, ...envConfig.mcp },
  }

  const parsed = DaemonConfigSchema.safeParse(merged)
  if (!parsed.success) {
    throw new Error(`Invalid config: ${parsed.error.message}`)
  }

  if (!parsed.data.dbPath) {
    parsed.data.dbPath = resolve(expandTilde(parsed.data.dataDir), 'ppd.db')
  }

  return parsed.data
}

export function getDefaultDataDir(): string {
  return resolve(expandTilde('~/.arkadecash'))
}
