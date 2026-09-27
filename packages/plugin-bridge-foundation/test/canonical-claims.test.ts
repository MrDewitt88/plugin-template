// v0.10.0 — canonical V8 token claim-set (markview #5357) + raw-claims
// passthrough (wiz-mind).
//
// The canonical V8 bridge-token carries iss/aud/sub/tenant_id/host_id/scopes/
// iat/exp — NOT plugin_id/user_id (v8-corp #5354). verifyBridgeToken must accept
// such a token. The plugin identity belongs to the serving manifest; hosts may
// put the user in `sub`. ctx.claims preserves the original verified claims.

import { describe, expect, it } from 'vitest'
import { createBridgeApp } from '../src/server.js'
import { buildTestRegistry } from '../src/testing/index.js'
import { verifyBridgeToken } from '../src/auth/jwt.js'
import type { BridgeAuthContext, PluginManifest, ToolHandler } from '../src/types.js'

const T = '00000000-0000-0000-0000-000000000001'
const U = '00000000-0000-0000-0000-000000000002'

const MANIFEST: PluginManifest = {
  id: 'test-plugin',
  name: { de: 'T', en: 'T' },
  description: { de: 'T', en: 'T' },
  version: '0.1.0',
  distribution: { type: 'external-service', service_endpoint: 'http://127.0.0.1:3600' },
  compatibility: { apps: ['teammind'], min_app_version: '0.5.0' },
  provides: { routes: [], mcp_tools: [], module_extensions: [], scopes_required: [] },
} as PluginManifest

let captured: (BridgeAuthContext & { actorClass: unknown }) | null = null
const echo: ToolHandler = async (_args, ctx) => {
  captured = ctx
  return { ok: true }
}

// Helper: build app + POST execute-tool/echo with a given token.
async function runEcho(
  registry: Awaited<ReturnType<typeof buildTestRegistry>>['registry'],
  token: string,
) {
  captured = null
  const app = createBridgeApp({ manifest: MANIFEST, registry, toolHandlers: { echo } })
  const res = await app.request('http://localhost/plugin-bridge/v1/execute-tool', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ tool_name: 'echo', arguments: {}, tenant_id: T, user_id: U }),
  })
  return res
}

describe('canonical V8 token — no plugin_id/user_id (markview #5357)', () => {
  it('verifyBridgeToken accepts a token WITHOUT plugin_id/user_id (default set)', async () => {
    const h = await buildTestRegistry({ hostId: 'teammind' })
    const token = await h.mintToken({
      pluginId: 'p',
      tenantId: T,
      userId: U,
      omitClaims: ['plugin_id', 'user_id'],
    })
    const claims = await verifyBridgeToken(token, h.registry)
    expect(claims.host_id).toBe('teammind')
    expect(claims.plugin_id).toBeUndefined()
    expect(claims.user_id).toBeUndefined()
  })

  it('execute-tool ctx: pluginId ← manifest, userId ← body when claims omit them', async () => {
    const h = await buildTestRegistry({ hostId: 'teammind' })
    const token = await h.mintToken({
      pluginId: 'test-plugin', // sub defaults to this
      tenantId: T,
      userId: U,
      omitClaims: ['plugin_id', 'user_id'],
    })
    const res = await runEcho(h.registry, token)
    expect(res.status).toBe(200)
    expect(captured?.pluginId).toBe('test-plugin') // from manifest
    expect(captured?.userId).toBe(U) // from request body
  })

  it('still verifies a Foundation-minted token WITH plugin_id/user_id (backward-compat)', async () => {
    const h = await buildTestRegistry({ hostId: 'teammind' })
    const token = await h.mintToken({ pluginId: 'test-plugin', tenantId: T, userId: U })
    const res = await runEcho(h.registry, token)
    expect(res.status).toBe(200)
    expect(captured?.pluginId).toBe('test-plugin')
    expect(captured?.userId).toBe(U)
  })

  it('requiredClaims override re-enforces plugin_id → invalid_claims', async () => {
    const h = await buildTestRegistry({ hostId: 'teammind' })
    const token = await h.mintToken({
      pluginId: 'p',
      tenantId: T,
      userId: U,
      omitClaims: ['plugin_id'],
    })
    await expect(
      verifyBridgeToken(token, h.registry, {
        requiredClaims: ['iss', 'sub', 'jti', 'host_id', 'tenant_id', 'plugin_id'],
      }),
    ).rejects.toMatchObject({ code: 'invalid_claims' })
  })

  it('still rejects a token missing a canonical-required claim (tenant_id)', async () => {
    // tenant_id IS in the default required set → caught by the required-claims loop.
    const h = await buildTestRegistry({ hostId: 'teammind' })
    const token = await h.mintToken({
      pluginId: 'p',
      tenantId: T,
      userId: U,
      omitClaims: ['tenant_id'],
    })
    await expect(verifyBridgeToken(token, h.registry)).rejects.toMatchObject({
      code: 'invalid_claims',
    })
  })

  it('still rejects a token missing host_id (early pre-decode lookup path)', async () => {
    // host_id is consumed BEFORE the required-claims loop (key lookup) → fails
    // earlier, distinct code path, still invalid_claims.
    const h = await buildTestRegistry({ hostId: 'teammind' })
    const token = await h.mintToken({
      pluginId: 'p',
      tenantId: T,
      userId: U,
      omitClaims: ['host_id'],
    })
    await expect(verifyBridgeToken(token, h.registry)).rejects.toMatchObject({
      code: 'invalid_claims',
    })
  })
})

describe('handler identity across host token formats', () => {
  it.each([
    {
      label: 'user subject + audience',
      sub: U,
      aud: MANIFEST.id,
      omitClaims: ['plugin_id', 'user_id'],
    },
    { label: 'legacy plugin subject', sub: MANIFEST.id, omitClaims: ['plugin_id', 'user_id'] },
    { label: 'explicit identity claims', sub: U, aud: MANIFEST.id, omitClaims: [] },
  ])('$label keeps plugin and user identities separate in every handler', async (format) => {
    const h = await buildTestRegistry({ hostId: 'theseus' })
    const token = await h.mintToken({
      pluginId: MANIFEST.id,
      tenantId: T,
      userId: U,
      sub: format.sub,
      ...(format.aud === undefined ? {} : { aud: format.aud }),
      omitClaims: format.omitClaims,
    })
    let context: BridgeAuthContext | undefined
    const app = createBridgeApp({
      manifest: MANIFEST,
      registry: h.registry,
      toolHandlers: {
        echo: async (_args, ctx) => {
          context = ctx
          return {}
        },
      },
      renderUi: async (_route, ctx) => {
        context = ctx
        return { html: '', scripts: [], styles: [] }
      },
      hookHandlers: {
        'notes.versioning.on_save': async (_payload, ctx) => {
          context = ctx
          return {}
        },
      },
    })
    for (const [endpoint, body] of [
      ['execute-tool', { tool_name: 'echo', arguments: {} }],
      ['render-ui', { route_path: '/', context: {} }],
      [
        'invoke-hook',
        { module: 'notes', capability: 'versioning', hook_name: 'on_save', payload: {} },
      ],
    ] as const) {
      context = undefined
      const response = await app.request(`/plugin-bridge/v1/${endpoint}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, tenant_id: T, user_id: U }),
      })
      expect(response.status, endpoint).toBe(200)
      expect(context, endpoint).toMatchObject({
        pluginId: MANIFEST.id,
        userId: U,
        hostId: 'theseus',
        tenantId: T,
        claims: { sub: format.sub },
      })
    }
  })
})

describe('ctx.claims passthrough — host-asserted family_policy (wiz-mind)', () => {
  it('family_policy reaches the handler via ctx.claims', async () => {
    const h = await buildTestRegistry({ hostId: 'teammind' })
    const policy = { allowed_modules: ['wiz-mind'], age_rating: 12, content_filter: 'strict' }
    const token = await h.mintToken({
      pluginId: 'test-plugin',
      tenantId: T,
      userId: U,
      extraClaims: { family_policy: policy },
    })
    const res = await runEcho(h.registry, token)
    expect(res.status).toBe(200)
    expect(captured?.claims.family_policy).toEqual(policy)
  })

  it('ctx.claims is always present (even without extra claims)', async () => {
    const h = await buildTestRegistry({ hostId: 'teammind' })
    const token = await h.mintToken({ pluginId: 'test-plugin', tenantId: T, userId: U })
    await runEcho(h.registry, token)
    expect(captured?.claims.host_id).toBe('teammind')
    expect(captured?.claims.family_policy).toBeUndefined()
  })
})
