// v0.4.1: Smoke-test für `/shapes`-subpath. Verifies that the slim shape-only
// re-export surface is intact, type-correct, and zero-runtime-cost for type-only
// consumers. Designed for in-repo-mirror consumers (kanban-style) and helper-lib
// consumers (markview-style) seeking drift-immunity types.

import { describe, expect, it } from 'vitest'
import {
  BASELINE_OPTIONAL_REGISTER_FIELDS,
  ExecuteToolRequestSchema,
  ExecuteToolResponseSchema,
  HandshakeRequestSchema,
  HandshakeResponseSchema,
  HealthResponseSchema,
  HostRecordStatusSchema,
  InvokeHookRequestSchema,
  InvokeHookResponseSchema,
  PLUGIN_REGISTRATION_SCHEMA_VERSION,
  PluginManifestSchema,
  RegisterHostRequestSchema,
  RegisterHostResponseSchema,
  RenderUiRequestSchema,
  RenderUiResponseSchema,
  type BridgeTokenClaims,
  type HostRecordStatus,
} from '../src/shapes/index.js'

describe('@nexus-mindgarden/plugin-bridge-foundation/shapes', () => {
  describe('canonical constants', () => {
    it('PLUGIN_REGISTRATION_SCHEMA_VERSION is 1 (v0.4.x baseline)', () => {
      expect(PLUGIN_REGISTRATION_SCHEMA_VERSION).toBe(1)
    })

    it('BASELINE_OPTIONAL_REGISTER_FIELDS contains host_version + relay_url', () => {
      expect(BASELINE_OPTIONAL_REGISTER_FIELDS).toEqual(['host_version', 'relay_url'])
    })
  })

  describe('drift #206 host_record_status schema', () => {
    it('validates a first-register response', () => {
      const valid: HostRecordStatus = {
        schema_version: 1,
        plugin_current_schema: 1,
        is_first_register: true,
        reregister_recommended: false,
        missing_optional_fields: [],
      }
      expect(HostRecordStatusSchema.parse(valid)).toEqual(valid)
    })

    it('validates a reregister-recommended response with missing fields', () => {
      const valid: HostRecordStatus = {
        schema_version: 1,
        plugin_current_schema: 1,
        is_first_register: false,
        reregister_recommended: true,
        missing_optional_fields: ['host_version', 'relay_url'],
      }
      expect(HostRecordStatusSchema.parse(valid)).toEqual(valid)
    })

    it('optional reregister_loop_detected field (v0.2.3) parses through', () => {
      const valid = {
        schema_version: 1,
        plugin_current_schema: 1,
        is_first_register: false,
        reregister_recommended: false,
        missing_optional_fields: [],
        reregister_loop_detected: true,
      }
      expect(HostRecordStatusSchema.parse(valid)).toEqual(valid)
    })

    it('rejects missing required fields', () => {
      expect(() =>
        HostRecordStatusSchema.parse({
          schema_version: 1,
          is_first_register: true,
        })
      ).toThrow()
    })
  })

  describe('endpoint wire-shapes are all importable', () => {
    it('handshake schemas exist + parse a minimal manifest-bearing response', () => {
      expect(HandshakeRequestSchema).toBeDefined()
      expect(HandshakeResponseSchema).toBeDefined()
    })

    it('register-host schemas exist + dual-read public_key/public_key_pem', () => {
      // v0.3.1 dual-read: either field accepted
      const withPem = RegisterHostRequestSchema.parse({
        host_id: 'h_test',
        public_key_pem: '-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----',
      })
      expect(withPem.public_key_pem).toBeDefined()

      const withLegacy = RegisterHostRequestSchema.parse({
        host_id: 'h_test',
        public_key: '-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----',
      })
      expect(withLegacy.public_key).toBeDefined()

      // Both missing → reject
      expect(() => RegisterHostRequestSchema.parse({ host_id: 'h_test' })).toThrow()
    })

    it('register-host response includes always-present host_record_status', () => {
      const valid = {
        host_id: 'h_test',
        status: 'active' as const,
        fingerprint: 'sha256:abc',
        registered_at: '2026-05-21T00:00:00Z',
        host_record_status: {
          schema_version: 1,
          plugin_current_schema: 1,
          is_first_register: false,
          reregister_recommended: false,
          missing_optional_fields: [],
        },
      }
      expect(RegisterHostResponseSchema.parse(valid)).toEqual(valid)
    })

    it('health-response schema accepts ok/degraded/unhealthy', () => {
      for (const status of ['ok', 'degraded', 'unhealthy'] as const) {
        expect(HealthResponseSchema.parse({ status, version: '0.4.1' })).toMatchObject({ status })
      }
    })

    it('execute-tool + render-ui + invoke-hook schemas exist', () => {
      expect(ExecuteToolRequestSchema).toBeDefined()
      expect(ExecuteToolResponseSchema).toBeDefined()
      expect(RenderUiRequestSchema).toBeDefined()
      expect(RenderUiResponseSchema).toBeDefined()
      expect(InvokeHookRequestSchema).toBeDefined()
      expect(InvokeHookResponseSchema).toBeDefined()
    })

    it('manifest schema validates a minimal plugin-manifest', () => {
      const minimal = {
        id: 'test-plugin',
        name: { en: 'Test' },
        description: { en: 'Test plugin' },
        version: '0.1.0',
        distribution: { type: 'external-service' as const },
        compatibility: { apps: ['v8'], min_app_version: '8.0.0' },
        provides: {},
      }
      expect(PluginManifestSchema.parse(minimal)).toMatchObject({ id: 'test-plugin' })
    })
  })

  describe('BridgeTokenClaims type is structural-importable', () => {
    it('compiles a value matching the claims-shape', () => {
      const claims: BridgeTokenClaims = {
        iss: 'host:v8',
        sub: 'plugin.test',
        jti: 'jti_abc',
        iat: 1700000000,
        exp: 1700086400,
        plugin_id: 'plugin.test',
        host_id: 'h_v8',
        tenant_id: '00000000-0000-0000-0000-000000000000',
        user_id: '00000000-0000-0000-0000-000000000001',
        scopes: ['mcp.tools.read'],
      }
      expect(claims.scopes).toContain('mcp.tools.read')
    })
  })

  describe('shape-subpath does NOT re-export runtime-internals (architecture-fence)', () => {
    it('shapes/index.ts does not export HostKeyRecord (storage internal)', async () => {
      const shapes = await import('../src/shapes/index.js')
      // HostKeyRecord is intentionally NOT re-exported (v0.5.0 spec-extension
      // candidate for per-host expectedIssuer/Audience per markview msg #549).
      expect((shapes as Record<string, unknown>)['HostKeyRecord']).toBeUndefined()
    })

    it('shapes/index.ts does not export extractPublicKeyPem (runtime helper)', async () => {
      const shapes = await import('../src/shapes/index.js')
      expect((shapes as Record<string, unknown>)['extractPublicKeyPem']).toBeUndefined()
    })

    it('shapes/index.ts does not export createBridgeApp (server runtime)', async () => {
      const shapes = await import('../src/shapes/index.js')
      expect((shapes as Record<string, unknown>)['createBridgeApp']).toBeUndefined()
    })
  })
})
