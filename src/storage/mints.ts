import { randomUUID } from 'node:crypto'
import { getStorage } from './sqlite.js'
import type { Mint, MintType } from '../types.js'

interface MintRow {
  id: string
  type: string
  name: string
  url: string | null
  invite_code: string | null
  federation_id: string | null
  trust_score: number
  successful_ops: number
  failed_ops: number
  created_at: number
}

function rowToMint(row: MintRow): Mint {
  return {
    id: row.id,
    type: row.type as MintType,
    name: row.name,
    url: row.url,
    inviteCode: row.invite_code,
    federationId: row.federation_id,
    trustScore: row.trust_score,
    successfulOps: row.successful_ops,
    failedOps: row.failed_ops,
    createdAt: row.created_at,
  }
}

export function createMint(mint: Omit<Mint, 'id' | 'successfulOps' | 'failedOps' | 'createdAt'> & { id?: string }): Mint {
  const storage = getStorage()
  const id = mint.id || randomUUID()
  const now = Date.now()

  storage.prepare(
    `INSERT INTO mints (id, type, name, url, invite_code, federation_id, trust_score, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, mint.type, mint.name, mint.url, mint.inviteCode, mint.federationId, mint.trustScore, now)

  return {
    id,
    type: mint.type,
    name: mint.name,
    url: mint.url,
    inviteCode: mint.inviteCode,
    federationId: mint.federationId,
    trustScore: mint.trustScore,
    successfulOps: 0,
    failedOps: 0,
    createdAt: now,
  }
}

export function getMint(mintId: string): Mint | null {
  const storage = getStorage()
  const row = storage.prepare(
    `SELECT * FROM mints WHERE id = ?`
  ).get(mintId) as MintRow | undefined

  return row ? rowToMint(row) : null
}

export function getMintByUrl(url: string): Mint | null {
  const storage = getStorage()
  const normalized = url.replace(/\/$/, '').toLowerCase()
  const row = storage.prepare(
    `SELECT * FROM mints WHERE LOWER(REPLACE(url, '/', '')) = ?`
  ).get(normalized) as MintRow | undefined

  return row ? rowToMint(row) : null
}

export function getMintByInviteCode(inviteCode: string): Mint | null {
  const storage = getStorage()
  const row = storage.prepare(
    `SELECT * FROM mints WHERE invite_code = ?`
  ).get(inviteCode) as MintRow | undefined

  return row ? rowToMint(row) : null
}

export function getAllMints(): Mint[] {
  const storage = getStorage()
  const rows = storage.prepare(`SELECT * FROM mints`).all() as MintRow[]
  return rows.map(rowToMint)
}

export function getMintsByType(type: MintType): Mint[] {
  const storage = getStorage()
  const rows = storage.prepare(
    `SELECT * FROM mints WHERE type = ?`
  ).all(type) as MintRow[]

  return rows.map(rowToMint)
}

export function updateMint(mintId: string, updates: Partial<Pick<Mint, 'name' | 'trustScore' | 'federationId'>>): Mint | null {
  const storage = getStorage()
  const existing = getMint(mintId)
  if (!existing) return null

  const fields: string[] = []
  const values: (string | number | null)[] = []

  if (updates.name !== undefined) {
    fields.push('name = ?')
    values.push(updates.name)
  }
  if (updates.trustScore !== undefined) {
    fields.push('trust_score = ?')
    values.push(updates.trustScore)
  }
  if (updates.federationId !== undefined) {
    fields.push('federation_id = ?')
    values.push(updates.federationId)
  }

  if (fields.length === 0) return existing

  values.push(mintId)
  storage.prepare(`UPDATE mints SET ${fields.join(', ')} WHERE id = ?`).run(...values)

  return getMint(mintId)
}

export function deleteMint(mintId: string): boolean {
  const storage = getStorage()
  const result = storage.prepare(`DELETE FROM mints WHERE id = ?`).run(mintId)
  return result.changes > 0
}

export function recordSuccess(mintId: string, _amountSats: number): void {
  const storage = getStorage()
  storage.prepare(
    `UPDATE mints SET successful_ops = successful_ops + 1 WHERE id = ?`
  ).run(mintId)
}

export function recordFailure(mintId: string): void {
  const storage = getStorage()
  storage.prepare(
    `UPDATE mints SET failed_ops = failed_ops + 1 WHERE id = ?`
  ).run(mintId)
}

export function getMintWithBalance(mintId: string): Mint & { balance: number } | null {
  const storage = getStorage()
  const row = storage.prepare(
    `SELECT m.*, COALESCE(SUM(p.amount), 0) as balance
     FROM mints m
     LEFT JOIN proofs p ON p.mint_id = m.id AND p.spent_at IS NULL
     WHERE m.id = ?
     GROUP BY m.id`
  ).get(mintId) as (MintRow & { balance: number }) | undefined

  if (!row) return null

  return {
    ...rowToMint(row),
    balance: row.balance,
  }
}

export function getAllMintsWithBalances(): (Mint & { balance: number })[] {
  const storage = getStorage()
  const rows = storage.prepare(
    `SELECT m.*, COALESCE(SUM(p.amount), 0) as balance
     FROM mints m
     LEFT JOIN proofs p ON p.mint_id = m.id AND p.spent_at IS NULL
     GROUP BY m.id`
  ).all() as (MintRow & { balance: number })[]

  return rows.map(row => ({
    ...rowToMint(row),
    balance: row.balance,
  }))
}
