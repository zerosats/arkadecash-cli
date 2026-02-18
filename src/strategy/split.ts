import { getAllMintsWithBalances } from '../storage/mints.js'
import type { SplitStrategy, Mint } from '../types.js'

export interface SplitResult {
  mintId: string
  amountSats: number
}

export function calculateSplit(
  totalAmountSats: number,
  strategy: SplitStrategy
): SplitResult[] {
  const mints = getAllMintsWithBalances()
  if (mints.length === 0) {
    throw new Error('No mints available')
  }

  switch (strategy.type) {
    case 'single':
      return splitSingle(totalAmountSats, mints, strategy.targetMintId)

    case 'equal':
      return splitEqual(totalAmountSats, mints)

    case 'weighted':
      return splitWeighted(totalAmountSats, mints, strategy.weights ?? {})

    case 'random':
      return splitRandom(totalAmountSats, mints)

    default:
      return splitEqual(totalAmountSats, mints)
  }
}

function splitSingle(
  amountSats: number,
  mints: (Mint & { balance: number })[],
  targetMintId?: string
): SplitResult[] {
  const mint = targetMintId
    ? mints.find(m => m.id === targetMintId)
    : mints[0]

  if (!mint) {
    throw new Error(`Mint ${targetMintId} not found`)
  }

  return [{ mintId: mint.id, amountSats }]
}

function splitEqual(
  amountSats: number,
  mints: (Mint & { balance: number })[]
): SplitResult[] {
  const perMint = Math.floor(amountSats / mints.length)
  const remainder = amountSats % mints.length

  return mints.map((mint, i) => ({
    mintId: mint.id,
    amountSats: perMint + (i < remainder ? 1 : 0),
  }))
}

function splitWeighted(
  amountSats: number,
  mints: (Mint & { balance: number })[],
  weights: Record<string, number>
): SplitResult[] {
  const effectiveWeights: Record<string, number> = {}
  let totalWeight = 0

  for (const mint of mints) {
    const weight = weights[mint.id] ?? 1
    effectiveWeights[mint.id] = weight
    totalWeight += weight
  }

  if (totalWeight === 0) {
    return splitEqual(amountSats, mints)
  }

  const results: SplitResult[] = []
  let remaining = amountSats

  for (let i = 0; i < mints.length; i++) {
    const mint = mints[i]
    const weight = effectiveWeights[mint.id]

    if (i === mints.length - 1) {
      results.push({ mintId: mint.id, amountSats: remaining })
    } else {
      const amount = Math.floor((amountSats * weight) / totalWeight)
      results.push({ mintId: mint.id, amountSats: amount })
      remaining -= amount
    }
  }

  return results.filter(r => r.amountSats > 0)
}

function splitRandom(
  amountSats: number,
  mints: (Mint & { balance: number })[]
): SplitResult[] {
  const weights: Record<string, number> = {}

  for (const mint of mints) {
    weights[mint.id] = Math.random()
  }

  return splitWeighted(amountSats, mints, weights)
}

export function selectMintForDeposit(
  strategy: SplitStrategy
): string | null {
  const mints = getAllMintsWithBalances()
  if (mints.length === 0) return null

  switch (strategy.type) {
    case 'single':
      if (strategy.targetMintId) {
        return strategy.targetMintId
      }
      return mints[0].id

    case 'equal':
      const lowestBalance = [...mints].sort((a, b) => a.balance - b.balance)
      return lowestBalance[0].id

    case 'weighted':
      const weights = strategy.weights ?? {}
      const withWeights = mints.map(m => ({
        ...m,
        weight: weights[m.id] ?? 1,
      }))
      const highestWeight = [...withWeights].sort((a, b) => b.weight - a.weight)
      return highestWeight[0].id

    case 'random':
      const randomIndex = Math.floor(Math.random() * mints.length)
      return mints[randomIndex].id

    default:
      return mints[0].id
  }
}
