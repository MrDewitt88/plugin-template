import { describe, expect, it } from 'vitest'
import { createLicenseClient } from '../src/client.js'
import type { Entitlement } from '../src/types.js'

const ent = (plugins: string[], extra?: Partial<Entitlement>): Entitlement => ({
  plugins,
  ent_ver: 1,
  ...extra,
})

describe('createLicenseClient — gate (offline, default-deny)', () => {
  it('resolved + member → ok', async () => {
    const { gate } = createLicenseClient({ resolveEntitlement: () => ent(['apex-2d']) })
    expect(await gate.check({ pluginId: 'apex-2d' })).toEqual({ ok: true })
  })

  it('resolved + NOT member → not_entitled', async () => {
    const { gate } = createLicenseClient({ resolveEntitlement: () => ent(['apex-2d']) })
    const r = await gate.check({ pluginId: 'med-mind' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('not_entitled')
  })

  it('default-deny: no entitlement + no cache → no_entitlement', async () => {
    const { gate } = createLicenseClient({ resolveEntitlement: () => null })
    const r = await gate.check({ pluginId: 'apex-2d' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('no_entitlement')
  })

  it('resolveEntitlement throws + no cache → entitlement_error (still deny)', async () => {
    const { gate } = createLicenseClient({
      resolveEntitlement: () => {
        throw new Error('offline')
      },
    })
    const r = await gate.check({ pluginId: 'apex-2d' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('entitlement_error')
  })

  it('failOpen → allows when no entitlement + no cache', async () => {
    const { gate } = createLicenseClient({ resolveEntitlement: () => null, failOpen: true })
    expect(await gate.check({ pluginId: 'apex-2d' })).toEqual({ ok: true })
  })

  describe('last-known-good grace', () => {
    it('offline within grace → uses cached entitlement', async () => {
      const t = { now: 1_000_000 }
      let online = true
      const { gate } = createLicenseClient({
        resolveEntitlement: () => (online ? ent(['apex-2d'], { exp: 1000 }) : null), // exp = 1000s = 1_000_000ms
        graceMs: 60_000,
        now: () => t.now,
      })
      // prime cache while online (now = exp*1000 exactly)
      expect((await gate.check({ pluginId: 'apex-2d' })).ok).toBe(true)
      // go offline; advance to just within grace (exp*1000 + 60s)
      online = false
      t.now = 1_000_000 + 59_000
      expect((await gate.check({ pluginId: 'apex-2d' })).ok).toBe(true) // cache trusted
      // a non-member is still denied from cache
      const r = await gate.check({ pluginId: 'med-mind' })
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.reason).toBe('not_entitled')
    })

    it('offline past exp + grace → stale_entitlement', async () => {
      const t = { now: 1_000_000 }
      let online = true
      const { gate } = createLicenseClient({
        resolveEntitlement: () => (online ? ent(['apex-2d'], { exp: 1000 }) : null),
        graceMs: 60_000,
        now: () => t.now,
      })
      await gate.check({ pluginId: 'apex-2d' }) // prime cache
      online = false
      t.now = 1_000_000 + 61_000 // past exp*1000 + grace
      const r = await gate.check({ pluginId: 'apex-2d' })
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.reason).toBe('stale_entitlement')
    })

    it('graceMs default 0 → cached entitlement past exp is immediately stale', async () => {
      const t = { now: 1_000_000 }
      let online = true
      const { gate } = createLicenseClient({
        resolveEntitlement: () => (online ? ent(['apex-2d'], { exp: 999 }) : null), // exp = 999_000ms (past now)
        now: () => t.now,
      })
      await gate.check({ pluginId: 'apex-2d' }) // prime (cachedAt = now, but exp already < now)
      online = false
      t.now = 1_000_001
      const r = await gate.check({ pluginId: 'apex-2d' })
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.reason).toBe('stale_entitlement')
    })

    it('offline at the EXACT grace boundary (now === exp + grace) → ok (inclusive)', async () => {
      const t = { now: 1_000_000 }
      let online = true
      const { gate } = createLicenseClient({
        resolveEntitlement: () => (online ? ent(['apex-2d'], { exp: 1000 }) : null),
        graceMs: 60_000,
        now: () => t.now,
      })
      await gate.check({ pluginId: 'apex-2d' }) // prime cache
      online = false
      t.now = 1_000_000 + 60_000 // === exp*1000 + graceMs (trustUntil)
      expect((await gate.check({ pluginId: 'apex-2d' })).ok).toBe(true)
    })

    it('failOpen + cache past grace → allows (dev mode)', async () => {
      const t = { now: 1_000_000 }
      let online = true
      const { gate } = createLicenseClient({
        resolveEntitlement: () => (online ? ent(['apex-2d'], { exp: 999 }) : null),
        failOpen: true,
        now: () => t.now,
      })
      await gate.check({ pluginId: 'apex-2d' })
      online = false
      t.now = 2_000_000
      expect((await gate.check({ pluginId: 'apex-2d' })).ok).toBe(true)
    })
  })

  it('lastKnownGood() exposes the cached entitlement', async () => {
    const { gate, lastKnownGood } = createLicenseClient({
      resolveEntitlement: () => ent(['apex-2d'], { ent_ver: 7 }),
    })
    expect(lastKnownGood()).toBeNull()
    await gate.check({ pluginId: 'apex-2d' })
    expect(lastKnownGood()?.ent_ver).toBe(7)
  })
})
