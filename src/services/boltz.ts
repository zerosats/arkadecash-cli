import { getArkadeService } from './arkade.js'
import type { BoltzConfig } from '../config/schema.js'

interface LightningPayResult {
  amountSats: number
  preimage: string
  feeSats: number
}

interface LightningInvoiceResult {
  invoice: string
}

interface BoltzFees {
  minerFees: number
  percentage: number
}

interface BoltzLimits {
  minSats: number
  maxSats: number
}

export class BoltzService {
  private config: BoltzConfig
  private initialized = false

  constructor(config: BoltzConfig) {
    this.config = config
  }

  initialize(): void {
    const arkade = getArkadeService()
    if (!arkade.isInitialized()) {
      throw new Error('Arkade wallet must be initialized before Boltz')
    }
    this.initialized = true
  }

  isInitialized(): boolean {
    return this.initialized
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('Boltz service not initialized')
    }
  }

  async sendLightningPayment(invoice: string): Promise<LightningPayResult> {
    this.ensureInitialized()
    const arkade = getArkadeService()
    const result = await arkade.payInvoice(invoice)
    const fees = await arkade.getSwapFees()
    return {
      amountSats: result.amountSats,
      preimage: result.preimage,
      feeSats: arkade.calculateSwapFee(result.amountSats, fees),
    }
  }

  async createLightningInvoice(amountSats: number, description?: string): Promise<LightningInvoiceResult> {
    this.ensureInitialized()
    const arkade = getArkadeService()
    const invoice = await arkade.createInvoice(amountSats, description)
    return { invoice }
  }

  async getFees(): Promise<BoltzFees> {
    this.ensureInitialized()
    const arkade = getArkadeService()
    return arkade.getSwapFees()
  }

  async getLimits(): Promise<BoltzLimits> {
    this.ensureInitialized()
    return {
      minSats: 400,
      maxSats: 25_000_000,
    }
  }

  getConfig(): BoltzConfig {
    return this.config
  }
}

let serviceInstance: BoltzService | null = null

export function initBoltzService(config: BoltzConfig): BoltzService {
  serviceInstance = new BoltzService(config)
  return serviceInstance
}

export function getBoltzService(): BoltzService {
  if (!serviceInstance) {
    throw new Error('Boltz service not initialized')
  }
  return serviceInstance
}
