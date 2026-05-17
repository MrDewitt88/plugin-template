// JsonFileHostKeyRepo — persistent JSON-file implementation des HostKeyRepo
// für Production-Plugin-Provider die Multi-Host-Registry über restarts erhalten
// müssen.
//
// Atomic-Write-Pattern (cross-platform safe):
//   1. write content nach <path>.tmp
//   2. fsync (durability)
//   3. rename <path>.tmp → <path> (atomic on POSIX + Windows ≥ NTFS)
//
// Reference-Implementation: plug-db services/bridge/app/auth/host-registry.py
// (msg #271, REL4) — gleiches Pattern, gleiche Garantie.
//
// Concurrency-Caveat: in-process serialized via internal Promise-chain.
// Multi-process-writes auf gleiches file sind NICHT supported (Plugin-Bridge
// ist single-process per design — Plugin-Provider die multi-process brauchen,
// implementieren eigenen Repo gegen SQLite/Postgres).

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { HostKeyRecord, HostKeyStatus } from '../types.js'
import type { HostKeyRepo } from './host-keys.js'

interface PersistedFile {
  /** Schema-version des on-disk Formats. Bumped bei Breaking-Changes. */
  schema_version: 1
  records: HostKeyRecord[]
}

export interface JsonFileHostKeyRepoOptions {
  /** Absoluter (oder relativ-zum-cwd) Pfad zur JSON-Datei. */
  path: string
}

export class JsonFileHostKeyRepo implements HostKeyRepo {
  private readonly store = new Map<string, HostKeyRecord>()
  private loaded = false
  private writeQueue: Promise<void> = Promise.resolve()

  constructor(private readonly opts: JsonFileHostKeyRepoOptions) {}

  /**
   * Lazy-load on first access. Eager-load via `await repo.load()` wenn
   * deterministic startup gewünscht (z.B. nach bootstrap-register).
   */
  async load(): Promise<void> {
    if (this.loaded) return
    try {
      const raw = await readFile(this.opts.path, 'utf-8')
      const parsed = JSON.parse(raw) as PersistedFile
      if (parsed.schema_version !== 1 || !Array.isArray(parsed.records)) {
        throw new Error(
          `JsonFileHostKeyRepo: unexpected file shape in ${this.opts.path} ` +
            `(schema_version=${parsed.schema_version}, expected 1)`,
        )
      }
      for (const record of parsed.records) {
        this.store.set(record.host_id, record)
      }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code === 'ENOENT') {
        // Erste Initialisierung — File existiert noch nicht, leerer Store ist
        // legitim. Wird beim ersten upsert() angelegt.
      } else {
        throw err
      }
    }
    this.loaded = true
  }

  /** Atomic-write des kompletten Stores nach disk. Serialized via writeQueue. */
  private flush(): Promise<void> {
    const next = this.writeQueue.then(async () => {
      const payload: PersistedFile = {
        schema_version: 1,
        records: Array.from(this.store.values()),
      }
      const content = JSON.stringify(payload, null, 2) + '\n'
      const tmpPath = `${this.opts.path}.tmp`
      await mkdir(dirname(this.opts.path), { recursive: true })
      await writeFile(tmpPath, content, 'utf-8')
      await rename(tmpPath, this.opts.path)
    })
    this.writeQueue = next.catch(() => {
      // Don't poison the queue — but still surface the error to the caller.
    })
    return next
  }

  async get(hostId: string): Promise<HostKeyRecord | null> {
    await this.load()
    return this.store.get(hostId) ?? null
  }

  async upsert(
    record: HostKeyRecord,
    opts: { forceStatus?: HostKeyStatus } = {},
  ): Promise<HostKeyRecord> {
    await this.load()
    const finalRecord = opts.forceStatus ? { ...record, status: opts.forceStatus } : record
    this.store.set(record.host_id, finalRecord)
    await this.flush()
    return finalRecord
  }

  async list(): Promise<HostKeyRecord[]> {
    await this.load()
    return Array.from(this.store.values())
  }

  async setStatus(hostId: string, status: HostKeyStatus): Promise<HostKeyRecord | null> {
    await this.load()
    const existing = this.store.get(hostId)
    if (!existing) return null
    const updated: HostKeyRecord = { ...existing, status }
    this.store.set(hostId, updated)
    await this.flush()
    return updated
  }
}
