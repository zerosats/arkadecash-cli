import type { LendasatConfig } from '../config/schema.js'

export interface QuoteResponse {
  exchange_rate: number
  protocol_fee: number
  network_fee: number
  min_amount: number
}

export interface SwapResponse {
  id?: string
  swap_id?: string
  htlc_address_arkade?: string
  sats_receive?: number
  source_amount?: number
  status: string
}

export interface SwapRecord {
  id: string
  status: string
  source_token: string
  target_token: string
  source_amount: number
  target_amount: number
  created_at: number
}

export interface AssetPair {
  from: string
  to: string
  min_amount: number
  max_amount: number
}

interface LendasatClient {
  init(mnemonic: string | null): Promise<void>
  getQuote(from: string, to: string, amount: bigint): Promise<QuoteResponse>
  createArkadeToEvmSwap(request: ArkadeToEvmRequest, network: string): Promise<SwapResponse>
  createEvmToArkadeSwap(request: EvmToArkadeRequest, network: string): Promise<SwapResponse>
  claimGelato(swapId: string): Promise<void>
  refundSwap(swapId: string, address: string): Promise<string>
  getSwap(swapId: string): Promise<SwapRecord>
  listAllSwaps(): Promise<SwapRecord[]>
  recoverSwaps(): Promise<void>
  getAssetPairs(): Promise<AssetPair[]>
}

interface ClientModule {
  Client: {
    create(
      apiUrl: string,
      walletStorage: unknown,
      swapStorage: unknown,
      network: string,
      arkadeUrl: string,
    ): Promise<LendasatClient>
  }
  createSqliteWalletStorage(dbPath: string): unknown
  createSqliteSwapStorage(dbPath: string): unknown
}

interface ArkadeToEvmRequest {
  target_address: string
  target_amount: string
  target_token: string
}

interface EvmToArkadeRequest {
  source_token: string
  source_amount: string
  target_address: string
}

export class LendasatService {
  private config: LendasatConfig
  private client: LendasatClient | null = null
  private initialized = false

  constructor(config: LendasatConfig) {
    this.config = config
  }

  async initialize(mnemonic: string, dbPath: string): Promise<void> {
    try {
      const sdk = await (Function('return import("@lendasat/lendaswap-sdk-native")')() as Promise<ClientModule>)
      const walletStorage = sdk.createSqliteWalletStorage(dbPath)
      const swapStorage = sdk.createSqliteSwapStorage(dbPath)

      this.client = await sdk.Client.create(
        this.config.apiUrl,
        walletStorage,
        swapStorage,
        this.config.network,
        this.config.arkadeUrl,
      )

      await this.client.init(mnemonic)
      this.initialized = true
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      if (msg.includes('createSqliteWalletStorage')) {
        console.warn('Lendasat: @lendasat/lendaswap-sdk-native is missing createSqliteWalletStorage. Upgrade the package or install a compatible version.')
      } else if (msg.includes('Cannot find module') || msg.includes('ERR_MODULE_NOT_FOUND')) {
        console.warn('Lendasat: @lendasat/lendaswap-sdk-native not installed. Run: npm install @lendasat/lendaswap-sdk-native')
      } else {
        console.warn(`Lendasat initialization failed: ${msg}`)
      }
      console.warn('Swap features (BTC↔stablecoin) will be unavailable.')
    }
  }

  isInitialized(): boolean {
    return this.initialized
  }

  isAvailable(): { available: boolean; reason?: string } {
    if (this.initialized && this.client) {
      return { available: true }
    }
    return { available: false, reason: 'Lendasat service not initialized. The @lendasat/lendaswap-sdk-native package may be missing or incompatible.' }
  }

  private ensureInitialized(): LendasatClient {
    if (!this.client || !this.initialized) {
      throw new Error('Lendasat service not initialized')
    }
    return this.client
  }

  async getQuote(from: string, to: string, amountSats: bigint): Promise<QuoteResponse> {
    const client = this.ensureInitialized()
    return client.getQuote(from, to, amountSats)
  }

  async createArkadeToEvmSwap(
    targetAddress: string,
    targetAmount: string,
    targetToken: string,
    network: string,
  ): Promise<SwapResponse> {
    const client = this.ensureInitialized()
    return client.createArkadeToEvmSwap(
      { target_address: targetAddress, target_amount: targetAmount, target_token: targetToken },
      network,
    )
  }

  async createEvmToArkadeSwap(
    sourceToken: string,
    sourceAmount: string,
    targetAddress: string,
    network: string,
  ): Promise<SwapResponse> {
    const client = this.ensureInitialized()
    return client.createEvmToArkadeSwap(
      { source_token: sourceToken, source_amount: sourceAmount, target_address: targetAddress },
      network,
    )
  }

  async claimSwap(swapId: string): Promise<void> {
    const client = this.ensureInitialized()
    await client.claimGelato(swapId)
  }

  async refundSwap(swapId: string, address: string): Promise<string> {
    const client = this.ensureInitialized()
    return client.refundSwap(swapId, address)
  }

  async getSwapStatus(swapId: string): Promise<SwapRecord> {
    const client = this.ensureInitialized()
    return client.getSwap(swapId)
  }

  async listSwaps(): Promise<SwapRecord[]> {
    const client = this.ensureInitialized()
    return client.listAllSwaps()
  }

  async recoverSwaps(): Promise<void> {
    const client = this.ensureInitialized()
    await client.recoverSwaps()
  }

  async getSupportedPairs(): Promise<AssetPair[]> {
    const client = this.ensureInitialized()
    return client.getAssetPairs()
  }

  getConfig(): LendasatConfig {
    return this.config
  }
}

let serviceInstance: LendasatService | null = null

export function initLendasatService(config: LendasatConfig): LendasatService {
  serviceInstance = new LendasatService(config)
  return serviceInstance
}

export function getLendasatService(): LendasatService {
  if (!serviceInstance) {
    throw new Error('Lendasat service not initialized')
  }
  return serviceInstance
}
