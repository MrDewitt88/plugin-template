import { describe, expect, it } from 'vitest'
import {
  buildHostRecordStatus,
  fingerprintPublicKey,
  HostKeyRegistry,
  InMemoryHostKeyRepo,
} from '../src/auth/host-keys.js'
import { BridgeTokenError } from '../src/auth/jwt.js'
import { PLUGIN_REGISTRATION_SCHEMA_VERSION } from '../src/types.js'

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
  it('new host_id → pending + is_first_register=true (autoAccept=false default)', async () => {
    const reg = new HostKeyRegistry(new InMemoryHostKeyRepo())
    const { record, isFirstRegister } = await reg.register({
      host_id: 'teammind',
      public_key_pem: FAKE_PEM_A,
    })
    expect(record.status).toBe('pending')
    expect(record.host_id).toBe('teammind')
    expect(record.fingerprint).toMatch(/^[0-9a-f]{4}/)
    expect(record.approved_at).toBeNull()
    expect(isFirstRegister).toBe(true)
  })

  it('autoAccept=true → active', async () => {
    const reg = new HostKeyRegistry(new InMemoryHostKeyRepo(), { autoAccept: true })
    const { record } = await reg.register({ host_id: 'teammind', public_key_pem: FAKE_PEM_A })
    expect(record.status).toBe('active')
    expect(record.approved_at).not.toBeNull()
  })

  it('same host_id + same key + active → preserves status + isFirstRegister=false', async () => {
    const reg = new HostKeyRegistry(new InMemoryHostKeyRepo())
    await reg.register({ host_id: 'teammind', public_key_pem: FAKE_PEM_A })
    await reg.approve('teammind')
    const { record, isFirstRegister } = await reg.register({
      host_id: 'teammind',
      public_key_pem: FAKE_PEM_A,
    })
    expect(record.status).toBe('active')
    expect(isFirstRegister).toBe(false)
  })

  it('same host_id + different key → reset to pending + isFirstRegister=false', async () => {
    const reg = new HostKeyRegistry(new InMemoryHostKeyRepo())
    await reg.register({ host_id: 'teammind', public_key_pem: FAKE_PEM_A })
    await reg.approve('teammind')
    const { record, isFirstRegister } = await reg.register({
      host_id: 'teammind',
      public_key_pem: FAKE_PEM_B,
    })
    expect(record.status).toBe('pending')
    expect(record.fingerprint).not.toBe(fingerprintPublicKey(FAKE_PEM_A))
    expect(isFirstRegister).toBe(false)
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

describe('buildHostRecordStatus — Drift #206', () => {
  it('first-register + all optional fields provided → no reregister recommended', () => {
    const status = buildHostRecordStatus({
      isFirstRegister: true,
      providedFields: ['host_version'],
      optionalFields: ['host_version'],
    })
    expect(status.schema_version).toBe(PLUGIN_REGISTRATION_SCHEMA_VERSION)
    expect(status.plugin_current_schema).toBe(PLUGIN_REGISTRATION_SCHEMA_VERSION)
    expect(status.is_first_register).toBe(true)
    expect(status.reregister_recommended).toBe(false)
    expect(status.missing_optional_fields).toEqual([])
  })

  it('first-register + missing optional fields → reregister recommended', () => {
    const status = buildHostRecordStatus({
      isFirstRegister: true,
      providedFields: [],
      optionalFields: ['host_version', 'relay_url'],
    })
    expect(status.is_first_register).toBe(true)
    expect(status.reregister_recommended).toBe(true)
    expect(status.missing_optional_fields).toEqual(['host_version', 'relay_url'])
  })

  it('re-register (existing host) + partial coverage', () => {
    const status = buildHostRecordStatus({
      isFirstRegister: false,
      providedFields: ['host_version'],
      optionalFields: ['host_version', 'relay_url'],
    })
    expect(status.is_first_register).toBe(false)
    expect(status.reregister_recommended).toBe(true)
    expect(status.missing_optional_fields).toEqual(['relay_url'])
  })

  it('block is symmetric — always returned with same shape regardless of state', () => {
    const a = buildHostRecordStatus({
      isFirstRegister: true,
      providedFields: ['host_version'],
      optionalFields: ['host_version'],
    })
    const b = buildHostRecordStatus({
      isFirstRegister: false,
      providedFields: ['host_version'],
      optionalFields: ['host_version'],
    })
    expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort())
  })
})

describe('HostKeyRegistry.optionalFields — configurable via RegistryOptions', () => {
  it('defaults to [] (v0.7.2 Drift #105 — opt-in, no forced fields)', () => {
    const reg = new HostKeyRegistry(new InMemoryHostKeyRepo())
    expect(reg.optionalFields).toEqual([])
  })

  it('overrides via optionalRegisterFields (opt-in to enforce)', () => {
    const reg = new HostKeyRegistry(new InMemoryHostKeyRepo(), {
      optionalRegisterFields: ['host_version', 'relay_url', 'host_metadata'],
    })
    expect(reg.optionalFields).toEqual(['host_version', 'relay_url', 'host_metadata'])
  })
})

describe('HostKeyRegistry.getProvidedOptionalFields — v0.7.2 per-host tracking', () => {
  const PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAfakekeyAfakekeyAfakekeyAfakekeyAfakekeyA
-----END PUBLIC KEY-----`

  it('returns [] for an unknown host', () => {
    const reg = new HostKeyRegistry(new InMemoryHostKeyRepo())
    expect(reg.getProvidedOptionalFields('nobody')).toEqual([])
  })

  it('records the optional fields a host supplied at register', async () => {
    const reg = new HostKeyRegistry(new InMemoryHostKeyRepo(), { autoAccept: true })
    await reg.register({
      host_id: 'teammind',
      public_key_pem: PEM,
      host_version: '1.0.0',
      relay_url: 'ws://r',
    })
    expect(reg.getProvidedOptionalFields('teammind').sort()).toEqual(['host_version', 'relay_url'])
  })

  it('unions provided fields across repeated registrations (stays credited)', async () => {
    const reg = new HostKeyRegistry(new InMemoryHostKeyRepo(), { autoAccept: true })
    await reg.register({ host_id: 'teammind', public_key_pem: PEM, host_version: '1.0.0' })
    await reg.register({ host_id: 'teammind', public_key_pem: PEM, relay_url: 'ws://r' })
    expect(reg.getProvidedOptionalFields('teammind').sort()).toEqual(['host_version', 'relay_url'])
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
