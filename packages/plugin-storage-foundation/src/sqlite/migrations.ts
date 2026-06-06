// Migration-Pattern mit Down-Path. Reference: Kanban-CC's
// packages/kanban-sqlite/src/migrations.ts.
//
// Jede Migration ist `{ id, up, down }`. `id` muss monotonic-increasing
// (z.B. `0001_initial`, `0002_add_tags`). Migrations table tracked
// applied-state.
//
// Up-Path: forward-migrate. Sorted by id ascending. Skip already-applied.
// Down-Path: rollback-migrate. Sorted by id descending. Stop bei target.
//
// Idempotent: Re-running migrate() ist no-op wenn alle applied.

import { StorageError } from '../errors.js'
import type { SqliteDb } from './driver.js'

export interface Migration<DB extends SqliteDb = SqliteDb> {
  /** Monotonic ID, z.B. "0001_initial" */
  id: string
  /** Forward-migrate. Wird in transaction gewrappt. */
  up: (db: DB) => void
  /** Rollback. Wird in transaction gewrappt. Optional — wenn null,
      dann ist diese Migration "non-reversible". */
  down: ((db: DB) => void) | null
}

export interface MigrateResult {
  applied: string[]
  skipped: string[]
}

const MIGRATIONS_TABLE = '_plugin_migrations'

function ensureMigrationsTable(db: SqliteDb): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)
}

function appliedIds(db: SqliteDb): Set<string> {
  const rows = db.prepare(`SELECT id FROM ${MIGRATIONS_TABLE}`).all() as Array<{ id: string }>
  return new Set(rows.map((r) => r.id))
}

/**
 * Apply alle pending migrations in order. Returns summary.
 * Throws wenn eine Migration in der up-Phase wirft — bisherige
 * applied-rows bleiben (atomic-per-migration via transaction).
 */
export function migrate<DB extends SqliteDb>(
  db: DB,
  migrations: readonly Migration<DB>[],
): MigrateResult {
  ensureMigrationsTable(db)
  const applied = appliedIds(db)
  const sorted = [...migrations].sort((a, b) => a.id.localeCompare(b.id))

  const result: MigrateResult = { applied: [], skipped: [] }
  const insert = db.prepare(`INSERT INTO ${MIGRATIONS_TABLE} (id) VALUES (?)`)

  for (const mig of sorted) {
    if (applied.has(mig.id)) {
      result.skipped.push(mig.id)
      continue
    }
    db.transaction(() => {
      mig.up(db)
      insert.run(mig.id)
    })()
    result.applied.push(mig.id)
  }

  return result
}

/**
 * Rollback bis (NICHT inkl.) target-id. Migrations werden in
 * descending order angewendet. Wenn eine Migration `down: null` hat,
 * wird der Rollback abgebrochen mit Fehler.
 *
 * Beispiel: applied=['0001', '0002', '0003'], rollbackTo('0001')
 * → '0003'.down() + '0002'.down() applied; '0001' bleibt.
 */
export function rollbackTo<DB extends SqliteDb>(
  db: DB,
  migrations: readonly Migration<DB>[],
  targetId: string,
): { rolledBack: string[] } {
  ensureMigrationsTable(db)
  const applied = appliedIds(db)
  const sorted = [...migrations].sort((a, b) => b.id.localeCompare(a.id))

  const rolledBack: string[] = []
  const del = db.prepare(`DELETE FROM ${MIGRATIONS_TABLE} WHERE id = ?`)

  for (const mig of sorted) {
    if (mig.id <= targetId) break
    if (!applied.has(mig.id)) continue
    if (!mig.down) {
      throw new StorageError(
        'rollback_blocked',
        `migration '${mig.id}' is non-reversible (down: null) — cannot rollback past it`,
        { migration_id: mig.id, target_id: targetId },
      )
    }
    db.transaction(() => {
      mig.down!(db)
      del.run(mig.id)
    })()
    rolledBack.push(mig.id)
  }

  return { rolledBack }
}

/**
 * Returns applied migration-ids in ascending order (für introspection).
 */
export function listApplied(db: SqliteDb): string[] {
  ensureMigrationsTable(db)
  const rows = db.prepare(`SELECT id FROM ${MIGRATIONS_TABLE} ORDER BY id ASC`).all() as Array<{
    id: string
  }>
  return rows.map((r) => r.id)
}
