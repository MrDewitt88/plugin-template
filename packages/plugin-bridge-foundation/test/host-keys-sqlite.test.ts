import Database from 'better-sqlite3'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fingerprintPublicKey, HostKeyRegistry } from '../src/auth/host-keys.js'
import { SqliteHostKeyRepo } from '../src/auth/host-keys-sqlite.js'

const FAKE_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAfakekeyAfakekeyAfakekeyAfakekeyAfakekeyA
-----END PUBLIC KEY-----`

let dir: string
let dbPath: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'plug-tmpl-sqlite-'))
  dbPath = join(dir, 'plugin-bridge.db')
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('SqliteHostKeyRepo — basic CRUD', () => {
  it('ensureSchema() is idempotent — safe to call multiple times', () => {
    const db = new Database(dbPath)
    const repo = new SqliteHostKeyRepo(db)
    repo.ensureSchema()
    repo.ensureSchema() // no throw
    repo.ensureSchema()
    db.close()
  })

  it('upsert + get round-trip preserves all fields', async () => {
    const db = new Database(dbPath)
    const repo = new SqliteHostKeyRepo(db)
    const reg = new HostKeyRegistry(repo)
    await reg.register({ host_id: 'teammind', public_key_pem: FAKE_PEM })
    const got = await repo.get('teammind')
    expect(got).toMatchObject({
      host_id: 'teammind',
      public_key_pem: FAKE_PEM.trim(),
      status: 'pending',
      fingerprint: fingerprintPublicKey(FAKE_PEM),
      approved_at: null,
    })
    db.close()
  })

  it('persistence across new Database instances (real DB-restart simulation)', async () => {
    const dbA = new Database(dbPath)
    const repoA = new SqliteHostKeyRepo(dbA)
    const regA = new HostKeyRegistry(repoA, { autoAccept: true })
    await regA.register({ host_id: 'teammind', public_key_pem: FAKE_PEM })
    dbA.close()

    const dbB = new Database(dbPath)
    const repoB = new SqliteHostKeyRepo(dbB)
    const found = await repoB.get('teammind')
    expect(found?.status).toBe('active')
    expect(found?.approved_at).not.toBeNull()
    dbB.close()
  })

  it('list() returns records ordered by registered_at', async () => {
    const db = new Database(dbPath)
    const repo = new SqliteHostKeyRepo(db)
    const reg = new HostKeyRegistry(repo)
    await reg.register({ host_id: 'first', public_key_pem: FAKE_PEM })
    await new Promise((r) => setTimeout(r, 10))
    await reg.register({
      host_id: 'second',
      public_key_pem: FAKE_PEM.replace('Afake', 'Bfake'),
    })
    const all = await repo.list()
    expect(all.map((r) => r.host_id)).toEqual(['first', 'second'])
    db.close()
  })

  it('setStatus updates row + returns updated record', async () => {
    const db = new Database(dbPath)
    const repo = new SqliteHostKeyRepo(db)
    const reg = new HostKeyRegistry(repo)
    await reg.register({ host_id: 'teammind', public_key_pem: FAKE_PEM })
    await reg.approve('teammind')
    const after = await repo.get('teammind')
    expect(after?.status).toBe('active')
    db.close()
  })

  it('setStatus on unknown host returns null', async () => {
    const db = new Database(dbPath)
    const repo = new SqliteHostKeyRepo(db)
    const result = await repo.setStatus('unknown', 'active')
    expect(result).toBeNull()
    db.close()
  })

  it('idempotent re-register preserves status (Drift #12 via SQLite)', async () => {
    const db = new Database(dbPath)
    const repo = new SqliteHostKeyRepo(db)
    const reg = new HostKeyRegistry(repo)
    const first = await reg.register({ host_id: 'teammind', public_key_pem: FAKE_PEM })
    await reg.approve('teammind')

    const second = await reg.register({ host_id: 'teammind', public_key_pem: FAKE_PEM })
    expect(second.isFirstRegister).toBe(false)
    const got = await repo.get('teammind')
    expect(got?.status).toBe('active')
    expect(got?.registered_at).toBe(first.record.registered_at)
    db.close()
  })
})

describe('SqliteHostKeyRepo — markview drop-in compatibility', () => {
  it('custom tableName respects existing schema', async () => {
    const db = new Database(dbPath)
    const repo = new SqliteHostKeyRepo(db, { tableName: 'host_keys' })
    repo.ensureSchema()
    const tableInfo = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as Array<{
      name: string
    }>
    const names = tableInfo.map((r) => r.name)
    expect(names).toContain('host_keys')
    expect(names).not.toContain('plugin_host_keys')
    db.close()
  })

  it('CREATE TABLE IF NOT EXISTS is no-op on pre-existing table (markview migration v5 simulation)', async () => {
    const db = new Database(dbPath)
    // Simulate markview's pre-existing schema with extra column
    db.exec(`
      CREATE TABLE host_keys (
        host_id         TEXT PRIMARY KEY,
        public_key_pem  TEXT NOT NULL,
        status          TEXT NOT NULL,
        fingerprint     TEXT NOT NULL,
        registered_at   TEXT NOT NULL,
        approved_at     TEXT,
        last_used_at    TEXT,
        relay_url       TEXT
      )
    `)
    // Insert a row simulating markview's existing data
    db.prepare(
      `INSERT INTO host_keys (host_id, public_key_pem, status, fingerprint, registered_at, approved_at, last_used_at, relay_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'mv-host',
      'pem',
      'active',
      'fp',
      '2026-01-01T00:00:00Z',
      '2026-01-01T01:00:00Z',
      '2026-05-01T00:00:00Z',
      'ws://127.0.0.1:3300/relay',
    )

    // Foundation's ensureSchema() should be no-op
    const repo = new SqliteHostKeyRepo(db, { tableName: 'host_keys' })
    repo.ensureSchema()

    // Foundation can read existing row (only its known fields, last_used_at + relay_url preserved on disk)
    const found = await repo.get('mv-host')
    expect(found).toMatchObject({
      host_id: 'mv-host',
      public_key_pem: 'pem',
      status: 'active',
    })

    // Verify extra columns are still on disk untouched
    const raw = db
      .prepare(`SELECT last_used_at, relay_url FROM host_keys WHERE host_id = ?`)
      .get('mv-host') as {
      last_used_at: string
      relay_url: string
    }
    expect(raw.last_used_at).toBe('2026-05-01T00:00:00Z')
    expect(raw.relay_url).toBe('ws://127.0.0.1:3300/relay')

    db.close()
  })

  it('Foundation upsert does NOT touch extra columns', async () => {
    const db = new Database(dbPath)
    db.exec(`
      CREATE TABLE host_keys (
        host_id         TEXT PRIMARY KEY,
        public_key_pem  TEXT NOT NULL,
        status          TEXT NOT NULL,
        fingerprint     TEXT NOT NULL,
        registered_at   TEXT NOT NULL,
        approved_at     TEXT,
        last_used_at    TEXT,
        relay_url       TEXT
      )
    `)
    db.prepare(
      `INSERT INTO host_keys (host_id, public_key_pem, status, fingerprint, registered_at, last_used_at, relay_url)
       VALUES ('mv-host','pem','pending','fp','2026-01-01T00:00:00Z','2026-05-01T00:00:00Z','ws://r')`,
    ).run()

    const repo = new SqliteHostKeyRepo(db, { tableName: 'host_keys' })
    const reg = new HostKeyRegistry(repo)
    // Re-register with same key — should preserve status (Drift #12) and not touch last_used_at/relay_url
    await reg.register({ host_id: 'mv-host', public_key_pem: 'pem' })

    const raw = db
      .prepare(`SELECT status, last_used_at, relay_url FROM host_keys WHERE host_id = 'mv-host'`)
      .get() as { status: string; last_used_at: string; relay_url: string }
    expect(raw.status).toBe('pending')
    expect(raw.last_used_at).toBe('2026-05-01T00:00:00Z')
    expect(raw.relay_url).toBe('ws://r')
    db.close()
  })
})

describe('SqliteHostKeyRepo — v0.9.0 iss/aud columns + migration', () => {
  it('migrates a pre-existing 6-column table by adding the 4 v0.9.0 columns', () => {
    const db = new Database(dbPath)
    // old Foundation schema (pre-v0.9.0) — only 6 columns, no iss/aud/relay/last_used
    db.exec(`
      CREATE TABLE plugin_host_keys (
        host_id        TEXT PRIMARY KEY,
        public_key_pem TEXT NOT NULL,
        status         TEXT NOT NULL,
        fingerprint    TEXT NOT NULL,
        registered_at  TEXT NOT NULL,
        approved_at    TEXT
      )
    `)
    const repo = new SqliteHostKeyRepo(db)
    repo.ensureSchema()
    const cols = (
      db.prepare(`PRAGMA table_info(plugin_host_keys)`).all() as Array<{ name: string }>
    ).map((r) => r.name)
    for (const c of ['expected_issuer', 'expected_audience', 'relay_url', 'last_used_at']) {
      expect(cols).toContain(c)
    }
    db.close()
  })

  it('round-trips expected_issuer/expected_audience/relay_url/last_used_at', async () => {
    const db = new Database(dbPath)
    const repo = new SqliteHostKeyRepo(db)
    const reg = new HostKeyRegistry(repo, { autoAccept: true })
    await reg.register({
      host_id: 'multi',
      public_key_pem: FAKE_PEM,
      relay_url: 'ws://127.0.0.1:3300/relay',
      expected_issuer: 'https://v8.example',
      expected_audience: 'plugin:test',
    })
    const got = await repo.get('multi')
    expect(got?.expected_issuer).toBe('https://v8.example')
    expect(got?.expected_audience).toBe('plugin:test')
    expect(got?.relay_url).toBe('ws://127.0.0.1:3300/relay')
    // getHostVerification surfaces the per-host iss/aud
    const hv = await reg.getHostVerification('multi')
    expect(hv.expected_issuer).toBe('https://v8.example')
    expect(hv.expected_audience).toBe('plugin:test')
    db.close()
  })

  it('markHostUsed persists last_used_at through the sqlite repo', async () => {
    const db = new Database(dbPath)
    const repo = new SqliteHostKeyRepo(db)
    const reg = new HostKeyRegistry(repo, { autoAccept: true })
    await reg.register({ host_id: 'used', public_key_pem: FAKE_PEM })
    expect((await repo.get('used'))?.last_used_at ?? null).toBeNull()
    await reg.markHostUsed('used')
    expect(typeof (await repo.get('used'))?.last_used_at).toBe('string')
    db.close()
  })

  it('markHostUsed writes Foundation-owned last_used_at but leaves UNRELATED consumer columns untouched', async () => {
    // markview-shaped table: Foundation columns + a genuinely-foreign column the
    // Foundation never lists. v0.9.0 owns last_used_at; foreign columns survive.
    const db = new Database(dbPath)
    db.exec(`
      CREATE TABLE host_keys (
        host_id        TEXT PRIMARY KEY,
        public_key_pem TEXT NOT NULL,
        status         TEXT NOT NULL,
        fingerprint    TEXT NOT NULL,
        registered_at  TEXT NOT NULL,
        approved_at    TEXT,
        last_used_at   TEXT,
        mv_custom      TEXT
      )
    `)
    db.prepare(
      `INSERT INTO host_keys (host_id, public_key_pem, status, fingerprint, registered_at, last_used_at, mv_custom)
       VALUES ('mv','pem','active','fp','2026-01-01T00:00:00Z','2026-05-01T00:00:00Z','mv-private-value')`,
    ).run()

    const repo = new SqliteHostKeyRepo(db, { tableName: 'host_keys' })
    const reg = new HostKeyRegistry(repo)
    await reg.markHostUsed('mv')

    const raw = db
      .prepare(`SELECT last_used_at, mv_custom FROM host_keys WHERE host_id = 'mv'`)
      .get() as { last_used_at: string; mv_custom: string }
    // Foundation OWNS last_used_at → overwritten with a fresh verify-timestamp…
    expect(raw.last_used_at).not.toBe('2026-05-01T00:00:00Z')
    expect(typeof raw.last_used_at).toBe('string')
    // …but the foreign column is preserved (not in the Foundation column list).
    expect(raw.mv_custom).toBe('mv-private-value')
    db.close()
  })
})
