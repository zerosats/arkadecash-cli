import { getStorage } from './sqlite.js'
import type { PendingQuote } from '../types.js'

interface PendingQuoteRow {
  quote_id: string
  mint_id: string
  type: string
  amount_sats: number
  invoice: string | null
  status: string
  created_at: number
}

function rowToQuote(row: PendingQuoteRow): PendingQuote {
  return {
    quoteId: row.quote_id,
    mintId: row.mint_id,
    type: row.type as 'mint' | 'melt',
    amountSats: row.amount_sats,
    invoice: row.invoice,
    status: row.status as PendingQuote['status'],
    createdAt: row.created_at,
  }
}

export function createPendingQuote(
  quoteId: string,
  mintId: string,
  type: 'mint' | 'melt',
  amountSats: number,
  invoice: string | null = null
): PendingQuote {
  const storage = getStorage()
  const now = Date.now()

  storage.prepare(
    `INSERT INTO pending_quotes (quote_id, mint_id, type, amount_sats, invoice, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(quoteId, mintId, type, amountSats, invoice, now)

  return {
    quoteId,
    mintId,
    type,
    amountSats,
    invoice,
    status: 'pending',
    createdAt: now,
  }
}

export function getPendingQuote(quoteId: string): PendingQuote | null {
  const storage = getStorage()
  const row = storage.prepare(
    `SELECT * FROM pending_quotes WHERE quote_id = ?`
  ).get(quoteId) as PendingQuoteRow | undefined

  return row ? rowToQuote(row) : null
}

export function updateQuoteStatus(quoteId: string, status: PendingQuote['status']): void {
  const storage = getStorage()
  storage.prepare(
    `UPDATE pending_quotes SET status = ? WHERE quote_id = ?`
  ).run(status, quoteId)
}

export function getPendingQuotesByMint(mintId: string): PendingQuote[] {
  const storage = getStorage()
  const rows = storage.prepare(
    `SELECT * FROM pending_quotes WHERE mint_id = ? AND status = 'pending'`
  ).all(mintId) as PendingQuoteRow[]

  return rows.map(rowToQuote)
}

export function getAllPendingQuotes(): PendingQuote[] {
  const storage = getStorage()
  const rows = storage.prepare(
    `SELECT * FROM pending_quotes WHERE status = 'pending'`
  ).all() as PendingQuoteRow[]

  return rows.map(rowToQuote)
}

export function cleanupOldQuotes(maxAgeMs: number = 24 * 60 * 60 * 1000): number {
  const storage = getStorage()
  const cutoff = Date.now() - maxAgeMs

  const result = storage.prepare(
    `DELETE FROM pending_quotes WHERE status != 'pending' AND created_at < ?`
  ).run(cutoff)

  return result.changes
}

export function expireOldQuotes(maxAgeMs: number = 60 * 60 * 1000): number {
  const storage = getStorage()
  const cutoff = Date.now() - maxAgeMs

  const result = storage.prepare(
    `UPDATE pending_quotes SET status = 'expired' WHERE status = 'pending' AND created_at < ?`
  ).run(cutoff)

  return result.changes
}
