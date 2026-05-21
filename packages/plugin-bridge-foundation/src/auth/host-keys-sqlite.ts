// SqliteHostKeyRepo — SQLite-backed HostKeyRepo für Plugin-Bridges mit
// embedded persistent state (Electron-Apps, Desktop-Hosts).
//
// Reference-Consumer: markview Pfad-C-Collab Migration v5 (msg #302, schema
// `host_keys` mit relay_url TEXT NULL). Foundation-Default-Spalten sind
// kompatibel mit markview's v5 — CREATE TABLE IF NOT EXISTS ist no-op auf
// bestehender Tabelle; SELECTs/UPDATEs touchen nur die Foundation-defined
// Spalten, andere Plugin-spezifische Spalten (z.B. markview's `last_used_at`)
// bleiben unangetastet.
//
// Konsumenten-Pattern:
//   import { openConnection } from '@nexus-mindgarden/plugin-storage-foundation'
//   import { SqliteHostKeyRepo, HostKeyRegistry } from '@nexus-mindgarden/plugin-bridge-foundation'
//
//   const db = openConnection({ path: './data/plugin-bridge.db' })
//   const repo = new SqliteHostKeyRepo(db)
//   repo.ensureSchema()  // safe to call on first start + on every restart
//   const registry = new HostKeyRegistry(repo)
//
// Concurrency: db.prepare-statements sind safe für concurrent reads (WAL-mode).
// Writes serialisieren über SQLite's busy-timeout. Multi-process auf same file:
// supported (SQLite's locking handles it), aber Plugin-Bridges sind typisch
// single-process per design.
//
// Schema-version: 1 (für künftige migrations dokumentiert in repo's
// readSchemaVersion()-Helper; keine breaking changes geplant — Erweiterungen
// landen als nullable columns).

import type { HostKeyRecord, HostKeyStatus } from '../types.js'
import type { HostKeyRepo } from './host-keys.js'

/**
 * Minimal Database-interface — wir importieren `better-sqlite3` nicht direkt,
 * damit Plugin-Providers die nur InMemory/JsonFile nutzen, keinen native-dep
 * download brauchen. Konsumenten passen ihre `better-sqlite3` Database-Instanz
 * rein (compatible via structural-typing).
 */
export interface SqliteHostKeyRepoStatement {
  get(...params: unknown[]): unknown
  all(...params: unknown[]): unknown[]
  run(...params: unknown[]): { changes: number; lastInsertRowid?: number | bigint }
}

export interface SqliteHostKeyRepoDatabase {
  prepare(sql: string): SqliteHostKeyRepoStatement
  exec(sql: string): void
}

export interface SqliteHostKeyRepoOptions {
  /**
   * SQLite-Tabellen-Name. Default `'plugin_host_keys'`. Plugin-Provider mit
   * bestehender Tabelle (z.B. markview's `host_keys`) overriden auf ihren Namen.
   */
  tableName?: string
}

interface RowShape {
  host_id: string
  public_key_pem: string
  status: string
  fingerprint: string
  registered_at: string
  approved_at: string | null
}

function rowToRecord(row: RowShape): HostKeyRecord {
  return {
    host_id: row.host_id,
    public_key_pem: row.public_key_pem,
    status: row.status as HostKeyStatus,
    fingerprint: row.fingerprint,
    registered_at: row.registered_at,
    approved_at: row.approved_at,
  }
}

export class SqliteHostKeyRepo implements HostKeyRepo {
  private readonly tableName: string
  private schemaEnsured = false

  constructor(
    private readonly db: SqliteHostKeyRepoDatabase,
    opts: SqliteHostKeyRepoOptions = {},
  ) {
    this.tableName = opts.tableName ?? 'plugin_host_keys'
  }

  /**
   * Idempotent — sicher zu callen auf jeder Bridge-Boot. CREATE TABLE
   * IF NOT EXISTS ist no-op wenn Tabelle existiert (auch wenn sie via
   * Konsumenten-Migration bereits angelegt wurde, Foundation-Spalten
   * sind subset und nicht conflicting).
   */
  ensureSchema(): void {
    if (this.schemaEnsured) return
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        host_id         TEXT PRIMARY KEY,
        public_key_pem  TEXT NOT NULL,
        status          TEXT NOT NULL CHECK (status IN ('pending','active','rejected')),
        fingerprint     TEXT NOT NULL,
        registered_at   TEXT NOT NULL,
        approved_at     TEXT
      )
    `)
    this.schemaEnsured = true
  }

  async get(hostId: string): Promise<HostKeyRecord | null> {
    this.ensureSchema()
    const stmt = this.db.prepare(
      `SELECT host_id, public_key_pem, status, fingerprint, registered_at, approved_at
       FROM ${this.tableName} WHERE host_id = ?`,
    )
    const row = stmt.get(hostId) as RowShape | undefined
    return row ? rowToRecord(row) : null
  }

  async upsert(
    record: HostKeyRecord,
    opts: { forceStatus?: HostKeyStatus } = {},
  ): Promise<HostKeyRecord> {
    this.ensureSchema()
    const finalRecord = opts.forceStatus ? { ...record, status: opts.forceStatus } : record
    const stmt = this.db.prepare(
      `INSERT INTO ${this.tableName}
         (host_id, public_key_pem, status, fingerprint, registered_at, approved_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(host_id) DO UPDATE SET
         public_key_pem = excluded.public_key_pem,
         status         = excluded.status,
         fingerprint    = excluded.fingerprint,
         registered_at  = excluded.registered_at,
         approved_at    = excluded.approved_at`,
    )
    stmt.run(
      finalRecord.host_id,
      finalRecord.public_key_pem,
      finalRecord.status,
      finalRecord.fingerprint,
      finalRecord.registered_at,
      finalRecord.approved_at,
    )
    return finalRecord
  }

  async list(): Promise<HostKeyRecord[]> {
    this.ensureSchema()
    const stmt = this.db.prepare(
      `SELECT host_id, public_key_pem, status, fingerprint, registered_at, approved_at
       FROM ${this.tableName} ORDER BY registered_at ASC`,
    )
    const rows = stmt.all() as RowShape[]
    return rows.map(rowToRecord)
  }

  async setStatus(hostId: string, status: HostKeyStatus): Promise<HostKeyRecord | null> {
    this.ensureSchema()
    const update = this.db.prepare(
      `UPDATE ${this.tableName} SET status = ? WHERE host_id = ?`,
    )
    const result = update.run(status, hostId)
    if (result.changes === 0) return null
    return this.get(hostId)
  }
}
