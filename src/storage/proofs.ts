import { randomUUID } from 'node:crypto'
import { getStorage } from './sqlite.js'
import type { Proof } from '../types.js'

interface ProofRow {
  id: string
  mint_id: string
  secret: string
  amount: number
  c: string
  keyset_id: string
  created_at: number
  lock_id: string | null
  spent_at: number | null
}

function rowToProof(row: ProofRow): Proof {
  return {
    id: row.id,
    mintId: row.mint_id,
    secret: row.secret,
    amount: row.amount,
    C: row.c,
    keysetId: row.keyset_id,
    createdAt: row.created_at,
    lockId: row.lock_id,
    spentAt: row.spent_at,
  }
}

export function saveProofs(mintId: string, proofs: Omit<Proof, 'id' | 'mintId' | 'createdAt' | 'lockId' | 'spentAt'>[]): Proof[] {
  const storage = getStorage()
  const now = Date.now()

  const insert = storage.prepare(
    `INSERT INTO proofs (id, mint_id, secret, amount, c, keyset_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )

  const savedProofs: Proof[] = []

  storage.transaction(() => {
    for (const proof of proofs) {
      const id = randomUUID()
      insert.run(id, mintId, proof.secret, proof.amount, proof.C, proof.keysetId, now)
      savedProofs.push({
        id,
        mintId,
        secret: proof.secret,
        amount: proof.amount,
        C: proof.C,
        keysetId: proof.keysetId,
        createdAt: now,
        lockId: null,
        spentAt: null,
      })
    }
  })

  return savedProofs
}

export function getProofsByMint(mintId: string): Proof[] {
  const storage = getStorage()
  const rows = storage.prepare(
    `SELECT * FROM proofs WHERE mint_id = ? AND spent_at IS NULL`
  ).all(mintId) as ProofRow[]

  return rows.map(rowToProof)
}

export function getUnspentProofs(mintId: string): Proof[] {
  const storage = getStorage()
  const rows = storage.prepare(
    `SELECT * FROM proofs WHERE mint_id = ? AND spent_at IS NULL AND lock_id IS NULL`
  ).all(mintId) as ProofRow[]

  return rows.map(rowToProof)
}

export function lockProofs(mintId: string, secrets: string[]): string {
  const storage = getStorage()
  const lockId = `lock_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`

  const lockedSecrets = storage.prepare(
    `SELECT secret FROM proofs WHERE lock_id IS NOT NULL AND spent_at IS NULL`
  ).all() as { secret: string }[]

  const lockedSet = new Set(lockedSecrets.map(r => r.secret))
  const conflict = secrets.find(s => lockedSet.has(s))
  if (conflict) {
    throw new Error('Proof is already locked for another operation')
  }

  const placeholders = secrets.map(() => '?').join(',')
  storage.prepare(
    `UPDATE proofs SET lock_id = ? WHERE mint_id = ? AND secret IN (${placeholders}) AND spent_at IS NULL`
  ).run(lockId, mintId, ...secrets)

  return lockId
}

export function unlockProofs(lockId: string): void {
  const storage = getStorage()
  storage.prepare(`UPDATE proofs SET lock_id = NULL WHERE lock_id = ?`).run(lockId)
}

export function commitSpend(lockId: string): void {
  const storage = getStorage()
  const now = Date.now()
  storage.prepare(
    `UPDATE proofs SET spent_at = ?, lock_id = NULL WHERE lock_id = ?`
  ).run(now, lockId)
}

export function rollbackSpend(lockId: string): void {
  unlockProofs(lockId)
}

export function markProofsSpent(secrets: string[]): void {
  const storage = getStorage()
  const now = Date.now()
  const placeholders = secrets.map(() => '?').join(',')
  storage.prepare(
    `UPDATE proofs SET spent_at = ?, lock_id = NULL WHERE secret IN (${placeholders})`
  ).run(now, ...secrets)
}

export function getLockedProofs(lockId: string): Proof[] {
  const storage = getStorage()
  const rows = storage.prepare(
    `SELECT * FROM proofs WHERE lock_id = ?`
  ).all(lockId) as ProofRow[]

  return rows.map(rowToProof)
}

export function cleanupStaleLocks(maxAgeMs: number = 5 * 60 * 1000): number {
  const storage = getStorage()
  const cutoff = Date.now() - maxAgeMs

  const stale = storage.prepare(
    `SELECT lock_id FROM proofs WHERE lock_id IS NOT NULL AND created_at < ? GROUP BY lock_id`
  ).all(cutoff) as { lock_id: string }[]

  let cleaned = 0
  for (const row of stale) {
    unlockProofs(row.lock_id)
    cleaned++
  }

  return cleaned
}

export function calculateBalance(mintId: string): number {
  const storage = getStorage()
  const row = storage.prepare(
    `SELECT COALESCE(SUM(amount), 0) as total FROM proofs WHERE mint_id = ? AND spent_at IS NULL`
  ).get(mintId) as { total: number }

  return row.total
}

export function getTotalBalance(): number {
  const storage = getStorage()
  const row = storage.prepare(
    `SELECT COALESCE(SUM(amount), 0) as total FROM proofs WHERE spent_at IS NULL`
  ).get() as { total: number }

  return row.total
}

export function selectProofsForAmount(mintId: string, targetAmount: number): Proof[] | null {
  const available = getUnspentProofs(mintId)
  const sorted = [...available].sort((a, b) => b.amount - a.amount)

  const selected: Proof[] = []
  let total = 0

  for (const proof of sorted) {
    if (total >= targetAmount) break
    selected.push(proof)
    total += proof.amount
  }

  if (total < targetAmount) {
    return null
  }

  return selected
}
