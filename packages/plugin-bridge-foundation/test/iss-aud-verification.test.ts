// v0.9.0 — per-host issuer/audience binding + aud claim + verify options.
// Closes markview #5345 (verifyBridgeToken was iss/aud-agnostic; BridgeTokenClaims
// had no aud). All additive: a host with no expected_issuer/expected_audience
// enforces nothing (backward-compat = v0.8.x).

import { describe, expect, it } from 'vitest'
import { verifyBridgeToken } from '../src/auth/jwt.js'
import { buildTestRegistry, mintTestBridgeToken } from '../src/testing/index.js'
import { HostKeyRegistry, InMemoryHostKeyRepo } from '../src/auth/host-keys.js'
import { createBridgeApp } from '../src/server.js'
import type { PluginManifest } from '../src/types.js'

const T = '00000000-0000-0000-0000-000000000001'
const U = '00000000-0000-0000-0000-000000000002'
const PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAfakekeyAfakekeyAfakekeyAfakekeyAfakekeyA
-----END PUBLIC KEY-----`

const MANIFEST: PluginManifest = {
  id: 'test-plugin',
  name: { de: 'T', en: 'T' },
  description: { de: 'T', en: 'T' },
  version: '0.1.0',
  distribution: { type: 'external-service', service_endpoint: 'http://127.0.0.1:3600' },
  compatibility: { apps: ['teammind'], min_app_version: '0.5.0' },
  provides: { routes: [], mcp_tools: [], module_extensions: [], scopes_required: [] },
} as PluginManifest

describe('verifyBridgeToken — per-host audience binding (v0.9.0)', () => {
  it('expected_audience set + matching aud → verifies', async () => {
    const h = await buildTestRegistry({ hostId: 'teammind', expectedAudience: 'plugin:test' })
    const token = await h.mintToken({ pluginId: 'p', tenantId: T, userId: U, aud: 'plugin:test' })
    const claims = await verifyBridgeToken(token, h.registry)
    expect(claims.aud).toBe('plugin:test')
    expect(claims.host_id).toBe('teammind')
  })

  it('expected_audience set + MISSING aud → invalid_audience', async () => {
    const h = await buildTestRegistry({ hostId: 'teammind', expectedAudience: 'plugin:test' })
    const token = await h.mintToken({ pluginId: 'p', tenantId: T, userId: U })
    await expect(verifyBridgeToken(token, h.registry)).rejects.toMatchObject({
      code: 'invalid_audience',
    })
  })

  it('expected_audience set + WRONG aud → invalid_audience', async () => {
    const h = await buildTestRegistry({ hostId: 'teammind', expectedAudience: 'plugin:test' })
    const token = await h.mintToken({ pluginId: 'p', tenantId: T, userId: U, aud: 'plugin:other' })
    await expect(verifyBridgeToken(token, h.registry)).rejects.toMatchObject({
      code: 'invalid_audience',
    })
  })
})

describe('verifyBridgeToken — per-host issuer binding (v0.9.0)', () => {
  it('expected_issuer set + matching iss → verifies', async () => {
    // mint iss defaults to hostId ('teammind') → matches expected_issuer
    const h = await buildTestRegistry({ hostId: 'teammind', expectedIssuer: 'teammind' })
    const token = await h.mintToken({ pluginId: 'p', tenantId: T, userId: U })
    const claims = await verifyBridgeToken(token, h.registry)
    expect(claims.iss).toBe('teammind')
  })

  it('expected_issuer set + WRONG iss → invalid_issuer', async () => {
    const h = await buildTestRegistry({ hostId: 'teammind', expectedIssuer: 'teammind' })
    const token = await h.mintToken({ pluginId: 'p', tenantId: T, userId: U, iss: 'evil-issuer' })
    await expect(verifyBridgeToken(token, h.registry)).rejects.toMatchObject({
      code: 'invalid_issuer',
    })
  })
})

describe('verifyBridgeToken — backward-compat + opt-in hardening (v0.9.0)', () => {
  it('no per-host iss/aud → token without aud verifies (v0.8.x behaviour)', async () => {
    const h = await buildTestRegistry({ hostId: 'teammind' })
    const token = await h.mintToken({ pluginId: 'p', tenantId: T, userId: U })
    const claims = await verifyBridgeToken(token, h.registry)
    expect(claims.host_id).toBe('teammind')
    expect(claims.aud).toBeUndefined()
  })

  it('requireAudience option + token without aud → invalid_audience', async () => {
    const h = await buildTestRegistry({ hostId: 'teammind' })
    const token = await h.mintToken({ pluginId: 'p', tenantId: T, userId: U })
    await expect(
      verifyBridgeToken(token, h.registry, { requireAudience: true }),
    ).rejects.toMatchObject({ code: 'invalid_audience' })
  })

  it('hostIdFormat option + malformed host_id → invalid_claims (before key lookup)', async () => {
    const h = await buildTestRegistry({ hostId: 'teammind' })
    const token = await mintTestBridgeToken(h.privateKey, {
      pluginId: 'p',
      hostId: 'bad host id!',
      tenantId: T,
      userId: U,
    })
    await expect(
      verifyBridgeToken(token, h.registry, { hostIdFormat: /^[a-z0-9-]+$/ }),
    ).rejects.toMatchObject({ code: 'invalid_claims' })
  })
})

describe('e2e — per-host audience enforced through authMiddleware (v0.9.0)', () => {
  it('matching aud → 200; missing aud → 401 invalid_audience', async () => {
    const h = await buildTestRegistry({ hostId: 'teammind', expectedAudience: 'plugin:test' })
    const app = createBridgeApp({ manifest: MANIFEST, registry: h.registry, toolHandlers: {} })
    const good = await h.mintToken({
      pluginId: 'test-plugin',
      tenantId: T,
      userId: U,
      aud: 'plugin:test',
    })
    const bad = await h.mintToken({ pluginId: 'test-plugin', tenantId: T, userId: U })

    const okRes = await app.request('http://localhost/plugin-bridge/v1/manifest', {
      headers: { Authorization: `Bearer ${good}` },
    })
    expect(okRes.status).toBe(200)

    const badRes = await app.request('http://localhost/plugin-bridge/v1/manifest', {
      headers: { Authorization: `Bearer ${bad}` },
    })
    expect(badRes.status).toBe(401)
    expect(((await badRes.json()) as { error: { code: string } }).error.code).toBe(
      'invalid_audience',
    )
  })
})

describe('HostKeyRegistry — register persists + refreshes per-host fields (v0.9.0)', () => {
  it('register stores expected_issuer/audience; getHostVerification returns them', async () => {
    const reg = new HostKeyRegistry(new InMemoryHostKeyRepo(), { autoAccept: true })
    await reg.register({
      host_id: 'h',
      public_key_pem: PEM,
      expected_issuer: 'iss-x',
      expected_audience: 'aud-y',
    })
    const hv = await reg.getHostVerification('h')
    expect(hv.expected_issuer).toBe('iss-x')
    expect(hv.expected_audience).toBe('aud-y')
  })

  it('same-key re-register refreshes expected_audience, preserves status', async () => {
    const reg = new HostKeyRegistry(new InMemoryHostKeyRepo(), { autoAccept: false })
    await reg.register({ host_id: 'h', public_key_pem: PEM })
    await reg.approve('h')
    await reg.register({ host_id: 'h', public_key_pem: PEM, expected_audience: 'aud-z' })
    const hv = await reg.getHostVerification('h') // throws if not active → status preserved
    expect(hv.expected_audience).toBe('aud-z')
  })

  it('getHostVerification throws host_pending for unapproved host', async () => {
    const reg = new HostKeyRegistry(new InMemoryHostKeyRepo(), { autoAccept: false })
    await reg.register({ host_id: 'h', public_key_pem: PEM })
    await expect(reg.getHostVerification('h')).rejects.toMatchObject({ code: 'host_pending' })
  })
})

describe('verifyBridgeToken — v0.8.x resolver fallback (no getHostVerification)', () => {
  it('PEM-only resolver verifies a normal token (no iss/aud enforcement)', async () => {
    const h = await buildTestRegistry({ hostId: 'teammind' })
    // Minimal resolver implementing ONLY getActivePublicKey — exercises the
    // fallback branch in verifyBridgeToken (no getHostVerification).
    const pemOnlyResolver = {
      async getActivePublicKey(): Promise<string> {
        return h.publicKeyPem
      },
    }
    const token = await h.mintToken({ pluginId: 'p', tenantId: T, userId: U })
    const claims = await verifyBridgeToken(token, pemOnlyResolver)
    expect(claims.host_id).toBe('teammind')
    expect(claims.aud).toBeUndefined()
  })
})

describe('e2e — per-host issuer + wrong-aud through authMiddleware (v0.9.0)', () => {
  it('wrong aud → 401 invalid_audience (not just missing)', async () => {
    const h = await buildTestRegistry({ hostId: 'teammind', expectedAudience: 'plugin:test' })
    const app = createBridgeApp({ manifest: MANIFEST, registry: h.registry, toolHandlers: {} })
    const wrong = await h.mintToken({
      pluginId: 'test-plugin',
      tenantId: T,
      userId: U,
      aud: 'plugin:evil',
    })
    const res = await app.request('http://localhost/plugin-bridge/v1/manifest', {
      headers: { Authorization: `Bearer ${wrong}` },
    })
    expect(res.status).toBe(401)
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('invalid_audience')
  })

  it('per-host issuer: matching iss → 200, wrong iss → 401 invalid_issuer', async () => {
    const h = await buildTestRegistry({ hostId: 'teammind', expectedIssuer: 'teammind' })
    const app = createBridgeApp({ manifest: MANIFEST, registry: h.registry, toolHandlers: {} })
    const good = await h.mintToken({ pluginId: 'test-plugin', tenantId: T, userId: U }) // iss defaults to host
    const bad = await h.mintToken({ pluginId: 'test-plugin', tenantId: T, userId: U, iss: 'evil' })

    const okRes = await app.request('http://localhost/plugin-bridge/v1/manifest', {
      headers: { Authorization: `Bearer ${good}` },
    })
    expect(okRes.status).toBe(200)

    const badRes = await app.request('http://localhost/plugin-bridge/v1/manifest', {
      headers: { Authorization: `Bearer ${bad}` },
    })
    expect(badRes.status).toBe(401)
    expect(((await badRes.json()) as { error: { code: string } }).error.code).toBe('invalid_issuer')
  })
})
