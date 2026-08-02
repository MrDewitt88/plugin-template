// v0.7.1+ tests for createHandshakeTokenStore — captures the Bearer only after
// an authenticated, successful handshake so outbound clients
// (createAgentComplete, createReverseCallClient) can reuse the last known-good
// per-plugin activation JWT without manual env-var wiring.

import { describe, expect, it } from 'vitest'
import { createHandshakeTokenStore } from '../src/auth/handshake-token-store.js'
import { createBridgeApp } from '../src/server.js'
import { buildTestRegistry } from '../src/testing/index.js'
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

// --- Integration: only a successful authenticated handshake is captured --

const HOST_ID = 'teammind'
const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const USER_ID = '22222222-2222-4222-8222-222222222222'
const EXPECTED_AUDIENCE = 'test-plugin'

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

function handshakeBody(pluginId = 'test-plugin'): string {
  return JSON.stringify({
    plugin_id: pluginId,
    host_id: HOST_ID,
    host_version: '1.0.0',
    tenant_id: TENANT_ID,
    user_id: USER_ID,
  })
}

async function makeHarness(withTokenStore = true) {
  const manifest = makeManifest()
  const handle = await buildTestRegistry({
    hostId: HOST_ID,
    expectedAudience: EXPECTED_AUDIENCE,
  })
  const tokenStore = createHandshakeTokenStore()
  const app = createBridgeApp({
    manifest,
    registry: handle.registry,
    toolHandlers: {},
    tokenVerify: { requireAudience: true },
    ...(withTokenStore ? { handshakeTokenStore: tokenStore } : {}),
  })
  const mintValidToken = (jti: string) =>
    handle.mintToken({
      pluginId: manifest.id,
      tenantId: TENANT_ID,
      userId: USER_ID,
      aud: EXPECTED_AUDIENCE,
      jti,
    })
  return { app, handle, mintValidToken, tokenStore }
}

function postHandshake(
  app: ReturnType<typeof createBridgeApp>,
  token: string,
  body = handshakeBody(),
): Promise<Response> {
  return app.request('http://localhost/plugin-bridge/v1/handshake', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body,
  })
}

describe('createBridgeApp — handshakeTokenStore wiring (v0.7.1+)', () => {
  it('captures a real authenticated 2xx handshake and rotates on the next success', async () => {
    const { app, mintValidToken, tokenStore } = await makeHarness()
    const firstToken = await mintValidToken('first-valid-handshake')
    const secondToken = await mintValidToken('second-valid-handshake')

    const firstResponse = await postHandshake(app, firstToken)
    expect(firstResponse.status).toBe(200)
    expect(await tokenStore.current()).toBe(firstToken)
    const firstUpdated = tokenStore.lastUpdated()
    expect(firstUpdated).toBeInstanceOf(Date)

    await new Promise((resolve) => setTimeout(resolve, 5))
    const secondResponse = await postHandshake(app, secondToken)
    expect(secondResponse.status).toBe(200)
    expect(await tokenStore.current()).toBe(secondToken)
    expect(tokenStore.lastUpdated()!.getTime()).toBeGreaterThan(firstUpdated!.getTime())
  })

  it('keeps an empty store empty after malformed and invalid-signature JWTs', async () => {
    const { app, tokenStore } = await makeHarness()
    const attacker = await buildTestRegistry({ hostId: HOST_ID })
    const invalidSignatureToken = await attacker.mintToken({
      pluginId: 'test-plugin',
      tenantId: TENANT_ID,
      userId: USER_ID,
      aud: EXPECTED_AUDIENCE,
    })

    const malformedResponse = await postHandshake(app, 'not-a-jwt')
    expect(malformedResponse.status).toBe(401)
    expect(((await malformedResponse.json()) as { error: { code: string } }).error.code).toBe(
      'invalid_token',
    )
    await expect(tokenStore.current()).rejects.toThrow(/no_handshake_yet/)
    expect(tokenStore.lastUpdated()).toBeNull()

    const invalidSignatureResponse = await postHandshake(app, invalidSignatureToken)
    expect(invalidSignatureResponse.status).toBe(401)
    expect(
      ((await invalidSignatureResponse.json()) as { error: { code: string } }).error.code,
    ).toBe('invalid_token')
    await expect(tokenStore.current()).rejects.toThrow(/no_handshake_yet/)
    expect(tokenStore.lastUpdated()).toBeNull()
  })

  it('preserves the token and exact lastUpdated after later auth failures', async () => {
    const { app, handle, mintValidToken, tokenStore } = await makeHarness()
    const validToken = await mintValidToken('known-good')
    expect((await postHandshake(app, validToken)).status).toBe(200)
    const capturedAt = tokenStore.lastUpdated()

    const attacker = await buildTestRegistry({ hostId: HOST_ID })
    const invalidSignatureToken = await attacker.mintToken({
      pluginId: 'test-plugin',
      tenantId: TENANT_ID,
      userId: USER_ID,
      aud: EXPECTED_AUDIENCE,
    })
    const wrongAudienceToken = await handle.mintToken({
      pluginId: 'test-plugin',
      tenantId: TENANT_ID,
      userId: USER_ID,
      aud: 'plugin:attacker',
    })

    const rejectedCases = [
      { token: 'not-a-jwt', expectedCode: 'invalid_token' },
      { token: invalidSignatureToken, expectedCode: 'invalid_token' },
      { token: wrongAudienceToken, expectedCode: 'invalid_audience' },
    ]
    for (const rejected of rejectedCases) {
      const response = await postHandshake(app, rejected.token)
      expect(response.status).toBe(401)
      expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
        rejected.expectedCode,
      )
      expect(await tokenStore.current()).toBe(validToken)
      expect(tokenStore.lastUpdated()).toBe(capturedAt)
    }
  })

  it('preserves the token and exact lastUpdated when the handshake body is malformed', async () => {
    const { app, mintValidToken, tokenStore } = await makeHarness()
    const validToken = await mintValidToken('known-good')
    expect((await postHandshake(app, validToken)).status).toBe(200)
    const capturedAt = tokenStore.lastUpdated()
    const candidateToken = await mintValidToken('malformed-body-candidate')

    const response = await postHandshake(app, candidateToken, '{')
    expect(response.status).toBe(400)
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      'invalid_request',
    )
    expect(await tokenStore.current()).toBe(validToken)
    expect(tokenStore.lastUpdated()).toBe(capturedAt)
  })

  it('preserves the token and exact lastUpdated on plugin_id mismatch handler 400', async () => {
    const { app, mintValidToken, tokenStore } = await makeHarness()
    const validToken = await mintValidToken('known-good')
    expect((await postHandshake(app, validToken)).status).toBe(200)
    const capturedAt = tokenStore.lastUpdated()
    const candidateToken = await mintValidToken('plugin-mismatch-candidate')

    const response = await postHandshake(app, candidateToken, handshakeBody('wrong-plugin'))
    expect(response.status).toBe(400)
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      'plugin_id_mismatch',
    )
    expect(await tokenStore.current()).toBe(validToken)
    expect(tokenStore.lastUpdated()).toBe(capturedAt)
  })

  it('does not capture from non-Bearer Authorization scheme', async () => {
    const { app, tokenStore } = await makeHarness()

    const response = await app.request('http://localhost/plugin-bridge/v1/handshake', {
      method: 'POST',
      headers: {
        Authorization: 'Basic dXNlcjpwYXNz',
        'Content-Type': 'application/json',
      },
      body: handshakeBody(),
    })

    expect(response.status).toBe(401)
    await expect(tokenStore.current()).rejects.toThrow(/no_handshake_yet/)
    expect(tokenStore.lastUpdated()).toBeNull()
  })

  it('does not capture when missing Authorization header entirely', async () => {
    const { app, tokenStore } = await makeHarness()

    const response = await app.request('http://localhost/plugin-bridge/v1/handshake', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: handshakeBody(),
    })

    expect(response.status).toBe(401)
    await expect(tokenStore.current()).rejects.toThrow(/no_handshake_yet/)
    expect(tokenStore.lastUpdated()).toBeNull()
  })

  it('does not capture from non-handshake endpoints (e.g. /manifest)', async () => {
    const { app, mintValidToken, tokenStore } = await makeHarness()
    const token = await mintValidToken('manifest-request')

    const response = await app.request('http://localhost/plugin-bridge/v1/manifest', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    })

    expect(response.status).toBe(200)
    await expect(tokenStore.current()).rejects.toThrow(/no_handshake_yet/)
    expect(tokenStore.lastUpdated()).toBeNull()
  })

  it('omitting handshakeTokenStore preserves v0.6.x behaviour (zero impact)', async () => {
    const { app, mintValidToken } = await makeHarness(false)
    const token = await mintValidToken('no-store')

    const response = await postHandshake(app, token)
    expect(response.status).toBe(200)
  })
})
