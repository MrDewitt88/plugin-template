import { describe, expect, it } from 'vitest'
import { ManifestError, validateManifest } from '../src/manifest/loader.js'
import type { PluginManifest } from '../src/types.js'

const BASE: PluginManifest = {
  id: 'test-plugin',
  name: { de: 'Test', en: 'Test' },
  description: { de: 'Test', en: 'Test' },
  version: '0.1.0',
  distribution: {
    type: 'external-service',
    service_endpoint: 'http://127.0.0.1:3600',
  },
  compatibility: { apps: ['teammind'], min_app_version: '0.5.0' },
  provides: { routes: [], mcp_tools: [], module_extensions: [], scopes_required: [] },
}

describe('Drift #203 — service_endpoint validation', () => {
  it("'warn' mode (default) accepts localhost-endpoint with warning", () => {
    const manifest = { ...BASE, distribution: { ...BASE.distribution, service_endpoint: 'http://localhost:3600' } }
    const warnings: string[] = []
    const ok = validateManifest(manifest, { warn: (m) => warnings.push(m) })
    expect(ok).toBeDefined()
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain("'localhost'")
    expect(warnings[0]).toContain('Drift #203')
  })

  it("'strict' mode rejects localhost-endpoint with ManifestError code drift_203", () => {
    const manifest = { ...BASE, distribution: { ...BASE.distribution, service_endpoint: 'http://localhost:3600' } }
    expect(() => validateManifest(manifest, { drift203: 'strict' })).toThrow(ManifestError)
    try {
      validateManifest(manifest, { drift203: 'strict' })
    } catch (err) {
      expect((err as ManifestError).code).toBe('drift_203')
    }
  })

  it("'off' mode bypasses the check entirely", () => {
    const manifest = { ...BASE, distribution: { ...BASE.distribution, service_endpoint: 'http://localhost:3600' } }
    const warnings: string[] = []
    const ok = validateManifest(manifest, { drift203: 'off', warn: (m) => warnings.push(m) })
    expect(ok).toBeDefined()
    expect(warnings).toHaveLength(0)
  })

  it('accepts 127.0.0.1-endpoint without warning', () => {
    const warnings: string[] = []
    validateManifest(BASE, { warn: (m) => warnings.push(m) })
    expect(warnings).toHaveLength(0)
  })

  it('https://localhost also flagged', () => {
    const manifest = {
      ...BASE,
      distribution: { ...BASE.distribution, service_endpoint: 'https://localhost:8443' },
    }
    expect(() => validateManifest(manifest, { drift203: 'strict' })).toThrow(/localhost/)
  })

  it('localhost as substring of another hostname is NOT flagged', () => {
    const manifest = {
      ...BASE,
      distribution: { ...BASE.distribution, service_endpoint: 'http://localhost.example.com:3600' },
    }
    const warnings: string[] = []
    validateManifest(manifest, { warn: (m) => warnings.push(m) })
    expect(warnings).toHaveLength(0)
  })

  it('IPv6-loopback [::1] is flagged (v0.2.1 — plug-elec cross-repo)', () => {
    const manifest = {
      ...BASE,
      distribution: { ...BASE.distribution, service_endpoint: 'http://[::1]:3600' },
    }
    const warnings: string[] = []
    validateManifest(manifest, { warn: (m) => warnings.push(m) })
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('[::1]')
    expect(warnings[0]).toContain('Drift #203')
  })

  it('IPv6-loopback in strict mode throws drift_203', () => {
    const manifest = {
      ...BASE,
      distribution: { ...BASE.distribution, service_endpoint: 'https://[::1]:8443' },
    }
    expect(() => validateManifest(manifest, { drift203: 'strict' })).toThrow(ManifestError)
  })

  it('non-loopback IPv6 (e.g. [::ffff:c000:0280]) is NOT flagged', () => {
    const manifest = {
      ...BASE,
      distribution: { ...BASE.distribution, service_endpoint: 'http://[2001:db8::1]:3600' },
    }
    const warnings: string[] = []
    validateManifest(manifest, { warn: (m) => warnings.push(m) })
    expect(warnings).toHaveLength(0)
  })
})
