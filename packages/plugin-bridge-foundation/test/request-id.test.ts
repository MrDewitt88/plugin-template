import { describe, expect, it } from 'vitest'
import { createBridgeApp } from '../src/server.js'
import { Logger, MetricsRegistry } from '../src/observability/index.js'
import { buildTestRegistry } from '../src/testing/index.js'
import type { PluginManifest } from '../src/types.js'

const MANIFEST: PluginManifest = {
  id: 'test-plugin',
  name: { de: 'T', en: 'T' },
  description: { de: 'T', en: 'T' },
  version: '0.1.0',
  distribution: { type: 'external-service', service_endpoint: 'http://127.0.0.1:3600' },
  compatibility: { apps: ['teammind'], min_app_version: '0.5.0' },
  provides: { routes: [], mcp_tools: [], module_extensions: [], scopes_required: [] },
}

class StringSink {
  data = ''
  write(s: string) {
    this.data += s
  }
}

describe('X-Request-Id middleware (v0.2.2 distributed-tracing)', () => {
  it('generates UUIDv4 if no incoming X-Request-Id', async () => {
    const { registry } = await buildTestRegistry({ hostId: 'teammind' })
    const app = createBridgeApp({ manifest: MANIFEST, registry, toolHandlers: {} })

    const res = await app.request('/plugin-bridge/v1/register-host', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        host_id: 'someone',
        public_key_pem: '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAfakekeyfakekeyfakekeyfakekeyfakekeyfakekey\n-----END PUBLIC KEY-----',
      }),
    })
    const echoed = res.headers.get('x-request-id')
    expect(echoed).toBeTruthy()
    // UUIDv4-shaped: 8-4-4-4-12 hex
    expect(echoed).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
  })

  it('propagates incoming X-Request-Id verbatim', async () => {
    const { registry } = await buildTestRegistry({ hostId: 'teammind' })
    const app = createBridgeApp({ manifest: MANIFEST, registry, toolHandlers: {} })

    const expected = 'caller-supplied-trace-id-12345'
    const res = await app.request('/plugin-bridge/v1/register-host', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Request-Id': expected,
      },
      body: JSON.stringify({
        host_id: 'someone',
        public_key_pem: '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n-----END PUBLIC KEY-----',
      }),
    })
    expect(res.headers.get('x-request-id')).toBe(expected)
  })

  it('accepts case-insensitive incoming header (x-request-id lowercase)', async () => {
    const { registry } = await buildTestRegistry({ hostId: 'teammind' })
    const app = createBridgeApp({ manifest: MANIFEST, registry, toolHandlers: {} })

    const res = await app.request('/plugin-bridge/v1/register-host', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-request-id': 'lowercase-trace-id',
      },
      body: JSON.stringify({
        host_id: 'someone',
        public_key_pem: '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\n-----END PUBLIC KEY-----',
      }),
    })
    expect(res.headers.get('x-request-id')).toBe('lowercase-trace-id')
  })

  it('access-log includes request_id when logger provided', async () => {
    const { registry } = await buildTestRegistry({ hostId: 'teammind' })
    const stdout = new StringSink()
    const stderr = new StringSink()
    const logger = new Logger({ service: 'test-bridge', stdout, stderr })
    const metrics = new MetricsRegistry()

    const app = createBridgeApp({
      manifest: MANIFEST,
      registry,
      toolHandlers: {},
      observability: { logger, registry: metrics },
    })

    await app.request('/plugin-bridge/v1/register-host', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Request-Id': 'log-trace-id' },
      body: JSON.stringify({
        host_id: 'someone',
        public_key_pem: '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAcccccccccccccccccccccccccccccccccccccccccc\n-----END PUBLIC KEY-----',
      }),
    })

    expect(stdout.data).toContain('"request_id":"log-trace-id"')
    expect(stdout.data).toContain('"msg":"http_request"')
  })

  it('different requests get different generated request-ids', async () => {
    const { registry } = await buildTestRegistry({ hostId: 'teammind' })
    const app = createBridgeApp({ manifest: MANIFEST, registry, toolHandlers: {} })

    const res1 = await app.request('/plugin-bridge/v1/register-host', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        host_id: 'a',
        public_key_pem: '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAddddddddddddddddddddddddddddddddddddddddddd\n-----END PUBLIC KEY-----',
      }),
    })
    const res2 = await app.request('/plugin-bridge/v1/register-host', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        host_id: 'b',
        public_key_pem: '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee\n-----END PUBLIC KEY-----',
      }),
    })
    const id1 = res1.headers.get('x-request-id')
    const id2 = res2.headers.get('x-request-id')
    expect(id1).toBeTruthy()
    expect(id2).toBeTruthy()
    expect(id1).not.toBe(id2)
  })

  it('CORS exposeHeaders includes X-Request-Id (for cross-origin clients)', async () => {
    const { registry } = await buildTestRegistry({ hostId: 'teammind' })
    const app = createBridgeApp({ manifest: MANIFEST, registry, toolHandlers: {} })

    // CORS preflight
    const preflight = await app.request('/plugin-bridge/v1/register-host', {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://example.com',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'X-Request-Id',
      },
    })
    const allowedHeaders = preflight.headers.get('access-control-allow-headers') || ''
    expect(allowedHeaders.toLowerCase()).toContain('x-request-id')
  })
})
