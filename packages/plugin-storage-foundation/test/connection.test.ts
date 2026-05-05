import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeConnection, openConnection } from '../src/sqlite/connection.js'

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'plugin-storage-foundation-test-'))
})

afterEach(() => {
  try {
    rmSync(tmpDir, { recursive: true, force: true })
  } catch {
    // ignore
  }
})

describe('openConnection', () => {
  it('öffnet DB + creates parent-dir', () => {
    const dbPath = join(tmpDir, 'sub', 'dir', 'test.db')
    const db = openConnection({ path: dbPath })
    expect(db.open).toBe(true)
    closeConnection(db)
  })

  it('applied WAL-mode default', () => {
    const dbPath = join(tmpDir, 'test.db')
    const db = openConnection({ path: dbPath })
    const journalMode = db.pragma('journal_mode', { simple: true })
    expect(journalMode).toBe('wal')
    closeConnection(db)
  })

  it('applied foreign_keys=ON default', () => {
    const dbPath = join(tmpDir, 'test.db')
    const db = openConnection({ path: dbPath })
    const fk = db.pragma('foreign_keys', { simple: true })
    expect(fk).toBe(1)
    closeConnection(db)
  })

  it('readonly=true skipped WAL-mode', () => {
    // Erst write-mode öffnen + table erstellen, dann readonly öffnen
    const dbPath = join(tmpDir, 'test.db')
    const writer = openConnection({ path: dbPath })
    writer.exec('CREATE TABLE x (id INTEGER)')
    closeConnection(writer)

    const reader = openConnection({ path: dbPath, readonly: true })
    expect(reader.open).toBe(true)
    expect(() => reader.exec('CREATE TABLE y (id INTEGER)')).toThrow()
    closeConnection(reader)
  })

  it('busyTimeoutMs custom', () => {
    const dbPath = join(tmpDir, 'test.db')
    const db = openConnection({ path: dbPath, busyTimeoutMs: 12345 })
    const timeout = db.pragma('busy_timeout', { simple: true })
    expect(timeout).toBe(12345)
    closeConnection(db)
  })
})

describe('closeConnection', () => {
  it('idempotent — second call ist no-op', () => {
    const dbPath = join(tmpDir, 'test.db')
    const db = openConnection({ path: dbPath })
    closeConnection(db)
    expect(() => closeConnection(db)).not.toThrow()
  })

  it('null-safe', () => {
    expect(() => closeConnection(null)).not.toThrow()
  })
})
