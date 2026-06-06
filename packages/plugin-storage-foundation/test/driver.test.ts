// v0.7.0 (Drift #101): runtime-agnostic storage surface.
//
// These tests prove the Foundation's migration + pragma helpers operate purely
// against the structural `SqliteDb` interface — i.e. through ONLY exec/prepare/
// transaction, the members both better-sqlite3 and bun:sqlite expose. We drive
// them through a `SqliteDb`-typed handle (what a `bun:sqlite` Database looks like
// at the type level) so a regression that reintroduces a better-sqlite3-only API
// (`.pragma()`, generic `.prepare<>()`) fails to compile or run here.
//
// We can't spawn the Bun runtime inside Node/vitest, so we use an in-memory
// better-sqlite3 instance NARROWED to `SqliteDb`. That removes every
// better-sqlite3-specific member from the static type — the helpers must work
// with what's left, which is exactly the bun:sqlite overlap.

import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { applyPragmas } from '../src/sqlite/connection.js'
import { listApplied, migrate, rollbackTo, type Migration } from '../src/sqlite/migrations.js'
import type { SqliteDb } from '../src/sqlite/driver.js'

function openStructural(): SqliteDb {
  // better-sqlite3 Database is structurally assignable to SqliteDb (no cast).
  const db: SqliteDb = new Database(':memory:')
  return db
}

const MIG_001: Migration = {
  id: '0001_create_projects',
  up: (db) =>
    db.exec(
      'CREATE TABLE projects (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, user_id TEXT NOT NULL, title TEXT)',
    ),
  down: (db) => db.exec('DROP TABLE projects'),
}

const MIG_002: Migration = {
  id: '0002_add_scenes',
  up: (db) =>
    db.exec(
      'CREATE TABLE scenes (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, idx INTEGER NOT NULL)',
    ),
  down: (db) => db.exec('DROP TABLE scenes'),
}

describe('runtime-agnostic storage surface (SqliteDb)', () => {
  it('better-sqlite3 Database satisfies SqliteDb without a cast', () => {
    const db = openStructural()
    expect(typeof db.exec).toBe('function')
    expect(typeof db.prepare).toBe('function')
    expect(typeof db.transaction).toBe('function')
    db.close?.()
  })

  it('applyPragmas works through exec-only PRAGMA statements', () => {
    const db = openStructural()
    applyPragmas(db)
    // Read back via the structural prepare()/get() surface (no .pragma()).
    const fk = db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number }
    expect(fk.foreign_keys).toBe(1)
    db.close?.()
  })

  it('migrate() applies + tracks migrations against a SqliteDb handle', () => {
    const db = openStructural()
    applyPragmas(db)
    const res = migrate(db, [MIG_001, MIG_002])
    expect(res.applied).toEqual(['0001_create_projects', '0002_add_scenes'])
    expect(listApplied(db)).toEqual(['0001_create_projects', '0002_add_scenes'])
    // Tables really exist.
    const names = (
      db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{
        name: string
      }>
    ).map((r) => r.name)
    expect(names).toContain('projects')
    expect(names).toContain('scenes')
    db.close?.()
  })

  it('migrate() is idempotent (re-run skips applied)', () => {
    const db = openStructural()
    migrate(db, [MIG_001])
    const second = migrate(db, [MIG_001, MIG_002])
    expect(second.applied).toEqual(['0002_add_scenes'])
    expect(second.skipped).toEqual(['0001_create_projects'])
    db.close?.()
  })

  it('rollbackTo() reverses migrations via the SqliteDb surface', () => {
    const db = openStructural()
    migrate(db, [MIG_001, MIG_002])
    const { rolledBack } = rollbackTo(db, [MIG_001, MIG_002], '0001_create_projects')
    expect(rolledBack).toEqual(['0002_add_scenes'])
    expect(listApplied(db)).toEqual(['0001_create_projects'])
    db.close?.()
  })
})
