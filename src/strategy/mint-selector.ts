import { getAllMintsWithBalances, getMint } from '../storage/mints.js'

export interface MintScore {
  mintId: string
  score: number
  balance: number
  trustScore: number
  successRate: number
}

export function scoreMints(): MintScore[] {
  const mints = getAllMintsWithBalances()

  return mints.map(mint => {
    const totalOps = mint.successfulOps + mint.failedOps
    const successRate = totalOps > 0 ? mint.successfulOps / totalOps : 0.5

    const score =
      mint.trustScore * 0.4 +
      successRate * 100 * 0.3 +
      (mint.balance > 0 ? 30 : 0)

    return {
      mintId: mint.id,
      score,
      balance: mint.balance,
      trustScore: mint.trustScore,
      successRate,
    }
  })
}

export function selectMintForPayment(requiredSats: number): string | null {
  const mints = getAllMintsWithBalances()
  const eligible = mints.filter(m => m.balance >= requiredSats)

  if (eligible.length === 0) return null

  const scores = scoreMints().filter(s =>
    eligible.some(m => m.id === s.mintId)
  )

  scores.sort((a, b) => b.score - a.score)

  return scores[0]?.mintId ?? null
}

export function selectBestMint(): string | null {
  const scores = scoreMints()
  if (scores.length === 0) return null

  scores.sort((a, b) => b.score - a.score)
  return scores[0].mintId
}

export function selectMintWithLowestBalance(): string | null {
  const mints = getAllMintsWithBalances()
  if (mints.length === 0) return null

  const sorted = [...mints].sort((a, b) => a.balance - b.balance)
  return sorted[0].id
}

export function selectMintWithHighestBalance(): string | null {
  const mints = getAllMintsWithBalances()
  if (mints.length === 0) return null

  const sorted = [...mints].sort((a, b) => b.balance - a.balance)
  return sorted[0].id
}

export function getMintStats(mintId: string): {
  balance: number
  trustScore: number
  successfulOps: number
  failedOps: number
  successRate: number
} | null {
  const mint = getMint(mintId)
  if (!mint) return null

  const mints = getAllMintsWithBalances()
  const withBalance = mints.find(m => m.id === mintId)

  const totalOps = mint.successfulOps + mint.failedOps
  const successRate = totalOps > 0 ? mint.successfulOps / totalOps : 0.5

  return {
    balance: withBalance?.balance ?? 0,
    trustScore: mint.trustScore,
    successfulOps: mint.successfulOps,
    failedOps: mint.failedOps,
    successRate,
  }
}
