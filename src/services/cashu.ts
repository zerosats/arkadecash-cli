import { Mint as CashuMint, Wallet as CashuWallet, getEncodedToken, getDecodedToken, type Proof as CashuProof } from '@cashu/cashu-ts'
import {
  saveProofs,
  getUnspentProofs,
  lockProofs,
  commitSpend,
  rollbackSpend,
  calculateBalance,
  selectProofsForAmount,
} from '../storage/proofs.js'
import {
  getMint,
  createMint,
  getMintByUrl,
  recordSuccess,
  recordFailure,
} from '../storage/mints.js'
import { createPendingQuote, updateQuoteStatus } from '../storage/pending.js'
import { MintType, type Mint, type Proof } from '../types.js'

interface MintInstance {
  cashuMint: CashuMint
  wallet: CashuWallet
  mintInfo: unknown
}

const mintInstances = new Map<string, MintInstance>()

function proofToCashu(proof: Proof): CashuProof {
  return {
    id: proof.keysetId,
    amount: proof.amount,
    secret: proof.secret,
    C: proof.C,
  }
}

function cashuToProof(proof: CashuProof): Omit<Proof, 'id' | 'mintId' | 'createdAt' | 'lockId' | 'spentAt'> {
  return {
    secret: proof.secret,
    amount: proof.amount,
    C: proof.C,
    keysetId: proof.id,
  }
}

export class CashuService {
  private bip39Seed: Uint8Array | null = null

  setBip39Seed(seed: Uint8Array): void {
    this.bip39Seed = seed
  }

  async ensureMint(mintUrl: string, name?: string): Promise<Mint> {
    let mint = getMintByUrl(mintUrl)
    if (mint) return mint

    mint = createMint({
      type: MintType.CASHU,
      name: name ?? new URL(mintUrl).hostname,
      url: mintUrl,
      inviteCode: null,
      federationId: null,
      trustScore: 50,
    })

    return mint
  }

  async initializeWallet(mintId: string): Promise<MintInstance> {
    const existing = mintInstances.get(mintId)
    if (existing) return existing

    const mint = getMint(mintId)
    if (!mint || !mint.url) {
      throw new Error(`Mint ${mintId} not found or has no URL`)
    }

    const cashuMint = new CashuMint(mint.url)

    const walletOptions: { unit: string; bip39seed?: Uint8Array } = { unit: 'sat' }
    if (this.bip39Seed) {
      walletOptions.bip39seed = this.bip39Seed
    }

    const wallet = new CashuWallet(cashuMint, walletOptions)
    await wallet.loadMint()

    let mintInfo = null
    try {
      mintInfo = await cashuMint.getInfo()
    } catch (e) {
      console.warn(`Could not fetch mint info for ${mint.name}:`, e)
    }

    const instance: MintInstance = { cashuMint, wallet, mintInfo }
    mintInstances.set(mintId, instance)

    return instance
  }

  getBalance(mintId: string): number {
    return calculateBalance(mintId)
  }

  async createMintQuote(mintId: string, amountSats: number): Promise<{ quoteId: string; invoice: string }> {
    const instance = await this.initializeWallet(mintId)

    const quote = await instance.wallet.createMintQuote(amountSats)

    createPendingQuote(quote.quote, mintId, 'mint', amountSats, quote.request)

    return {
      quoteId: quote.quote,
      invoice: quote.request,
    }
  }

  async checkMintQuote(mintId: string, quoteId: string): Promise<{ paid: boolean; state: string }> {
    const instance = await this.initializeWallet(mintId)

    const status = await instance.wallet.checkMintQuote(quoteId)

    if (status.state === 'PAID') {
      updateQuoteStatus(quoteId, 'paid')
    }

    return {
      paid: status.state === 'PAID',
      state: status.state,
    }
  }

  async mintTokens(mintId: string, amountSats: number, quoteId: string): Promise<number> {
    const instance = await this.initializeWallet(mintId)

    const newProofs = await instance.wallet.mintProofs(amountSats, quoteId)

    const storedProofs = saveProofs(mintId, newProofs.map(cashuToProof))

    updateQuoteStatus(quoteId, 'completed')
    recordSuccess(mintId, amountSats)

    return storedProofs.reduce((sum, p) => sum + p.amount, 0)
  }

  async payInvoice(mintId: string, invoice: string): Promise<{ amountSats: number; feeSats: number }> {
    const instance = await this.initializeWallet(mintId)

    const meltQuote = await instance.wallet.createMeltQuote(invoice)
    const totalNeeded = meltQuote.amount + meltQuote.fee_reserve

    const balance = this.getBalance(mintId)
    if (balance < totalNeeded) {
      throw new Error(`Insufficient balance. Have ${balance} sats, need ${totalNeeded} sats`)
    }

    const proofsToMelt = selectProofsForAmount(mintId, totalNeeded)
    if (!proofsToMelt) {
      throw new Error('Could not select sufficient proofs')
    }

    const lockId = lockProofs(mintId, proofsToMelt.map(p => p.secret))

    try {
      const cashuProofs = proofsToMelt.map(proofToCashu)
      const { change } = await instance.wallet.meltProofs(meltQuote, cashuProofs)

      if (change && change.length > 0) {
        saveProofs(mintId, change.map(cashuToProof))
      }

      commitSpend(lockId)
      recordSuccess(mintId, meltQuote.amount)

      const actualFee = meltQuote.fee_reserve - (change?.reduce((s: number, p: CashuProof) => s + p.amount, 0) ?? 0)

      return {
        amountSats: meltQuote.amount,
        feeSats: actualFee,
      }
    } catch (error) {
      rollbackSpend(lockId)
      recordFailure(mintId)
      throw error
    }
  }

  async sendEcash(mintId: string, amountSats: number): Promise<string> {
    const instance = await this.initializeWallet(mintId)

    const balance = this.getBalance(mintId)
    if (balance < amountSats) {
      throw new Error(`Insufficient balance. Have ${balance} sats, need ${amountSats} sats`)
    }

    const proofsToSend = selectProofsForAmount(mintId, amountSats)
    if (!proofsToSend) {
      throw new Error('Could not select sufficient proofs')
    }

    const lockId = lockProofs(mintId, proofsToSend.map(p => p.secret))

    try {
      const cashuProofs = proofsToSend.map(proofToCashu)
      const { send: sendProofs, keep: keepProofs } = await instance.wallet.send(amountSats, cashuProofs)

      if (keepProofs && keepProofs.length > 0) {
        saveProofs(mintId, keepProofs.map(cashuToProof))
      }

      commitSpend(lockId)

      const mint = getMint(mintId)
      const token = getEncodedToken({
        mint: mint!.url!,
        proofs: sendProofs,
      })

      return token
    } catch (error) {
      rollbackSpend(lockId)
      throw error
    }
  }

  async receiveEcash(mintId: string, token: string): Promise<number> {
    const instance = await this.initializeWallet(mintId)

    let decoded
    try {
      decoded = getDecodedToken(token)
    } catch {
      throw new Error('Invalid token format')
    }

    const mint = getMint(mintId)
    if (decoded.mint && decoded.mint !== mint?.url) {
      console.warn(`Token is from different mint: ${decoded.mint}`)
    }

    const receivedProofs = await instance.wallet.receive(token)

    const storedProofs = saveProofs(mintId, receivedProofs.map(cashuToProof))

    const receivedAmount = storedProofs.reduce((sum, p) => sum + p.amount, 0)

    return receivedAmount
  }

  async restoreFromSeed(mintId: string): Promise<{ found: number; added: number }> {
    if (!this.bip39Seed) {
      throw new Error('No seed available for NUT-13 recovery')
    }

    const instance = await this.initializeWallet(mintId)

    const keysetsResponse = await instance.cashuMint.getKeySets()
    let totalRestored = 0
    const batchSize = 100
    const maxGap = 3

    for (const keyset of keysetsResponse.keysets) {
      let emptyBatches = 0
      let start = 0

      while (emptyBatches < maxGap) {
        try {
          const { proofs: restoredProofs } = await instance.wallet.restore(start, batchSize, {
            keysetId: keyset.id,
          })

          if (restoredProofs.length === 0) {
            emptyBatches++
          } else {
            emptyBatches = 0

            const states = await instance.wallet.checkProofsStates(restoredProofs)
            const unspent = restoredProofs.filter((_: CashuProof, i: number) => states[i].state !== 'SPENT')

            if (unspent.length > 0) {
              const existingProofs = getUnspentProofs(mintId)
              const existingSecrets = new Set(existingProofs.map(p => p.secret))
              const newProofs = unspent.filter((p: CashuProof) => !existingSecrets.has(p.secret))

              if (newProofs.length > 0) {
                saveProofs(mintId, newProofs.map(cashuToProof))
                totalRestored += newProofs.length
              }
            }
          }

          start += batchSize
        } catch (e) {
          emptyBatches++
        }
      }
    }

    return {
      found: totalRestored,
      added: totalRestored,
    }
  }
}

let serviceInstance: CashuService | null = null

export function getCashuService(): CashuService {
  if (!serviceInstance) {
    serviceInstance = new CashuService()
  }
  return serviceInstance
}
