import { randomBytes, scryptSync, createCipheriv, createDecipheriv } from 'node:crypto'
import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english'
import { HDKey } from '@scure/bip32'
import { getStorage } from '../storage/sqlite.js'
import { getStateMachine } from './machine.js'

const SALT_LENGTH = 32
const KEY_LENGTH = 32
const IV_LENGTH = 16
const SCRYPT_N = 2 ** 14
const SCRYPT_R = 8
const SCRYPT_P = 1

interface SeedRow {
  encrypted_seed: Buffer
  salt: Buffer
  created_at: number
}

function deriveKey(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, KEY_LENGTH, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P })
}

function encrypt(data: Buffer, password: string): { encrypted: Buffer; salt: Buffer } {
  const salt = randomBytes(SALT_LENGTH)
  const key = deriveKey(password, salt)
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv('aes-256-gcm', key, iv)

  const encrypted = Buffer.concat([cipher.update(data), cipher.final()])
  const authTag = cipher.getAuthTag()

  return {
    encrypted: Buffer.concat([iv, authTag, encrypted]),
    salt,
  }
}

function decrypt(encrypted: Buffer, salt: Buffer, password: string): Buffer {
  const key = deriveKey(password, salt)
  const iv = encrypted.subarray(0, IV_LENGTH)
  const authTag = encrypted.subarray(IV_LENGTH, IV_LENGTH + 16)
  const data = encrypted.subarray(IV_LENGTH + 16)

  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(authTag)

  return Buffer.concat([decipher.update(data), decipher.final()])
}

export function hasSeed(): boolean {
  const storage = getStorage()
  const row = storage.prepare(`SELECT 1 FROM seed_store WHERE id = 1`).get()
  return !!row
}

export function createSeed(password: string, mnemonic?: string): string {
  if (hasSeed()) {
    throw new Error('Seed already exists. Use resetSeed to create a new one.')
  }

  const seedPhrase = mnemonic ?? generateMnemonic(wordlist, 256)

  if (!validateMnemonic(seedPhrase, wordlist)) {
    throw new Error('Invalid mnemonic phrase')
  }

  const seedBuffer = Buffer.from(seedPhrase, 'utf-8')
  const { encrypted, salt } = encrypt(seedBuffer, password)
  const now = Date.now()

  const storage = getStorage()
  storage.prepare(
    `INSERT INTO seed_store (id, encrypted_seed, salt, created_at) VALUES (1, ?, ?, ?)`
  ).run(encrypted, salt, now)

  getStateMachine().init()

  return seedPhrase
}

export function unlockSeed(password: string): string {
  const storage = getStorage()
  const row = storage.prepare(
    `SELECT encrypted_seed, salt FROM seed_store WHERE id = 1`
  ).get() as SeedRow | undefined

  if (!row) {
    throw new Error('No seed found. Run initialization first.')
  }

  try {
    const decrypted = decrypt(row.encrypted_seed, row.salt, password)
    const mnemonic = decrypted.toString('utf-8')

    if (!validateMnemonic(mnemonic, wordlist)) {
      throw new Error('Invalid password')
    }

    getStateMachine().unlock()

    return mnemonic
  } catch (error) {
    if (error instanceof Error && error.message === 'Invalid password') {
      throw error
    }
    throw new Error('Invalid password')
  }
}

export function lockSeed(): void {
  getStateMachine().lock()
}

export function resetSeed(): void {
  const storage = getStorage()
  storage.prepare(`DELETE FROM seed_store WHERE id = 1`).run()
  getStateMachine().reset()
}

let currentMnemonic: string | null = null

export function getCurrentMnemonic(): string | null {
  return currentMnemonic
}

export function setCurrentMnemonic(mnemonic: string): void {
  currentMnemonic = mnemonic
}

export function clearCurrentMnemonic(): void {
  currentMnemonic = null
}

export function deriveCashuSeed(mnemonic: string): Uint8Array {
  const seed = mnemonicToSeedSync(mnemonic)
  const hdKey = HDKey.fromMasterSeed(seed)
  const cashuPath = "m/129372'/0'/0'"
  const derived = hdKey.derive(cashuPath)
  return derived.privateKey!
}

export function deriveFedimintMnemonic(mnemonic: string): string[] {
  const words = mnemonic.split(' ')
  return words
}

export function deriveArkadeMnemonic(mnemonic: string): string {
  return mnemonic
}

export function derivePrivateKey(mnemonic: string, index: number): string {
  const seed = mnemonicToSeedSync(mnemonic)
  const hdKey = HDKey.fromMasterSeed(seed)
  const path = `m/84'/0'/0'/0/${index}`
  const derived = hdKey.derive(path)
  return Buffer.from(derived.privateKey!).toString('hex')
}
