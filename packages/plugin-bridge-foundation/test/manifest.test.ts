import { describe, expect, it } from 'vitest'
import { computeManifestHash } from '../src/manifest/hash.js'
import { ManifestError, validateManifest } from '../src/manifest/loader.js'
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
