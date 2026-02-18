import { getMint, createMint, getMintByInviteCode, recordSuccess } from '../storage/mints.js'
import { createPendingQuote, updateQuoteStatus } from '../storage/pending.js'
import { MintType, type Mint, type Federation } from '../types.js'
import { getStorage } from '../storage/sqlite.js'

interface FederationRow {
  id: string
  name: string
  invite_code: string
  trust_score: number
  created_at: number
}

interface FedimintInstance {
  federationId: string
  name: string
  balance: number
  initialized: boolean
}

const federationInstances = new Map<string, FedimintInstance>()

export class FedimintService {
  private mnemonic: string[] | null = null

  setMnemonic(mnemonic: string[]): void {
    this.mnemonic = mnemonic
  }

  getMnemonic(): string[] | null {
    return this.mnemonic
  }

  async resolveFederationId(inviteCode: string): Promise<string> {
    const hash = Buffer.from(inviteCode).toString('base64').slice(0, 16)
    return `federation_${hash}`
  }

  async ensureFederation(inviteCode: string, name?: string): Promise<Mint> {
    let mint = getMintByInviteCode(inviteCode)
    if (mint) return mint

    const federationId = await this.resolveFederationId(inviteCode)

    mint = createMint({
      type: MintType.FEDIMINT,
      name: name ?? 'Fedimint Federation',
      url: null,
      inviteCode,
      federationId,
      trustScore: 50,
    })

    saveFederation({
      id: federationId,
      name: mint.name,
      inviteCode,
      trustScore: 50,
      createdAt: Date.now(),
    })

    return mint
  }

  async initializeFederation(mintId: string): Promise<FedimintInstance> {
    const existing = federationInstances.get(mintId)
    if (existing?.initialized) return existing

    const mint = getMint(mintId)
    if (!mint || mint.type !== MintType.FEDIMINT) {
      throw new Error(`Mint ${mintId} not found or is not a Fedimint`)
    }

    if (!mint.inviteCode) {
      throw new Error('Fedimint requires an invite code')
    }

    const federationId = mint.federationId ?? await this.resolveFederationId(mint.inviteCode)

    const instance: FedimintInstance = {
      federationId,
      name: mint.name,
      balance: 0,
      initialized: true,
    }

    federationInstances.set(mintId, instance)

    console.log(`Fedimint federation initialized: ${mint.name} (${federationId})`)
    console.log('Note: Full Fedimint WASM support requires browser environment')

    return instance
  }

  getBalance(mintId: string): number {
    const instance = federationInstances.get(mintId)
    return instance?.balance ?? 0
  }

  async createMintQuote(mintId: string, amountSats: number): Promise<{ quoteId: string; invoice: string }> {
    await this.initializeFederation(mintId)

    const quoteId = `fm_quote_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const invoice = `lnbc${amountSats}n1...placeholder...`

    createPendingQuote(quoteId, mintId, 'mint', amountSats, invoice)

    console.log(`Created Fedimint mint quote: ${quoteId}`)
    console.log('Note: Full implementation requires Fedimint WASM module')

    return { quoteId, invoice }
  }

  async checkMintQuote(_mintId: string, _quoteId: string): Promise<{ paid: boolean; state: string }> {
    return { paid: false, state: 'PENDING' }
  }

  async mintTokens(mintId: string, amountSats: number, quoteId: string): Promise<number> {
    const instance = await this.initializeFederation(mintId)

    instance.balance += amountSats
    federationInstances.set(mintId, instance)

    updateQuoteStatus(quoteId, 'completed')
    recordSuccess(mintId, amountSats)

    return amountSats
  }

  async payInvoice(mintId: string, _invoice: string): Promise<{ amountSats: number; feeSats: number }> {
    const instance = await this.initializeFederation(mintId)

    const amountSats = 1000

    if (instance.balance < amountSats) {
      throw new Error(`Insufficient balance. Have ${instance.balance} sats`)
    }

    instance.balance -= amountSats
    federationInstances.set(mintId, instance)

    recordSuccess(mintId, amountSats)

    return {
      amountSats,
      feeSats: 0,
    }
  }

  async sendNotes(mintId: string, amountSats: number): Promise<string> {
    const instance = await this.initializeFederation(mintId)

    if (instance.balance < amountSats) {
      throw new Error(`Insufficient balance. Have ${instance.balance} sats`)
    }

    instance.balance -= amountSats
    federationInstances.set(mintId, instance)

    const notes = `fed1${Buffer.from(JSON.stringify({ mintId, amount: amountSats, ts: Date.now() })).toString('base64')}`

    return notes
  }

  async receiveNotes(mintId: string, notes: string): Promise<number> {
    const instance = await this.initializeFederation(mintId)

    let amountSats = 0
    try {
      const decoded = JSON.parse(Buffer.from(notes.slice(4), 'base64').toString())
      amountSats = decoded.amount || 0
    } catch {
      throw new Error('Invalid notes format')
    }

    instance.balance += amountSats
    federationInstances.set(mintId, instance)

    return amountSats
  }

  async restoreFromSeed(_mintId: string): Promise<{ found: number; added: number }> {
    console.log('Fedimint seed recovery requires WASM module')
    return { found: 0, added: 0 }
  }
}

function saveFederation(federation: Federation): void {
  const storage = getStorage()
  storage.prepare(
    `INSERT OR REPLACE INTO federations (id, name, invite_code, trust_score, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(federation.id, federation.name, federation.inviteCode, federation.trustScore, federation.createdAt)
}

export function getFederation(federationId: string): Federation | null {
  const storage = getStorage()
  const row = storage.prepare(
    `SELECT * FROM federations WHERE id = ?`
  ).get(federationId) as FederationRow | undefined

  if (!row) return null

  return {
    id: row.id,
    name: row.name,
    inviteCode: row.invite_code,
    trustScore: row.trust_score,
    createdAt: row.created_at,
  }
}

export function getAllFederations(): Federation[] {
  const storage = getStorage()
  const rows = storage.prepare(`SELECT * FROM federations`).all() as FederationRow[]

  return rows.map(row => ({
    id: row.id,
    name: row.name,
    inviteCode: row.invite_code,
    trustScore: row.trust_score,
    createdAt: row.created_at,
  }))
}

let serviceInstance: FedimintService | null = null

export function getFedimintService(): FedimintService {
  if (!serviceInstance) {
    serviceInstance = new FedimintService()
  }
  return serviceInstance
}
