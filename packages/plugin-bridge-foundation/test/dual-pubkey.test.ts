// v0.3.1 — Drift-resolution: register-host accepts BOTH `public_key` (V8/Theseus/MarkView
// canonical) and `public_key_pem` (plug-tmpl-Foundation canonical). Prefer `public_key_pem`
// when both present.
//
// Source: V8 msg #483, markview msg #485, V8 commit `7f1badc` dual-emit.

import { describe, expect, it } from 'vitest'
import { createBridgeApp } from '../src/server.js'
import { buildTestRegistry } from '../src/testing/index.js'
import {
  extractPublicKeyPem,
  RegisterHostRequestSchema,
  type PluginManifest,
} from '../src/types.js'

const MANIFEST: PluginManifest = {
  id: 'test-plugin',
  name: { de: 'T', en: 'T' },
  description: { de: 'T', en: 'T' },
  version: '0.0.1',
  distribution: { type: 'external-service', service_endpoint: 'http://127.0.0.1:3600' },
  compatibility: { apps: ['teammind'], min_app_version: '0.5.0' },
  provides: { routes: [], mcp_tools: [], module_extensions: [], scopes_required: [] },
}

const PEM_A = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAfakekeyAfakekeyAfakekeyAfakekeyAfakekeyA
-----END PUBLIC KEY-----`

const PEM_B = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAdifferentkeydifferentkeydifferentkeyDIFF
-----END PUBLIC KEY-----`

describe('RegisterHostRequestSchema — dual-pubkey acceptance (v0.3.1)', () => {
  it('accepts public_key_pem (Foundation canonical)', () => {
    const result = RegisterHostRequestSchema.safeParse({
      host_id: 'teammind',
      public_key_pem: PEM_A,
    })
    expect(result.success).toBe(true)
  })

  it('accepts public_key (V8/Theseus/MarkView canonical)', () => {
    const result = RegisterHostRequestSchema.safeParse({
      host_id: 'teammind',
      public_key: PEM_A,
    })
    expect(result.success).toBe(true)
  })

  it('accepts both fields (V8 dual-emit pattern)', () => {
    const result = RegisterHostRequestSchema.safeParse({
      host_id: 'teammind',
      public_key: PEM_A,
      public_key_pem: PEM_A,
    })
    expect(result.success).toBe(true)
  })

  it('rejects when neither field present', () => {
    const result = RegisterHostRequestSchema.safeParse({ host_id: 'teammind' })
    expect(result.success).toBe(false)
  })
})

describe('extractPublicKeyPem helper', () => {
  it('returns public_key_pem when only it is set', () => {
    expect(extractPublicKeyPem({ host_id: 'h', public_key_pem: PEM_A })).toBe(PEM_A)
  })

  it('returns public_key when only it is set (legacy fallback)', () => {
    expect(extractPublicKeyPem({ host_id: 'h', public_key: PEM_A })).toBe(PEM_A)
  })

  it('prefers public_key_pem when BOTH are set (canonical-target wins)', () => {
    expect(extractPublicKeyPem({ host_id: 'h', public_key: PEM_A, public_key_pem: PEM_B })).toBe(
      PEM_B,
    )
  })
})

describe('register-host endpoint — V8 dual-emit interop', () => {
  it('handles V8-canonical body with only public_key', async () => {
    const { registry } = await buildTestRegistry({ hostId: 'teammind' })
    const app = createBridgeApp({ manifest: MANIFEST, registry, toolHandlers: {} })

    const res = await app.request('/plugin-bridge/v1/register-host', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        host_id: 'v8-style-host',
        public_key: PEM_A, // ← V8 legacy field-name only
      }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { fingerprint: string; status: string }
    expect(body.fingerprint).toBeTruthy()
    expect(['pending', 'active']).toContain(body.status)
  })

  it('handles Foundation-canonical body with only public_key_pem', async () => {
    const { registry } = await buildTestRegistry({ hostId: 'teammind' })
    const app = createBridgeApp({ manifest: MANIFEST, registry, toolHandlers: {} })

    const res = await app.request('/plugin-bridge/v1/register-host', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        host_id: 'foundation-style-host',
        public_key_pem: PEM_A,
      }),
    })
    expect(res.status).toBe(200)
  })

  it('handles V8 dual-emit body (both fields)', async () => {
    const { registry } = await buildTestRegistry({ hostId: 'teammind' })
    const app = createBridgeApp({ manifest: MANIFEST, registry, toolHandlers: {} })

    const res = await app.request('/plugin-bridge/v1/register-host', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        host_id: 'dual-emit-host',
        public_key: PEM_A, // legacy
        public_key_pem: PEM_A, // canonical (matches)
      }),
    })
    expect(res.status).toBe(200)
  })

  it('returns 400 when neither field present', async () => {
    const { registry } = await buildTestRegistry({ hostId: 'teammind' })
    const app = createBridgeApp({ manifest: MANIFEST, registry, toolHandlers: {} })

    const res = await app.request('/plugin-bridge/v1/register-host', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host_id: 'no-key-host' }),
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: { code: string; message: string } }
    expect(body.error.code).toBe('invalid_request')
  })
})
