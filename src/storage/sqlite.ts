import Database, { type Statement as BetterStatement } from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export class SqliteStorage {
  private db: Database.Database

  constructor(dbPath: string) {
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
  }

  runMigrations(): void {
    const currentVersion = this.getCurrentSchemaVersion()

    const migrationFiles = ['001_init.sql']

    for (let i = currentVersion; i < migrationFiles.length; i++) {
      const migrationPath = resolve(__dirname, 'migrations', migrationFiles[i])
      const sql = readFileSync(migrationPath, 'utf-8')

      this.db.exec(sql)
      console.log(`Applied migration: ${migrationFiles[i]}`)
    }
  }

  private getCurrentSchemaVersion(): number {
    try {
      const row = this.db.prepare(
        'SELECT version FROM schema_version ORDER BY version DESC LIMIT 1'
      ).get() as { version: number } | undefined
      return row?.version ?? 0
    } catch {
      return 0
    }
  }

  prepare(sql: string): BetterStatement {
    return this.db.prepare(sql)
  }

  exec(sql: string): void {
    this.db.exec(sql)
  }

  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)()
  }

  close(): void {
    this.db.close()
  }

  get database(): Database.Database {
    return this.db
  }
}

let storageInstance: SqliteStorage | null = null

export function initStorage(dbPath: string): SqliteStorage {
  if (storageInstance) {
    return storageInstance
  }

  storageInstance = new SqliteStorage(dbPath)
  storageInstance.runMigrations()
  return storageInstance
}

export function getStorage(): SqliteStorage {
  if (!storageInstance) {
    throw new Error('Storage not initialized. Call initStorage first.')
  }
  return storageInstance
}

export function closeStorage(): void {
  if (storageInstance) {
    storageInstance.close()
    storageInstance = null
  }
}
