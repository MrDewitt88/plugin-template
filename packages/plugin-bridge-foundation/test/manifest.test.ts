import { describe, expect, it } from 'vitest'
import { computeManifestHash } from '../src/manifest/hash.js'
import { ManifestError, validateManifest } from '../src/manifest/loader.js'
import { createBridgeApp } from '../src/server.js'
import { buildTestRegistry } from '../src/testing/index.js'
import type { PluginManifest } from '../src/types.js'

const VALID: PluginManifest = {
  id: 'test-plugin',
  name: { de: 'Test', en: 'Test' },
  description: { de: 'Test', en: 'Test' },
  version: '0.1.0',
  distribution: { type: 'external-service', service_endpoint: 'http://127.0.0.1:3500' },
  compatibility: { apps: ['teammind'], min_app_version: '0.1.0' },
  provides: {
    routes: [],
    mcp_tools: ['test.tool'],
    module_extensions: [],
    scopes_required: [],
  },
}

describe('validateManifest', () => {
  it('preserves the host storage alias through repeated validation and hashing', () => {
    const input = {
      ...VALID,
      distribution: { ...VALID.distribution, storage_env: 'ETMIND_STORAGE_ROOT' },
    }
    const parsed = validateManifest(input)
    expect(parsed.distribution.storage_env).toBe('ETMIND_STORAGE_ROOT')
    expect(validateManifest(parsed)).toEqual(parsed)
    expect(computeManifestHash(parsed)).not.toBe(computeManifestHash(VALID))
    expect(validateManifest(VALID).distribution).not.toHaveProperty('storage_env')
  })

  it.each(['', 'bad-name', 'lowercase', '1INVALID', 'BAD NAME', null, 42])(
    'rejects invalid storage_env %j',
    (storage_env) => {
      expect(() =>
        validateManifest({ ...VALID, distribution: { ...VALID.distribution, storage_env } }),
      ).toThrow(ManifestError)
    },
  )

  it('returns the storage alias over the authenticated bridge with a matching health hash', async () => {
    const manifest = validateManifest({
      ...VALID,
      distribution: { ...VALID.distribution, storage_env: 'ETMIND_STORAGE_ROOT' },
    })
    const handle = await buildTestRegistry({ hostId: 'teammind' })
    const app = createBridgeApp({ manifest, registry: handle.registry, toolHandlers: {} })
    const tenantId = '11111111-1111-4111-8111-111111111111'
    const userId = '22222222-2222-4222-8222-222222222222'
    const token = await handle.mintToken({ pluginId: manifest.id, tenantId, userId })
    const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
    const responses = [
      await app.request('http://localhost/plugin-bridge/v1/manifest', { headers }),
      await app.request('http://localhost/plugin-bridge/v1/handshake', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          plugin_id: manifest.id,
          host_id: 'teammind',
          host_version: '1.0.0',
          tenant_id: tenantId,
          user_id: userId,
        }),
      }),
    ]
    const health = await (await app.request('http://localhost/plugin-bridge/v1/health')).json()
    for (const response of responses) {
      expect(response.status).toBe(200)
      const body = (await response.json()) as { manifest: PluginManifest }
      const received = validateManifest(body.manifest)
      expect(received.distribution.storage_env).toBe('ETMIND_STORAGE_ROOT')
      expect(computeManifestHash(received)).toBe(health.manifest_hash)
    }
  })

  it('akzeptiert valides Manifest', () => {
    const result = validateManifest(VALID)
    expect(result.id).toBe('test-plugin')
    expect(result.provides.mcp_tools).toEqual(['test.tool'])
  })

  it('akzeptiert Extended-Form mcp_tool object', () => {
    const result = validateManifest({
      ...VALID,
      provides: {
        ...VALID.provides,
        mcp_tools: [
          'test.simple',
          {
            name: 'test.extended',
            description: 'Extended form tool',
            input_schema: { type: 'object', required: ['x'] },
            scopes_required: ['mcp.write.test'],
          },
        ],
      },
    })
    expect(result.provides.mcp_tools).toHaveLength(2)
  })

  it('rejected manifest mit ungültiger plugin-id', () => {
    expect(() => validateManifest({ ...VALID, id: 'Invalid_Id' })).toThrow(ManifestError)
  })

  it('rejected manifest ohne required fields', () => {
    const incomplete = { ...VALID } as { distribution?: unknown }
    delete incomplete.distribution
    expect(() => validateManifest(incomplete)).toThrow(ManifestError)
  })
})

describe('computeManifestHash — stable serialization', () => {
  it('identisches manifest → identischer hash', () => {
    const h1 = computeManifestHash(VALID)
    const h2 = computeManifestHash(VALID)
    expect(h1).toBe(h2)
    expect(h1).toMatch(/^[a-f0-9]{64}$/)
  })

  it('object-key-order-Wechsel → identischer hash (deterministic)', () => {
    const reordered: PluginManifest = {
      version: VALID.version,
      provides: VALID.provides,
      compatibility: VALID.compatibility,
      distribution: VALID.distribution,
      description: VALID.description,
      name: VALID.name,
      id: VALID.id,
    }
    expect(computeManifestHash(VALID)).toBe(computeManifestHash(reordered))
  })

  it('different version → different hash', () => {
    const v2 = { ...VALID, version: '0.2.0' }
    expect(computeManifestHash(VALID)).not.toBe(computeManifestHash(v2))
  })

  it('different mcp_tools-set → different hash', () => {
    const extended = {
      ...VALID,
      provides: { ...VALID.provides, mcp_tools: ['test.tool', 'test.tool2'] },
    }
    expect(computeManifestHash(VALID)).not.toBe(computeManifestHash(extended))
  })
})

describe('requires.scopes — outgoing-grant (RFC requires-scopes, PROPOSED)', () => {
  // Host token-minting fallback under test (locked here even before hosts adopt):
  // grant = manifest.requires?.scopes ?? provides.scopes_required.
  const grantOf = (m: PluginManifest) => m.requires?.scopes ?? m.provides.scopes_required

  it('parses a requires.scopes block', () => {
    const m = validateManifest({
      ...VALID,
      requires: { scopes: ['family.audit.write', 'mcp.read.unifieddb'] },
    })
    expect(m.requires?.scopes).toEqual(['family.audit.write', 'mcp.read.unifieddb'])
  })

  it('requires absent → undefined (host fallback resolves to provides.scopes_required)', () => {
    const m = validateManifest({
      ...VALID,
      provides: { ...VALID.provides, scopes_required: ['legacy.grant'] },
    })
    expect(m.requires).toBeUndefined()
    expect(grantOf(m)).toEqual(['legacy.grant']) // backward-compat: mints as today
  })

  // v0.15.0 — Verhaltensumkehr, mit Absicht. Vorher machte `.default([])` aus
  // `requires: {}` still `{scopes: []}` — also die SCHÄRFSTE Einstellung. Ein
  // Autor, der das Feld halb hinschreibt, hätte damit unbemerkt sämtliche
  // Rückrufe verloren, und zwar erst beim Kunden. Seit myMinds Rückruf-Gate
  // sich aus der An-/Abwesenheit von `requires` ableitet (agent), ist der
  // Unterschied zwischen „nicht deklariert" und „nichts gebraucht" bedeutungs-
  // tragend und darf nicht durch einen Default eingeebnet werden.
  it('requires: {} → Fehler (Auslassung darf nicht wie eine Aussage aussehen)', () => {
    expect(() => validateManifest({ ...VALID, requires: {} } as unknown as PluginManifest)).toThrow(
      /requires\.scopes/,
    )
  })

  it('requires.scopes: [] → gültig, ausdrückliches „ich brauche nichts"', () => {
    const m = validateManifest({ ...VALID, requires: { scopes: [] } })
    expect(m.requires?.scopes).toEqual([])
    expect(grantOf(m)).toEqual([]) // explizit leerer Grant schlägt den Legacy-Floor
  })

  it('migration: floor [] + requires grant decouples incoming from outgoing', () => {
    const m = validateManifest({
      ...VALID,
      provides: { ...VALID.provides, scopes_required: [] }, // incoming floor empty
      requires: { scopes: ['family.audit.write'] }, // outgoing grant
    })
    expect(m.provides.scopes_required).toEqual([]) // enforceScopes floor untouched
    expect(grantOf(m)).toEqual(['family.audit.write']) // token grant separate
  })

  it('requires.scopes participates in the manifest hash', () => {
    const withReq = { ...VALID, requires: { scopes: ['x'] } }
    expect(computeManifestHash(VALID)).not.toBe(computeManifestHash(withReq))
  })
})
