export const MintType = {
  CASHU: 'cashu',
  FEDIMINT: 'fedimint',
} as const

export type MintType = (typeof MintType)[keyof typeof MintType]

export interface Mint {
  id: string
  type: MintType
  name: string
  url: string | null
  inviteCode: string | null
  federationId: string | null
  trustScore: number
  successfulOps: number
  failedOps: number
  createdAt: number
}

export interface Proof {
  id: string
  mintId: string
  secret: string
  amount: number
  C: string
  keysetId: string
  createdAt: number
  lockId: string | null
  spentAt: number | null
}

export interface PendingQuote {
  quoteId: string
  mintId: string
  type: 'mint' | 'melt'
  amountSats: number
  invoice: string | null
  status: 'pending' | 'paid' | 'completed' | 'expired'
  createdAt: number
}

export interface Federation {
  id: string
  name: string
  inviteCode: string
  trustScore: number
  createdAt: number
}

export interface ToolResult<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

export interface DepositResult {
  amountSats: number
  invoice: string
  quoteId: string
  mintId: string
}

export interface PayResult {
  amountSats: number
  feeSats: number
  preimage?: string
  mintId: string
}

export interface BalanceResult {
  totalSats: number
  arkadeSats: number
  privateSats: number
  byMint: Record<string, number>
}

export interface SendEcashResult {
  token: string
  amountSats: number
  mintId: string
}

export interface MintInfo {
  id: string
  type: MintType
  name: string
  url: string | null
  balanceSats: number
  trustScore: number
}

export type DaemonState = 'UNINITIALIZED' | 'LOCKED' | 'UNLOCKED'

export interface SplitStrategy {
  type: 'equal' | 'weighted' | 'random' | 'single'
  weights?: Record<string, number>
  targetMintId?: string
}

export interface ToolDefinition {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}
