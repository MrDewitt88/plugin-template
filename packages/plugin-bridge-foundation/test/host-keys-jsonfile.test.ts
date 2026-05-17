import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fingerprintPublicKey, HostKeyRegistry } from '../src/auth/host-keys.js'
import { JsonFileHostKeyRepo } from '../src/auth/host-keys-jsonfile.js'
import type { HostKeyRecord } from '../src/types.js'

const FAKE_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAfakekeyAfakekeyAfakekeyAfakekeyAfakekeyA
-----END PUBLIC KEY-----`

let scratchDir: string

beforeEach(async () => {
  scratchDir = await mkdtemp(join(tmpdir(), 'plug-tmpl-jsonrepo-'))
})

afterEach(async () => {
  await rm(scratchDir, { recursive: true, force: true })
})

describe('JsonFileHostKeyRepo — file persistence', () => {
  it('starts empty when no file exists yet (ENOENT is legitimate)', async () => {
    const repo = new JsonFileHostKeyRepo({ path: join(scratchDir, 'missing.json') })
    expect(await repo.list()).toEqual([])
    expect(await repo.get('teammind')).toBeNull()
  })

  it('upsert writes file atomically and survives across instances', async () => {
    const path = join(scratchDir, 'host-keys.json')
    const repoA = new JsonFileHostKeyRepo({ path })
    const reg = new HostKeyRegistry(repoA)
    await reg.register({ host_id: 'teammind', public_key_pem: FAKE_PEM })

    // file exists with correct shape
    const raw = await readFile(path, 'utf-8')
    const parsed = JSON.parse(raw)
    expect(parsed.schema_version).toBe(1)
    expect(parsed.records).toHaveLength(1)
    expect(parsed.records[0].host_id).toBe('teammind')
    expect(parsed.records[0].status).toBe('pending')

    // new instance pointing at same path reads the record
    const repoB = new JsonFileHostKeyRepo({ path })
    const reloaded = await repoB.get('teammind')
    expect(reloaded).not.toBeNull()
    expect(reloaded?.fingerprint).toBe(fingerprintPublicKey(FAKE_PEM))
  })

  it('setStatus mutation persists to disk', async () => {
    const path = join(scratchDir, 'host-keys.json')
    const repoA = new JsonFileHostKeyRepo({ path })
    const reg = new HostKeyRegistry(repoA)
    await reg.register({ host_id: 'teammind', public_key_pem: FAKE_PEM })
    await reg.approve('teammind')

    const repoB = new JsonFileHostKeyRepo({ path })
    const r = await repoB.get('teammind')
    expect(r?.status).toBe('active')
    expect(r?.approved_at).not.toBeNull()
  })

  it('list() returns all persisted records in fresh instance', async () => {
    const path = join(scratchDir, 'host-keys.json')
    const repoA = new JsonFileHostKeyRepo({ path })
    const reg = new HostKeyRegistry(repoA, { autoAccept: true })
    await reg.register({ host_id: 'teammind', public_key_pem: FAKE_PEM })
    await reg.register({
      host_id: 'theseus',
      public_key_pem: FAKE_PEM.replace('Afake', 'Bfake'),
    })

    const repoB = new JsonFileHostKeyRepo({ path })
    const all = await repoB.list()
    expect(all.map((r) => r.host_id).sort()).toEqual(['teammind', 'theseus'])
    expect(all.every((r) => r.status === 'active')).toBe(true)
  })

  it('rejects schema_version mismatch on load', async () => {
    const path = join(scratchDir, 'bad.json')
    await writeFile(
      path,
      JSON.stringify({ schema_version: 99, records: [] }),
      'utf-8',
    )
    const repo = new JsonFileHostKeyRepo({ path })
    await expect(repo.list()).rejects.toThrow(/schema_version=99/)
  })

  it('rejects malformed records array', async () => {
    const path = join(scratchDir, 'malformed.json')
    await writeFile(path, JSON.stringify({ schema_version: 1, records: 'not-array' }), 'utf-8')
    const repo = new JsonFileHostKeyRepo({ path })
    await expect(repo.list()).rejects.toThrow()
  })

  it('explicit load() is idempotent (does not re-read file)', async () => {
    const path = join(scratchDir, 'load.json')
    const repo = new JsonFileHostKeyRepo({ path })
    await repo.load()
    await repo.load() // no throw, no side-effect
    expect(await repo.list()).toEqual([])
  })

  it('atomic-rename leaves no .tmp file on success', async () => {
    const path = join(scratchDir, 'atomic.json')
    const repo = new JsonFileHostKeyRepo({ path })
    const reg = new HostKeyRegistry(repo)
    await reg.register({ host_id: 'teammind', public_key_pem: FAKE_PEM })

    // .tmp should be cleaned up by rename
    await expect(readFile(`${path}.tmp`, 'utf-8')).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readFile(path, 'utf-8')).resolves.toBeTruthy()
  })

  it('creates parent directories if missing', async () => {
    const path = join(scratchDir, 'nested', 'deeper', 'keys.json')
    const repo = new JsonFileHostKeyRepo({ path })
    const reg = new HostKeyRegistry(repo)
    await reg.register({ host_id: 'teammind', public_key_pem: FAKE_PEM })
    await expect(readFile(path, 'utf-8')).resolves.toContain('teammind')
  })

  it('serializes concurrent upserts via writeQueue', async () => {
    const path = join(scratchDir, 'concurrent.json')
    const repo = new JsonFileHostKeyRepo({ path })
    const reg = new HostKeyRegistry(repo, { autoAccept: true })

    // fire several registers in parallel
    await Promise.all([
      reg.register({ host_id: 'host-a', public_key_pem: FAKE_PEM.replace('Afake', '00001') }),
      reg.register({ host_id: 'host-b', public_key_pem: FAKE_PEM.replace('Afake', '00002') }),
      reg.register({ host_id: 'host-c', public_key_pem: FAKE_PEM.replace('Afake', '00003') }),
    ])

    const reloaded = new JsonFileHostKeyRepo({ path })
    const all = await reloaded.list()
    expect(all.map((r) => r.host_id).sort()).toEqual(['host-a', 'host-b', 'host-c'])
  })

  it('preserves registered_at across reloads (Drift #12 idempotency)', async () => {
    const path = join(scratchDir, 'idempotent.json')
    const repoA = new JsonFileHostKeyRepo({ path })
    const regA = new HostKeyRegistry(repoA)
    const { record: first } = await regA.register({
      host_id: 'teammind',
      public_key_pem: FAKE_PEM,
    })
    const registeredAt = first.registered_at

    // re-register same key in fresh process → same registered_at preserved
    const repoB = new JsonFileHostKeyRepo({ path })
    const regB = new HostKeyRegistry(repoB)
    const { record: second, isFirstRegister } = await regB.register({
      host_id: 'teammind',
      public_key_pem: FAKE_PEM,
    })
    expect(second.registered_at).toBe(registeredAt)
    expect(isFirstRegister).toBe(false)
  })

  it('encodes typed HostKeyRecord faithfully through round-trip', async () => {
    const path = join(scratchDir, 'typecheck.json')
    const repo = new JsonFileHostKeyRepo({ path })
    const written: HostKeyRecord = {
      host_id: 'teammind',
      public_key_pem: FAKE_PEM,
      status: 'active',
      fingerprint: 'aabb:ccdd',
      registered_at: '2026-05-17T00:00:00.000Z',
      approved_at: '2026-05-17T00:00:01.000Z',
    }
    await repo.upsert(written)

    const repoB = new JsonFileHostKeyRepo({ path })
    const read = await repoB.get('teammind')
    expect(read).toEqual(written)
  })
})
