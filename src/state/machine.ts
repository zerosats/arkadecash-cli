import { getStorage } from '../storage/sqlite.js'
import type { DaemonState } from '../types.js'

interface StateRow {
  state: string
  updated_at: number
}

export function getDaemonState(): DaemonState {
  const storage = getStorage()

  const row = storage.prepare(
    `SELECT state FROM daemon_state WHERE id = 1`
  ).get() as StateRow | undefined

  return (row?.state as DaemonState) ?? 'UNINITIALIZED'
}

export function setDaemonState(state: DaemonState): void {
  const storage = getStorage()
  const now = Date.now()

  storage.prepare(
    `INSERT INTO daemon_state (id, state, updated_at)
     VALUES (1, ?, ?)
     ON CONFLICT(id) DO UPDATE SET state = ?, updated_at = ?`
  ).run(state, now, state, now)
}

export function isUnlocked(): boolean {
  return getDaemonState() === 'UNLOCKED'
}

export function isLocked(): boolean {
  return getDaemonState() === 'LOCKED'
}

export function isInitialized(): boolean {
  return getDaemonState() !== 'UNINITIALIZED'
}

export function requireUnlocked(): void {
  const state = getDaemonState()
  if (state === 'UNINITIALIZED') {
    throw new Error('Daemon not initialized. Run `pp init` first.')
  }
  if (state === 'LOCKED') {
    throw new Error('Daemon is locked. Run `pp unlock` first.')
  }
}

export function requireLocked(): void {
  const state = getDaemonState()
  if (state === 'UNINITIALIZED') {
    throw new Error('Daemon not initialized. Run `pp init` first.')
  }
  if (state === 'UNLOCKED') {
    throw new Error('Daemon is already unlocked.')
  }
}

export class StateMachine {
  private state: DaemonState

  constructor() {
    this.state = getDaemonState()
  }

  get current(): DaemonState {
    return this.state
  }

  refresh(): DaemonState {
    this.state = getDaemonState()
    return this.state
  }

  init(): void {
    if (this.state !== 'UNINITIALIZED') {
      throw new Error('Daemon is already initialized')
    }
    this.state = 'LOCKED'
    setDaemonState(this.state)
  }

  unlock(): void {
    if (this.state === 'UNINITIALIZED') {
      throw new Error('Daemon not initialized')
    }
    if (this.state === 'UNLOCKED') {
      return
    }
    this.state = 'UNLOCKED'
    setDaemonState(this.state)
  }

  lock(): void {
    if (this.state === 'UNINITIALIZED') {
      throw new Error('Daemon not initialized')
    }
    this.state = 'LOCKED'
    setDaemonState(this.state)
  }

  reset(): void {
    this.state = 'UNINITIALIZED'
    setDaemonState(this.state)
  }
}

let stateMachineInstance: StateMachine | null = null

export function getStateMachine(): StateMachine {
  if (!stateMachineInstance) {
    stateMachineInstance = new StateMachine()
  }
  return stateMachineInstance
}
