import { z } from 'zod'

export const MintConfigSchema = z.object({
  id: z.string().optional(),
  type: z.enum(['cashu', 'fedimint']),
  name: z.string(),
  url: z.string().url().optional(),
  inviteCode: z.string().optional(),
  trustScore: z.number().min(0).max(100).default(50),
})

export const SplitStrategySchema = z.object({
  type: z.enum(['equal', 'weighted', 'random', 'single']).default('equal'),
  weights: z.record(z.string(), z.number()).optional(),
  targetMintId: z.string().optional(),
})

export const ArkadeConfigSchema = z.object({
  serverUrl: z.string().url().default('https://arkade.computer'),
  esploraUrl: z.string().url().default('https://blockstream.info/api'),
  boltzApiUrl: z.string().url().default('https://api.ark.boltz.exchange'),
})

export const BoltzConfigSchema = z.object({
  apiUrl: z.string().url().default('https://api.ark.boltz.exchange'),
  network: z.string().default('bitcoin'),
})

export const LendasatConfigSchema = z.object({
  apiUrl: z.string().url().default('https://apilendaswap.lendasat.com'),
  network: z.string().default('bitcoin'),
  arkadeUrl: z.string().url().default('https://arkade.computer'),
  esploraUrl: z.string().url().default('https://mempool.space/api'),
})

export const DaemonConfigSchema = z.object({
  dataDir: z.string().default('./data'),
  dbPath: z.string().optional(),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  arkade: ArkadeConfigSchema.default({}),
  boltz: BoltzConfigSchema.default({}),
  lendasat: LendasatConfigSchema.default({}),

  mints: z.array(MintConfigSchema).default([]),

  defaultSplitStrategy: SplitStrategySchema.default({ type: 'equal' }),

  http: z.object({
    enabled: z.boolean().default(false),
    port: z.number().min(1).max(65535).default(3100),
    host: z.string().default('127.0.0.1'),
  }).default({}),

  mcp: z.object({
    enabled: z.boolean().default(true),
  }).default({}),
})

export type MintConfig = z.infer<typeof MintConfigSchema>
export type SplitStrategyConfig = z.infer<typeof SplitStrategySchema>
export type ArkadeConfig = z.infer<typeof ArkadeConfigSchema>
export type BoltzConfig = z.infer<typeof BoltzConfigSchema>
export type LendasatConfig = z.infer<typeof LendasatConfigSchema>
export type DaemonConfig = z.infer<typeof DaemonConfigSchema>
