import { Wallet, SingleKey, RestArkProvider, RestIndexerProvider, Ramps } from '@arkade-os/sdk'
import { ArkadeLightning, BoltzSwapProvider } from '@arkade-os/boltz-swap'
import { derivePrivateKey } from '../state/seed.js'
import type { ArkadeConfig } from '../config/schema.js'

interface ArkadeInstance {
  wallet: Wallet
  lightning: ArkadeLightning
  identity: SingleKey
}

function extractBalanceFromSDK(balanceData: { total: bigint }): bigint {
  return balanceData.total
}

export class ArkadeService {
  private config: ArkadeConfig
  private mnemonic: string | null = null
  private addressIndex: number = 0
  private instance: ArkadeInstance | null = null

  constructor(config: ArkadeConfig) {
    this.config = config
  }

  setMnemonic(mnemonic: string, addressIndex: number = 0): void {
    this.mnemonic = mnemonic
    this.addressIndex = addressIndex
  }

  async initialize(): Promise<void> {
    if (!this.mnemonic) {
      throw new Error('Mnemonic not set')
    }

    const privateKeyHex = derivePrivateKey(this.mnemonic, this.addressIndex)
    const identity = SingleKey.fromHex(privateKeyHex)

    const wallet = await Wallet.create({
      identity,
      arkServerUrl: this.config.serverUrl,
      esploraUrl: this.config.esploraUrl,
    })

    const swapProvider = new BoltzSwapProvider({
      apiUrl: this.config.boltzApiUrl,
      network: 'bitcoin',
    })

    const xOnlyPubKey = await identity.xOnlyPublicKey()

    const identityWrapper = {
      ...identity,
      xOnlyPublicKey: () => xOnlyPubKey,
      compressedPublicKey: () => identity.compressedPublicKey(),
      signMessage: (msg: Buffer, type: number) => identity.signMessage(msg, type),
      sign: (tx: unknown, indexes: number[]) => identity.sign(tx, indexes),
      signerSession: () => identity.signerSession(),
    }

    const walletWrapper = new Proxy(wallet, {
      get(target, prop) {
        if (prop === 'identity') {
          return identityWrapper
        }
        const value = (target as Record<string | symbol, unknown>)[prop]
        if (typeof value === 'function') {
          return (value as Function).bind(target)
        }
        return value
      },
    })

    const lightning = new ArkadeLightning({
      wallet: walletWrapper as unknown as Wallet,
      arkProvider: new RestArkProvider(this.config.serverUrl),
      indexerProvider: new RestIndexerProvider(this.config.serverUrl),
      swapProvider,
      timeoutConfig: {
        invoiceExpirySeconds: 600,
      },
    })

    this.instance = { wallet, lightning, identity }
  }

  isInitialized(): boolean {
    return this.instance !== null
  }

  private ensureInitialized(): ArkadeInstance {
    if (!this.instance) {
      throw new Error('Arkade wallet not initialized')
    }
    return this.instance
  }

  async getBalance(): Promise<bigint> {
    const { wallet } = this.ensureInitialized()
    const balanceData = await wallet.getBalance()
    return extractBalanceFromSDK(balanceData)
  }

  async getAddress(): Promise<string> {
    const { wallet } = this.ensureInitialized()
    return wallet.getAddress()
  }

  async getBoardingAddress(): Promise<string> {
    const { wallet } = this.ensureInitialized()
    return wallet.getBoardingAddress()
  }

  async getVtxos(): Promise<unknown[]> {
    const { wallet } = this.ensureInitialized()
    return wallet.getVtxos()
  }

  async payInvoice(invoice: string): Promise<{ amountSats: number; preimage: string; txid: string }> {
    const { lightning } = this.ensureInitialized()

    const result = await lightning.sendLightningPayment({ invoice })

    await this.getBalance()

    return {
      amountSats: result.amount,
      preimage: result.preimage,
      txid: result.txid,
    }
  }

  async createInvoice(amountSats: number, description: string = ''): Promise<string> {
    const { lightning } = this.ensureInitialized()

    if (amountSats < 400) {
      throw new Error('Amount must be at least 400 sats for Boltz swaps')
    }

    const result = await lightning.createLightningInvoice({
      amount: amountSats,
      description: description || 'Arkade Lightning payment',
    })

    setTimeout(async () => {
      try {
        await lightning.waitAndClaim(result.pendingSwap)
        await this.getBalance()
      } catch (e) {
        console.error('Failed to claim Lightning payment:', e)
      }
    }, 0)

    return result.invoice
  }

  async onboardBoardingUtxos(): Promise<string> {
    const { wallet } = this.ensureInitialized()
    const txid = await new Ramps(wallet).onboard()
    return txid
  }

  async checkAndAutoOnboard(): Promise<{ hasConfirmed: boolean; onboarded: boolean; pendingAmount?: number }> {
    const { wallet } = this.ensureInitialized()

    const balanceData = await wallet.getBalance()
    const confirmedBoarding = (balanceData as { boarding?: { confirmed: number } }).boarding?.confirmed ?? 0
    const unconfirmedBoarding = (balanceData as { boarding?: { unconfirmed: number } }).boarding?.unconfirmed ?? 0

    if (confirmedBoarding > 0) {
      await this.onboardBoardingUtxos()
      return { hasConfirmed: true, onboarded: true }
    }

    return {
      hasConfirmed: false,
      onboarded: false,
      pendingAmount: unconfirmedBoarding,
    }
  }

  async getSwapFees(): Promise<{ minerFees: number; percentage: number }> {
    const { lightning } = this.ensureInitialized()
    try {
      const fees = await lightning.getFees()
      return {
        minerFees: (fees as { minerFees?: number }).minerFees ?? 100,
        percentage: (fees as { percentage?: number }).percentage ?? 0.1,
      }
    } catch {
      return { minerFees: 100, percentage: 0.1 }
    }
  }

  calculateSwapFee(amountSats: number, fees: { minerFees: number; percentage: number }): number {
    return Math.ceil(amountSats * fees.percentage) + fees.minerFees
  }
}

let serviceInstance: ArkadeService | null = null

export function initArkadeService(config: ArkadeConfig): ArkadeService {
  serviceInstance = new ArkadeService(config)
  return serviceInstance
}

export function getArkadeService(): ArkadeService {
  if (!serviceInstance) {
    throw new Error('Arkade service not initialized')
  }
  return serviceInstance
}
