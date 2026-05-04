import { describe, expect, it } from 'vitest'
import {
  fingerprintPublicKey,
  HostKeyRegistry,
  InMemoryHostKeyRepo,
} from '../src/auth/host-keys.js'
import { BridgeTokenError } from '../src/auth/jwt.js'

const FAKE_PEM_A = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAfakekeyAfakekeyAfakekeyAfakekeyAfakekeyA
-----END PUBLIC KEY-----`

const FAKE_PEM_B = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAdifferentkeydifferentkeydifferentkeyDIFF
-----END PUBLIC KEY-----`

describe('fingerprintPublicKey', () => {
  it('liefert deterministisches hex-with-colons', () => {
    const fp = fingerprintPublicKey(FAKE_PEM_A)
    expect(fp).toMatch(/^[0-9a-f]{4}(:[0-9a-f]{4})+$/)
    expect(fingerprintPublicKey(FAKE_PEM_A)).toBe(fp)
  })

  it('different PEMs → different fingerprints', () => {
    expect(fingerprintPublicKey(FAKE_PEM_A)).not.toBe(fingerprintPublicKey(FAKE_PEM_B))
  })
})

describe('HostKeyRegistry — Drift #12 Idempotency', () => {
  it('new host_id → pending (autoAccept=false default)', async () => {
    const reg = new HostKeyRegistry(new InMemoryHostKeyRepo())
    const r = await reg.register({ host_id: 'teammind', public_key_pem: FAKE_PEM_A })
    expect(r.status).toBe('pending')
    expect(r.host_id).toBe('teammind')
    expect(r.fingerprint).toMatch(/^[0-9a-f]{4}/)
    expect(r.approved_at).toBeNull()
  })

  it('autoAccept=true → active', async () => {
    const reg = new HostKeyRegistry(new InMemoryHostKeyRepo(), { autoAccept: true })
    const r = await reg.register({ host_id: 'teammind', public_key_pem: FAKE_PEM_A })
    expect(r.status).toBe('active')
    expect(r.approved_at).not.toBeNull()
  })

  it('same host_id + same key + active → preserves status (idempotent)', async () => {
    const reg = new HostKeyRegistry(new InMemoryHostKeyRepo())
    await reg.register({ host_id: 'teammind', public_key_pem: FAKE_PEM_A })
    await reg.approve('teammind')
    const r2 = await reg.register({ host_id: 'teammind', public_key_pem: FAKE_PEM_A })
    expect(r2.status).toBe('active')
  })

  it('same host_id + different key → reset to pending (rotation re-confirm)', async () => {
    const reg = new HostKeyRegistry(new InMemoryHostKeyRepo())
    await reg.register({ host_id: 'teammind', public_key_pem: FAKE_PEM_A })
    await reg.approve('teammind')
    const r2 = await reg.register({ host_id: 'teammind', public_key_pem: FAKE_PEM_B })
    expect(r2.status).toBe('pending')
    expect(r2.fingerprint).not.toBe(fingerprintPublicKey(FAKE_PEM_A))
  })

  it('approve sets status=active + approved_at', async () => {
    const reg = new HostKeyRegistry(new InMemoryHostKeyRepo())
    await reg.register({ host_id: 'teammind', public_key_pem: FAKE_PEM_A })
    const r = await reg.approve('teammind')
    expect(r?.status).toBe('active')
    expect(r?.approved_at).not.toBeNull()
  })

  it('reject sets status=rejected', async () => {
    const reg = new HostKeyRegistry(new InMemoryHostKeyRepo())
    await reg.register({ host_id: 'teammind', public_key_pem: FAKE_PEM_A })
    const r = await reg.reject('teammind')
    expect(r?.status).toBe('rejected')
  })
})

describe('HostKeyResolver (via Registry)', () => {
  it('getActivePublicKey() throws host_not_registered für unbekannten host_id', async () => {
    const reg = new HostKeyRegistry(new InMemoryHostKeyRepo())
    await expect(reg.getActivePublicKey('unknown')).rejects.toThrow(BridgeTokenError)
    await expect(reg.getActivePublicKey('unknown')).rejects.toMatchObject({
      code: 'host_not_registered',
    })
  })

  it('getActivePublicKey() throws host_pending für pending host', async () => {
    const reg = new HostKeyRegistry(new InMemoryHostKeyRepo())
    await reg.register({ host_id: 'teammind', public_key_pem: FAKE_PEM_A })
    await expect(reg.getActivePublicKey('teammind')).rejects.toMatchObject({
      code: 'host_pending',
    })
  })

  it('getActivePublicKey() throws host_rejected für rejected host', async () => {
    const reg = new HostKeyRegistry(new InMemoryHostKeyRepo())
    await reg.register({ host_id: 'teammind', public_key_pem: FAKE_PEM_A })
    await reg.reject('teammind')
    await expect(reg.getActivePublicKey('teammind')).rejects.toMatchObject({
      code: 'host_rejected',
    })
  })

  it('getActivePublicKey() returns PEM für active host', async () => {
    const reg = new HostKeyRegistry(new InMemoryHostKeyRepo())
    await reg.register({ host_id: 'teammind', public_key_pem: FAKE_PEM_A })
    await reg.approve('teammind')
    expect(await reg.getActivePublicKey('teammind')).toBe(FAKE_PEM_A.trim())
  })
})
