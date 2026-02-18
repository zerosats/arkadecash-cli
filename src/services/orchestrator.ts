import { getCashuService } from './cashu.js'
import { getArkadeService, initArkadeService } from './arkade.js'
import { getFedimintService } from './fedimint.js'
import { initBoltzService, getBoltzService } from './boltz.js'
import { initLendasatService, getLendasatService, type QuoteResponse, type SwapResponse, type SwapRecord, type AssetPair } from './lendasat.js'
import { getAllMintsWithBalances, getMint, getMintsByType } from '../storage/mints.js'
import { deriveCashuSeed, deriveFedimintMnemonic, setCurrentMnemonic } from '../state/seed.js'
import { MintType, type SplitStrategy, type BalanceResult, type MintInfo } from '../types.js'
import type { ArkadeConfig, BoltzConfig, LendasatConfig, SplitStrategyConfig } from '../config/schema.js'

interface DepositResult {
  amountSats: number
  invoice: string
  quoteId: string
  mintId: string
}

interface PayResult {
  amountSats: number
  feeSats: number
  preimage?: string
  mintId: string
}

interface DistributeResult {
  amountSats: number
  fromMint: string
  toMint: string
}

export class Orchestrator {
  private defaultSplitStrategy: SplitStrategy
  private dbPath: string | null = null

  constructor(
    arkadeConfig: ArkadeConfig,
    boltzConfig: BoltzConfig = { apiUrl: 'https://api.ark.boltz.exchange', network: 'bitcoin' },
    lendasatConfig: LendasatConfig = { apiUrl: 'https://apilendaswap.lendasat.com', network: 'bitcoin', arkadeUrl: 'https://arkade.computer', esploraUrl: 'https://mempool.space/api' },
    defaultSplitStrategy: SplitStrategyConfig = { type: 'equal' },
    dbPath?: string,
  ) {
    this.defaultSplitStrategy = defaultSplitStrategy as SplitStrategy
    this.dbPath = dbPath ?? null
    initArkadeService(arkadeConfig)
    initBoltzService(boltzConfig)
    initLendasatService(lendasatConfig)
  }

  async initialize(mnemonic: string): Promise<void> {
    setCurrentMnemonic(mnemonic)

    const cashuSeed = deriveCashuSeed(mnemonic)
    getCashuService().setBip39Seed(cashuSeed)

    const fedimintMnemonic = deriveFedimintMnemonic(mnemonic)
    getFedimintService().setMnemonic(fedimintMnemonic)

    const arkade = getArkadeService()
    arkade.setMnemonic(mnemonic)
    await arkade.initialize()

    try {
      getBoltzService().initialize()
    } catch (e) {
      console.warn('Boltz initialization failed:', e instanceof Error ? e.message : e)
    }

    const lendasatDbPath = this.dbPath
      ? this.dbPath.replace(/\.db$/, '-lendasat.db')
      : './data/lendasat.db'
    await getLendasatService().initialize(mnemonic, lendasatDbPath)
  }

  getBalance(): BalanceResult {
    const mints = getAllMintsWithBalances()
    const byMint: Record<string, number> = {}

    let privateSats = 0
    for (const mint of mints) {
      byMint[mint.id] = mint.balance
      privateSats += mint.balance
    }

    let arkadeSats = 0
    try {
      const arkade = getArkadeService()
      if (arkade.isInitialized()) {
        arkadeSats = 0
      }
    } catch {
    }

    return {
      totalSats: arkadeSats + privateSats,
      arkadeSats,
      privateSats,
      byMint,
    }
  }

  async getArkadeBalance(): Promise<bigint> {
    const arkade = getArkadeService()
    return arkade.getBalance()
  }

  listMints(): MintInfo[] {
    const mints = getAllMintsWithBalances()
    return mints.map(m => ({
      id: m.id,
      type: m.type,
      name: m.name,
      url: m.url,
      balanceSats: m.balance,
      trustScore: m.trustScore,
    }))
  }

  async deposit(
    amountSats: number,
    mintId?: string,
    splitStrategy?: SplitStrategy
  ): Promise<DepositResult> {
    const targetMintId = mintId ?? this.selectMintForDeposit(splitStrategy)
    if (!targetMintId) {
      throw new Error('No mints available for deposit')
    }

    const mint = getMint(targetMintId)
    if (!mint) {
      throw new Error(`Mint ${targetMintId} not found`)
    }

    if (mint.type === MintType.CASHU) {
      const cashu = getCashuService()
      await cashu.initializeWallet(targetMintId)
      const quote = await cashu.createMintQuote(targetMintId, amountSats)
      return {
        amountSats,
        invoice: quote.invoice,
        quoteId: quote.quoteId,
        mintId: targetMintId,
      }
    } else {
      const fedimint = getFedimintService()
      const quote = await fedimint.createMintQuote(targetMintId, amountSats)
      return {
        amountSats,
        invoice: quote.invoice,
        quoteId: quote.quoteId,
        mintId: targetMintId,
      }
    }
  }

  async depositFromArkade(
    amountSats: number,
    mintId?: string,
    splitStrategy?: SplitStrategy
  ): Promise<{ success: boolean; amountSats: number; mintId: string }> {
    const arkade = getArkadeService()
    const balance = await arkade.getBalance()

    if (balance < BigInt(amountSats)) {
      throw new Error(`Insufficient Arkade balance. Have ${balance} sats, need ${amountSats}`)
    }

    const depositResult = await this.deposit(amountSats, mintId, splitStrategy)

    await arkade.payInvoice(depositResult.invoice)

    const mint = getMint(depositResult.mintId)
    if (mint?.type === MintType.CASHU) {
      let attempts = 0
      while (attempts < 20) {
        const status = await getCashuService().checkMintQuote(depositResult.mintId, depositResult.quoteId)
        if (status.paid) {
          await getCashuService().mintTokens(depositResult.mintId, amountSats, depositResult.quoteId)
          break
        }
        await new Promise(r => setTimeout(r, 1000))
        attempts++
      }
    }

    return {
      success: true,
      amountSats,
      mintId: depositResult.mintId,
    }
  }

  async pay(
    invoice: string,
    mintId?: string
  ): Promise<PayResult> {
    const targetMintId = mintId ?? this.selectMintForPayment(invoice)
    if (!targetMintId) {
      throw new Error('No mints with sufficient balance')
    }

    const mint = getMint(targetMintId)
    if (!mint) {
      throw new Error(`Mint ${targetMintId} not found`)
    }

    if (mint.type === MintType.CASHU) {
      const result = await getCashuService().payInvoice(targetMintId, invoice)
      return {
        ...result,
        mintId: targetMintId,
      }
    } else {
      const result = await getFedimintService().payInvoice(targetMintId, invoice)
      return {
        ...result,
        mintId: targetMintId,
      }
    }
  }

  async distribute(
    fromMintId: string,
    toMintId: string,
    amountSats: number
  ): Promise<DistributeResult> {
    const fromMint = getMint(fromMintId)
    const toMint = getMint(toMintId)

    if (!fromMint) throw new Error(`Source mint ${fromMintId} not found`)
    if (!toMint) throw new Error(`Target mint ${toMintId} not found`)

    const deposit = await this.deposit(amountSats, toMintId)

    if (fromMint.type === MintType.CASHU) {
      await getCashuService().payInvoice(fromMintId, deposit.invoice)
    } else {
      await getFedimintService().payInvoice(fromMintId, deposit.invoice)
    }

    if (toMint.type === MintType.CASHU) {
      let attempts = 0
      while (attempts < 20) {
        const status = await getCashuService().checkMintQuote(toMintId, deposit.quoteId)
        if (status.paid) {
          await getCashuService().mintTokens(toMintId, amountSats, deposit.quoteId)
          break
        }
        await new Promise(r => setTimeout(r, 1000))
        attempts++
      }
    }

    return {
      amountSats,
      fromMint: fromMintId,
      toMint: toMintId,
    }
  }

  async sendEcash(
    mintId: string,
    amountSats: number
  ): Promise<{ token: string; amountSats: number; mintId: string }> {
    const mint = getMint(mintId)
    if (!mint) throw new Error(`Mint ${mintId} not found`)

    let token: string
    if (mint.type === MintType.CASHU) {
      token = await getCashuService().sendEcash(mintId, amountSats)
    } else {
      token = await getFedimintService().sendNotes(mintId, amountSats)
    }

    return { token, amountSats, mintId }
  }

  async receiveEcash(
    token: string,
    mintId?: string
  ): Promise<{ amountSats: number; mintId: string }> {
    const targetMintId = mintId ?? this.detectMintFromToken(token)
    if (!targetMintId) {
      throw new Error('Cannot determine mint from token')
    }

    const mint = getMint(targetMintId)
    if (!mint) throw new Error(`Mint ${targetMintId} not found`)

    let amountSats: number
    if (mint.type === MintType.CASHU) {
      amountSats = await getCashuService().receiveEcash(targetMintId, token)
    } else {
      amountSats = await getFedimintService().receiveNotes(targetMintId, token)
    }

    return { amountSats, mintId: targetMintId }
  }

  async sendLightningPayment(invoice: string): Promise<{ amountSats: number; preimage: string; feeSats: number }> {
    return getBoltzService().sendLightningPayment(invoice)
  }

  async createLightningInvoice(amountSats: number, description?: string): Promise<{ invoice: string }> {
    return getBoltzService().createLightningInvoice(amountSats, description)
  }

  async getLightningFees(): Promise<{ minerFees: number; percentage: number }> {
    return getBoltzService().getFees()
  }

  async getLightningLimits(): Promise<{ minSats: number; maxSats: number }> {
    return getBoltzService().getLimits()
  }

  async getSwapQuote(from: string, to: string, amountSats: bigint): Promise<QuoteResponse> {
    return getLendasatService().getQuote(from, to, amountSats)
  }

  async createSwap(
    targetAddress: string,
    targetAmount: string,
    targetToken: string,
    network: string,
  ): Promise<SwapResponse> {
    return getLendasatService().createArkadeToEvmSwap(targetAddress, targetAmount, targetToken, network)
  }

  async getSwapStatus(swapId: string): Promise<SwapRecord> {
    return getLendasatService().getSwapStatus(swapId)
  }

  async listSwaps(): Promise<SwapRecord[]> {
    return getLendasatService().listSwaps()
  }

  async claimSwap(swapId: string): Promise<void> {
    return getLendasatService().claimSwap(swapId)
  }

  async getSupportedPairs(): Promise<AssetPair[]> {
    return getLendasatService().getSupportedPairs()
  }

  private selectMintForDeposit(strategy?: SplitStrategy): string | null {
    const mints = getAllMintsWithBalances()
    if (mints.length === 0) return null

    const effectiveStrategy = strategy ?? this.defaultSplitStrategy

    if (effectiveStrategy.type === 'single' && effectiveStrategy.targetMintId) {
      return effectiveStrategy.targetMintId
    }

    const sorted = [...mints].sort((a, b) => a.balance - b.balance)
    return sorted[0].id
  }

  private selectMintForPayment(_invoice: string): string | null {
    const mints = getAllMintsWithBalances()
    const withBalance = mints.filter(m => m.balance > 0)

    if (withBalance.length === 0) return null

    const sorted = [...withBalance].sort((a, b) => b.balance - a.balance)
    return sorted[0].id
  }

  private detectMintFromToken(token: string): string | null {
    if (token.startsWith('cashuA') || token.startsWith('cashuB')) {
      const cashuMints = getMintsByType(MintType.CASHU)
      return cashuMints[0]?.id ?? null
    }

    if (token.startsWith('fed1')) {
      const fedimintMints = getMintsByType(MintType.FEDIMINT)
      return fedimintMints[0]?.id ?? null
    }

    return null
  }
}

let orchestratorInstance: Orchestrator | null = null

export function initOrchestrator(
  arkadeConfig: ArkadeConfig,
  splitStrategy?: SplitStrategyConfig,
  boltzConfig?: BoltzConfig,
  lendasatConfig?: LendasatConfig,
  dbPath?: string,
): Orchestrator {
  orchestratorInstance = new Orchestrator(arkadeConfig, boltzConfig, lendasatConfig, splitStrategy, dbPath)
  return orchestratorInstance
}

export function getOrchestrator(): Orchestrator {
  if (!orchestratorInstance) {
    throw new Error('Orchestrator not initialized')
  }
  return orchestratorInstance
}
