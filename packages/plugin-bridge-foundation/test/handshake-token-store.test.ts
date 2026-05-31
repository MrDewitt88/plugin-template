// v0.7.1+ tests for createHandshakeTokenStore — captures Bearer at handshake
// middleware time so outbound clients (createAgentComplete, createReverseCallClient)
// can reuse the per-plugin activation JWT without manual env-var wiring.

import { describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import { createHandshakeTokenStore } from '../src/auth/handshake-token-store.js'
import { createBridgeApp, type BridgeAppOptions } from '../src/server.js'
import { HostKeyRegistry, InMemoryHostKeyRepo } from '../src/auth/host-keys.js'
import type { PluginManifest } from '../src/types.js'

describe('createHandshakeTokenStore — standalone behaviour', () => {
  it('initially throws no_handshake_yet on current()', async () => {
    const store = createHandshakeTokenStore()
    await expect(store.current()).rejects.toThrow(/no_handshake_yet/)
  })

  it('lastUpdated() returns null before any capture', () => {
    const store = createHandshakeTokenStore()
    expect(store.lastUpdated()).toBeNull()
  })

  it('returns the most recent captured token from current()', async () => {
    const store = createHandshakeTokenStore()
    store._capture('jwt-A')
    expect(await store.current()).toBe('jwt-A')
    store._capture('jwt-B')
    expect(await store.current()).toBe('jwt-B')
  })

  it('lastUpdated() returns a Date after capture', () => {
    const store = createHandshakeTokenStore()
    expect(store.lastUpdated()).toBeNull()
    store._capture('jwt-A')
    const after = store.lastUpdated()
    expect(after).toBeInstanceOf(Date)
  })

  it('lastUpdated() advances on subsequent captures', async () => {
    const store = createHandshakeTokenStore()
    store._capture('jwt-A')
    const t1 = store.lastUpdated()!
    // Ensure clock advances at least 1ms
    await new Promise((r) => setTimeout(r, 5))
    store._capture('jwt-B')
    const t2 = store.lastUpdated()!
    expect(t2.getTime()).toBeGreaterThanOrEqual(t1.getTime())
  })

  it('ignores empty-string captures (defence-in-depth)', async () => {
    const store = createHandshakeTokenStore()
    store._capture('jwt-A')
    store._capture('')
    expect(await store.current()).toBe('jwt-A')
    store._capture('   ')
    // Non-empty but trimmed-empty SHOULD still capture (we only check string-length)
    // — the middleware does the trim before _capture, so any string reaching _capture
    // is considered valid. This test documents that we don't double-trim.
    expect(await store.current()).toBe('   ')
  })

  it('ignores non-string captures (defence-in-depth)', async () => {
    const store = createHandshakeTokenStore()
    store._capture('jwt-A')
    // @ts-expect-error — testing runtime guard
    store._capture(null)
    // @ts-expect-error — testing runtime guard
    store._capture(undefined)
    // @ts-expect-error — testing runtime guard
    store._capture(12345)
    expect(await store.current()).toBe('jwt-A')
  })

  it('accepts initialToken + initialTime test-fixtures', async () => {
    const fixedTime = new Date('2026-05-31T07:00:00Z')
    const store = createHandshakeTokenStore({
      initialToken: 'seeded-jwt',
      initialTime: fixedTime,
    })
    expect(await store.current()).toBe('seeded-jwt')
    expect(store.lastUpdated()?.toISOString()).toBe(fixedTime.toISOString())
  })

  it('initialToken without initialTime stamps current Date', async () => {
    const before = Date.now()
    const store = createHandshakeTokenStore({ initialToken: 'seeded' })
    const after = Date.now()
    expect(await store.current()).toBe('seeded')
    const ts = store.lastUpdated()!.getTime()
    expect(ts).toBeGreaterThanOrEqual(before)
    expect(ts).toBeLessThanOrEqual(after)
  })
})

// --- Integration: createBridgeApp wires capture-middleware --------------

function makeManifest(): PluginManifest {
  return {
    id: 'test-plugin',
    name: { de: 'Test', en: 'Test' },
    description: { de: 't', en: 't' },
    version: '0.0.1',
    distribution: { type: 'external-service', service_endpoint: 'http://127.0.0.1:3600' },
    compatibility: { apps: ['teammind'], min_app_version: '0.5.0' },
    provides: { routes: [], mcp_tools: [], module_extensions: [], scopes_required: [] },
  } as unknown as PluginManifest
}

function makeApp(extraOpts: Partial<BridgeAppOptions> = {}) {
  const manifest = makeManifest()
  const registry = new HostKeyRegistry(new InMemoryHostKeyRepo(), {
    autoAccept: true,
  })
  return createBridgeApp({
    manifest,
    registry,
    toolHandlers: {},
    ...extraOpts,
  })
}

describe('createBridgeApp — handshakeTokenStore wiring (v0.7.1+)', () => {
  it('captures Bearer from /plugin-bridge/v1/handshake request', async () => {
    const tokenStore = createHandshakeTokenStore()
    const app = makeApp({ handshakeTokenStore: tokenStore })

    // POST handshake with Authorization Bearer — capture runs before
    // authMiddleware so even if validation fails we expect capture.
    await app.request('http://localhost/plugin-bridge/v1/handshake', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer captured-jwt-from-handshake',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    })

    expect(await tokenStore.current()).toBe('captured-jwt-from-handshake')
  })

  it('captures even when authMiddleware later rejects (invalid JWT)', async () => {
    // The Bearer "garbage" will fail JWT-validation downstream — but our
    // capture middleware runs BEFORE auth, so the store still captures it.
    // This is intentional (diagnostics value of "last token attempted").
    const tokenStore = createHandshakeTokenStore()
    const app = makeApp({ handshakeTokenStore: tokenStore })

    await app.request('http://localhost/plugin-bridge/v1/handshake', {
      method: 'POST',
      headers: { Authorization: 'Bearer garbage-jwt-will-fail-validation' },
      body: '{}',
    })

    expect(await tokenStore.current()).toBe('garbage-jwt-will-fail-validation')
  })

  it('captures the most recent Bearer on multiple handshakes', async () => {
    const tokenStore = createHandshakeTokenStore()
    const app = makeApp({ handshakeTokenStore: tokenStore })

    for (const jwt of ['jwt-1', 'jwt-2', 'jwt-3']) {
      await app.request('http://localhost/plugin-bridge/v1/handshake', {
        method: 'POST',
        headers: { Authorization: `Bearer ${jwt}` },
        body: '{}',
      })
    }
    expect(await tokenStore.current()).toBe('jwt-3')
  })

  it('handles lowercase authorization header', async () => {
    const tokenStore = createHandshakeTokenStore()
    const app = makeApp({ handshakeTokenStore: tokenStore })

    await app.request('http://localhost/plugin-bridge/v1/handshake', {
      method: 'POST',
      headers: { authorization: 'Bearer lowercase-jwt' },
      body: '{}',
    })

    expect(await tokenStore.current()).toBe('lowercase-jwt')
  })

  it('does not capture from non-Bearer Authorization scheme', async () => {
    const tokenStore = createHandshakeTokenStore()
    const app = makeApp({ handshakeTokenStore: tokenStore })

    await app.request('http://localhost/plugin-bridge/v1/handshake', {
      method: 'POST',
      headers: { Authorization: 'Basic dXNlcjpwYXNz' },
      body: '{}',
    })

    await expect(tokenStore.current()).rejects.toThrow(/no_handshake_yet/)
  })

  it('does not capture when missing Authorization header entirely', async () => {
    const tokenStore = createHandshakeTokenStore()
    const app = makeApp({ handshakeTokenStore: tokenStore })

    await app.request('http://localhost/plugin-bridge/v1/handshake', {
      method: 'POST',
      body: '{}',
    })

    await expect(tokenStore.current()).rejects.toThrow(/no_handshake_yet/)
  })

  it('does not capture from non-handshake endpoints (e.g. /manifest)', async () => {
    const tokenStore = createHandshakeTokenStore()
    const app = makeApp({ handshakeTokenStore: tokenStore })

    await app.request('http://localhost/plugin-bridge/v1/manifest', {
      method: 'GET',
      headers: { Authorization: 'Bearer manifest-jwt-should-not-capture' },
    })

    await expect(tokenStore.current()).rejects.toThrow(/no_handshake_yet/)
  })

  it('omitting handshakeTokenStore preserves v0.6.x behaviour (zero impact)', async () => {
    // No handshakeTokenStore field — Foundation should not crash + not
    // attempt capture. Backward-compat smoke-test.
    const app = makeApp()
    const res = await app.request('http://localhost/plugin-bridge/v1/handshake', {
      method: 'POST',
      headers: { Authorization: 'Bearer x' },
      body: '{}',
    })
    // We don't assert a specific status (auth will reject the JWT) — only
    // that the app processed the request without throwing.
    expect(typeof res.status).toBe('number')
  })
})
