import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeConnection, openConnection } from '../src/sqlite/connection.js'
import { listApplied, migrate, rollbackTo, type Migration } from '../src/sqlite/migrations.js'

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'plugin-storage-foundation-migrations-test-'))
})

afterEach(() => {
  try {
    rmSync(tmpDir, { recursive: true, force: true })
  } catch {
    // ignore
  }
})

const MIG_001: Migration = {
  id: '0001_create_users',
  up: (db) => db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)'),
  down: (db) => db.exec('DROP TABLE users'),
}

const MIG_002: Migration = {
  id: '0002_add_email',
  up: (db) => db.exec('ALTER TABLE users ADD COLUMN email TEXT'),
  down: null, // SQLite-DROP-COLUMN ist tricky; non-reversible für Test-Demo
}

const MIG_003: Migration = {
  id: '0003_create_posts',
  up: (db) => db.exec('CREATE TABLE posts (id INTEGER PRIMARY KEY)'),
  down: (db) => db.exec('DROP TABLE posts'),
}

describe('migrate (forward-path)', () => {
  it('applied alle pending migrations in order', () => {
    const db = openConnection({ path: join(tmpDir, 't.db') })
    const result = migrate(db, [MIG_001, MIG_002, MIG_003])
    expect(result.applied).toEqual(['0001_create_users', '0002_add_email', '0003_create_posts'])
    expect(result.skipped).toEqual([])
    expect(listApplied(db)).toEqual([
      '0001_create_users',
      '0002_add_email',
      '0003_create_posts',
    ])
    closeConnection(db)
  })

  it('idempotent — re-call skipped applied', () => {
    const db = openConnection({ path: join(tmpDir, 't.db') })
    migrate(db, [MIG_001, MIG_002])
    const result = migrate(db, [MIG_001, MIG_002])
    expect(result.applied).toEqual([])
    expect(result.skipped).toEqual(['0001_create_users', '0002_add_email'])
    closeConnection(db)
  })

  it('skipt applied + applied nur new', () => {
    const db = openConnection({ path: join(tmpDir, 't.db') })
    migrate(db, [MIG_001])
    const result = migrate(db, [MIG_001, MIG_002, MIG_003])
    expect(result.applied).toEqual(['0002_add_email', '0003_create_posts'])
    expect(result.skipped).toEqual(['0001_create_users'])
    closeConnection(db)
  })

  it('atomicity per-migration — failed up rollbackt + applied bleibt', () => {
    const db = openConnection({ path: join(tmpDir, 't.db') })
    const failing: Migration = {
      id: '0002_failing',
      up: () => {
        throw new Error('intentional')
      },
      down: null,
    }
    expect(() => migrate(db, [MIG_001, failing])).toThrow('intentional')
    // 0001 ist applied, 0002_failing nicht
    expect(listApplied(db)).toEqual(['0001_create_users'])
    closeConnection(db)
  })
})

describe('rollbackTo (reverse-path)', () => {
  it('rollbackt bis target (exclusive)', () => {
    const db = openConnection({ path: join(tmpDir, 't.db') })
    migrate(db, [MIG_001, MIG_003]) // skip MIG_002 (non-reversible) für sauberen rollback
    const result = rollbackTo(db, [MIG_001, MIG_003], '0001_create_users')
    expect(result.rolledBack).toEqual(['0003_create_posts'])
    expect(listApplied(db)).toEqual(['0001_create_users'])
    closeConnection(db)
  })

  it('throws bei non-reversible migration im rollback-path', () => {
    const db = openConnection({ path: join(tmpDir, 't.db') })
    migrate(db, [MIG_001, MIG_002, MIG_003])
    expect(() => rollbackTo(db, [MIG_001, MIG_002, MIG_003], '0001_create_users')).toThrow(
      /non-reversible/,
    )
    closeConnection(db)
  })

  it('no-op wenn target == latest applied', () => {
    const db = openConnection({ path: join(tmpDir, 't.db') })
    migrate(db, [MIG_001])
    const result = rollbackTo(db, [MIG_001], '0001_create_users')
    expect(result.rolledBack).toEqual([])
    expect(listApplied(db)).toEqual(['0001_create_users'])
    closeConnection(db)
  })
})
