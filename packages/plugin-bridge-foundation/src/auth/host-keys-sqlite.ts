// SqliteHostKeyRepo — SQLite-backed HostKeyRepo für Plugin-Bridges mit
// embedded persistent state (Electron-Apps, Desktop-Hosts).
//
// Reference-Consumer: markview Pfad-C-Collab Migration v5 (msg #302, schema
// `host_keys` mit relay_url TEXT NULL). CREATE TABLE IF NOT EXISTS ist no-op auf
// bestehender Tabelle.
//
// ⚠️ v0.9.0 (markview #5345): `relay_url` + `last_used_at` sind jetzt
// FOUNDATION-EIGENE Spalten (neben `expected_issuer`/`expected_audience`) — die
// Foundation liest UND schreibt sie. Hatte ein Consumer (z.B. markview) eine
// gleichnamige Spalte bereits, konvergiert sie auf die Foundation-Semantik
// (`last_used_at` = letzter erfolgreicher Token-Verify, NUR bei
// `trackHostLastUsed:true`; `relay_url` = register-host-Wert). Genau das hat
// markview angefragt. ANDERE consumer-spezifische Spalten (nicht in der
// Foundation-Spaltenliste) bleiben weiterhin unangetastet: die migration ALTERt
// nur FEHLENDE Foundation-Spalten, und upsert listet ausschließlich Foundation-
// Spalten → fremde Spalten bleiben bei ON CONFLICT erhalten.
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
  // v0.9.0 — nullable columns (added by migration on existing tables)
  expected_issuer: string | null
  expected_audience: string | null
  relay_url: string | null
  last_used_at: string | null
}

// v0.9.0 — columns added additively; migration ALTERs pre-existing tables.
const V0_9_COLUMNS = ['expected_issuer', 'expected_audience', 'relay_url', 'last_used_at'] as const
const COLUMN_LIST =
  'host_id, public_key_pem, status, fingerprint, registered_at, approved_at, ' +
  'expected_issuer, expected_audience, relay_url, last_used_at'

function rowToRecord(row: RowShape): HostKeyRecord {
  return {
    host_id: row.host_id,
    public_key_pem: row.public_key_pem,
    status: row.status as HostKeyStatus,
    fingerprint: row.fingerprint,
    registered_at: row.registered_at,
    approved_at: row.approved_at,
    expected_issuer: row.expected_issuer,
    expected_audience: row.expected_audience,
    relay_url: row.relay_url,
    last_used_at: row.last_used_at,
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
        host_id           TEXT PRIMARY KEY,
        public_key_pem    TEXT NOT NULL,
        status            TEXT NOT NULL CHECK (status IN ('pending','active','rejected')),
        fingerprint       TEXT NOT NULL,
        registered_at     TEXT NOT NULL,
        approved_at       TEXT,
        expected_issuer   TEXT,
        expected_audience TEXT,
        relay_url         TEXT,
        last_used_at      TEXT
      )
    `)
    // v0.9.0 — additive migration for pre-existing tables (e.g. markview's
    // host_keys created by an older schema): add any missing v0.9.0 columns as
    // nullable. SQLite has no "ADD COLUMN IF NOT EXISTS", so we diff table_info.
    const present = new Set(
      (
        this.db.prepare(`PRAGMA table_info(${this.tableName})`).all() as Array<{ name: string }>
      ).map((r) => r.name),
    )
    for (const col of V0_9_COLUMNS) {
      if (!present.has(col)) {
        this.db.exec(`ALTER TABLE ${this.tableName} ADD COLUMN ${col} TEXT`)
      }
    }
    this.schemaEnsured = true
  }

  async get(hostId: string): Promise<HostKeyRecord | null> {
    this.ensureSchema()
    const stmt = this.db.prepare(`SELECT ${COLUMN_LIST} FROM ${this.tableName} WHERE host_id = ?`)
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
         (host_id, public_key_pem, status, fingerprint, registered_at, approved_at,
          expected_issuer, expected_audience, relay_url, last_used_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(host_id) DO UPDATE SET
         public_key_pem    = excluded.public_key_pem,
         status            = excluded.status,
         fingerprint       = excluded.fingerprint,
         registered_at     = excluded.registered_at,
         approved_at       = excluded.approved_at,
         expected_issuer   = excluded.expected_issuer,
         expected_audience = excluded.expected_audience,
         relay_url         = excluded.relay_url,
         last_used_at      = excluded.last_used_at`,
    )
    stmt.run(
      finalRecord.host_id,
      finalRecord.public_key_pem,
      finalRecord.status,
      finalRecord.fingerprint,
      finalRecord.registered_at,
      finalRecord.approved_at,
      finalRecord.expected_issuer ?? null,
      finalRecord.expected_audience ?? null,
      finalRecord.relay_url ?? null,
      finalRecord.last_used_at ?? null,
    )
    return finalRecord
  }

  async list(): Promise<HostKeyRecord[]> {
    this.ensureSchema()
    const stmt = this.db.prepare(
      `SELECT ${COLUMN_LIST} FROM ${this.tableName} ORDER BY registered_at ASC`,
    )
    const rows = stmt.all() as RowShape[]
    return rows.map(rowToRecord)
  }

  async setStatus(hostId: string, status: HostKeyStatus): Promise<HostKeyRecord | null> {
    this.ensureSchema()
    const update = this.db.prepare(`UPDATE ${this.tableName} SET status = ? WHERE host_id = ?`)
    const result = update.run(status, hostId)
    if (result.changes === 0) return null
    return this.get(hostId)
  }
}
