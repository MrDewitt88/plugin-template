// SQLite-Connection-Factory mit Production-Pragmas. Reference-Pattern:
// MarkView packages/plugin-bridge + Kanban packages/kanban-sqlite.
//
// Pragma-Defaults (alle setzbar via opts):
//   journal_mode=WAL    — concurrent-read + serialize-write, durability OK
//   foreign_keys=ON     — referential-integrity-enforced
//   synchronous=NORMAL  — WAL-mode-default, fsync nur bei checkpoint
//   busy_timeout=5000   — 5s wait bei locked-rows
//   temp_store=MEMORY   — temp-tables in RAM (statt /tmp)
//   cache_size=-32000   — 32MB page-cache
//
// Plus: forschen ABI-Mismatch (Drift #11/#13/#20) — wenn better-sqlite3
// für falsches Runtime kompiliert ist (node vs electron), require() wirft.
// Plugin-Provider sollte ABI-Cache-Pattern adopten (siehe MarkView's
// scripts/sqlite-abi.mjs); siehe README "ABI-Awareness" Sektion.

import Database, { type Database as DatabaseType } from 'better-sqlite3'
import { dirname } from 'node:path'
import { mkdirSync } from 'node:fs'

export interface ConnectionOptions {
  /** Absolute path to .db file. Parent-dirs werden auto-erstellt. */
  path: string
  /** Default true — open read+write, create if missing. */
  readonly?: boolean
  /** Default true — WAL-mode für concurrent-reads + serialized writes. */
  walMode?: boolean
  /** Default true — referential-integrity-enforced. */
  foreignKeys?: boolean
  /** Default 5000 — ms wait bei locked-rows. */
  busyTimeoutMs?: number
  /** Default -32000 (32MB). */
  cacheSizeKb?: number
  /** Optional: better-sqlite3 verbose-callback (e.g. console.log für debug). */
  verbose?: (msg: unknown) => void
}

export class SqliteConnectionError extends Error {
  constructor(
    public readonly code: 'abi_mismatch' | 'open_failed' | 'pragma_failed',
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'SqliteConnectionError'
  }
}

/**
 * Öffnet SQLite-Connection + applied Production-Pragmas. Throws
 * SqliteConnectionError mit code='abi_mismatch' wenn better-sqlite3
 * Native-Binary nicht zum Runtime passt (ältere Drift #11/#13-Klasse).
 */
export function openConnection(opts: ConnectionOptions): DatabaseType {
  // Auto-mkdir parent für .db file
  try {
    mkdirSync(dirname(opts.path), { recursive: true })
  } catch (err) {
    throw new SqliteConnectionError(
      'open_failed',
      `failed to create parent dir for ${opts.path}: ${(err as Error).message}`,
      err,
    )
  }

  let db: DatabaseType
  try {
    const dbOpts: ConstructorParameters<typeof Database>[1] = {
      readonly: opts.readonly === true,
      fileMustExist: false,
    }
    if (opts.verbose) dbOpts.verbose = opts.verbose
    db = new Database(opts.path, dbOpts)
  } catch (err) {
    const msg = (err as Error).message ?? 'open failed'
    if (msg.includes('NODE_MODULE_VERSION') || msg.includes('Module did not self-register')) {
      throw new SqliteConnectionError(
        'abi_mismatch',
        `better-sqlite3 native-binary ABI-mismatch (likely node-vs-electron). See README "ABI-Awareness". Original: ${msg}`,
        err,
      )
    }
    throw new SqliteConnectionError('open_failed', msg, err)
  }

  if (opts.readonly === true) {
    // readonly mode skips most pragmas; only set foreign_keys + busy_timeout
    if (opts.foreignKeys !== false) db.pragma('foreign_keys = ON')
    db.pragma(`busy_timeout = ${opts.busyTimeoutMs ?? 5000}`)
    return db
  }

  try {
    if (opts.walMode !== false) db.pragma('journal_mode = WAL')
    if (opts.foreignKeys !== false) db.pragma('foreign_keys = ON')
    db.pragma('synchronous = NORMAL')
    db.pragma(`busy_timeout = ${opts.busyTimeoutMs ?? 5000}`)
    db.pragma('temp_store = MEMORY')
    db.pragma(`cache_size = ${opts.cacheSizeKb ?? -32000}`)
  } catch (err) {
    db.close()
    throw new SqliteConnectionError(
      'pragma_failed',
      `failed to apply pragmas: ${(err as Error).message}`,
      err,
    )
  }

  return db
}

/**
 * Closes connection safely. Idempotent — second call is no-op.
 */
export function closeConnection(db: DatabaseType | null): void {
  if (!db) return
  try {
    if (db.open) db.close()
  } catch {
    // already closed or corrupted — ignore
  }
}
