import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildHostRecordStatus,
  HostKeyRegistry,
  InMemoryHostKeyRepo,
} from '../src/auth/host-keys.js'

const FAKE_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAfakekeyAfakekeyAfakekeyAfakekeyAfakekeyA
-----END PUBLIC KEY-----`

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('HostKeyRegistry — Reregister-Loop-Detection (v0.2.3)', () => {
  it('does NOT detect loop on first registration', async () => {
    const reg = new HostKeyRegistry(new InMemoryHostKeyRepo())
    await reg.register({ host_id: 'teammind', public_key_pem: FAKE_PEM })
    expect(reg.detectReregisterLoop('teammind', ['host_version', 'relay_url'])).toBe(false)
  })

  it('does NOT detect loop after 2 same-tuple registers (under threshold)', async () => {
    const reg = new HostKeyRegistry(new InMemoryHostKeyRepo())
    await reg.register({ host_id: 'teammind', public_key_pem: FAKE_PEM })
    await reg.register({ host_id: 'teammind', public_key_pem: FAKE_PEM })
    expect(reg.detectReregisterLoop('teammind', ['host_version', 'relay_url'])).toBe(false)
  })

  it('DOES detect loop after 3 same-tuple registers within 5min window', async () => {
    const reg = new HostKeyRegistry(new InMemoryHostKeyRepo())
    await reg.register({ host_id: 'teammind', public_key_pem: FAKE_PEM })
    await reg.register({ host_id: 'teammind', public_key_pem: FAKE_PEM })
    await reg.register({ host_id: 'teammind', public_key_pem: FAKE_PEM })
    expect(reg.detectReregisterLoop('teammind', ['host_version', 'relay_url'])).toBe(true)
  })

  it('does NOT detect loop if window expired (>5min)', async () => {
    const reg = new HostKeyRegistry(new InMemoryHostKeyRepo())
    await reg.register({ host_id: 'teammind', public_key_pem: FAKE_PEM })
    vi.advanceTimersByTime(6 * 60 * 1000) // 6 minutes
    await reg.register({ host_id: 'teammind', public_key_pem: FAKE_PEM })
    await reg.register({ host_id: 'teammind', public_key_pem: FAKE_PEM })
    // Only 2 recent registers, even though 3 total
    expect(reg.detectReregisterLoop('teammind', ['host_version', 'relay_url'])).toBe(false)
  })

  it('does NOT detect loop if missing-fields change (host providing new value)', async () => {
    const reg = new HostKeyRegistry(new InMemoryHostKeyRepo(), {
      optionalRegisterFields: ['host_version', 'relay_url'],
    })
    // 3 registers, but second one provides relay_url → fingerprint differs
    await reg.register({ host_id: 'teammind', public_key_pem: FAKE_PEM })
    await reg.register({ host_id: 'teammind', public_key_pem: FAKE_PEM, relay_url: 'ws://r' })
    await reg.register({ host_id: 'teammind', public_key_pem: FAKE_PEM })
    // Only 2 entries have missing=[relay_url, host_version], the middle has missing=[host_version]
    expect(reg.detectReregisterLoop('teammind', ['host_version', 'relay_url'])).toBe(false)
  })

  it('Loop-Detection per host_id isolated', async () => {
    const reg = new HostKeyRegistry(new InMemoryHostKeyRepo())
    await reg.register({ host_id: 'host-a', public_key_pem: FAKE_PEM })
    await reg.register({ host_id: 'host-a', public_key_pem: FAKE_PEM })
    await reg.register({ host_id: 'host-a', public_key_pem: FAKE_PEM })
    await reg.register({
      host_id: 'host-b',
      public_key_pem: FAKE_PEM.replace('Afake', 'Bfake'),
    })
    expect(reg.detectReregisterLoop('host-a', ['host_version', 'relay_url'])).toBe(true)
    expect(reg.detectReregisterLoop('host-b', ['host_version', 'relay_url'])).toBe(false)
  })

  it('disabled when reregisterLoopThreshold=0', async () => {
    const reg = new HostKeyRegistry(new InMemoryHostKeyRepo(), { reregisterLoopThreshold: 0 })
    for (let i = 0; i < 10; i++) {
      await reg.register({ host_id: 'teammind', public_key_pem: FAKE_PEM })
    }
    expect(reg.detectReregisterLoop('teammind', ['host_version', 'relay_url'])).toBe(false)
  })

  it('configurable threshold + window', async () => {
    const reg = new HostKeyRegistry(new InMemoryHostKeyRepo(), {
      reregisterLoopThreshold: 5,
      reregisterLoopWindowMs: 1000,
    })
    for (let i = 0; i < 4; i++) {
      await reg.register({ host_id: 'teammind', public_key_pem: FAKE_PEM })
    }
    expect(reg.detectReregisterLoop('teammind', ['host_version', 'relay_url'])).toBe(false)
    await reg.register({ host_id: 'teammind', public_key_pem: FAKE_PEM })
    expect(reg.detectReregisterLoop('teammind', ['host_version', 'relay_url'])).toBe(true)
  })

  it('caps trace at 10 entries (oldest dropped)', async () => {
    const reg = new HostKeyRegistry(new InMemoryHostKeyRepo(), {
      reregisterLoopThreshold: 3,
      reregisterLoopWindowMs: 60 * 60 * 1000,
    })
    for (let i = 0; i < 15; i++) {
      await reg.register({ host_id: 'teammind', public_key_pem: FAKE_PEM })
    }
    // Last 10 entries kept, all with same missing-fingerprint → detected
    expect(reg.detectReregisterLoop('teammind', ['host_version', 'relay_url'])).toBe(true)
  })
})

describe('buildHostRecordStatus — loopDetected flag (v0.2.3)', () => {
  it('omits reregister_loop_detected when not provided', () => {
    const status = buildHostRecordStatus({
      isFirstRegister: false,
      providedFields: [],
      optionalFields: ['host_version'],
    })
    expect(status).not.toHaveProperty('reregister_loop_detected')
  })

  it('omits reregister_loop_detected when loopDetected=false', () => {
    const status = buildHostRecordStatus({
      isFirstRegister: false,
      providedFields: [],
      optionalFields: ['host_version'],
      loopDetected: false,
    })
    expect(status).not.toHaveProperty('reregister_loop_detected')
  })

  it('includes reregister_loop_detected=true when flagged', () => {
    const status = buildHostRecordStatus({
      isFirstRegister: false,
      providedFields: [],
      optionalFields: ['host_version'],
      loopDetected: true,
    })
    expect(status.reregister_loop_detected).toBe(true)
  })
})
