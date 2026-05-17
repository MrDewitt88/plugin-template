import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createBridgeApp } from '../src/server.js'
import { MetricsRegistry } from '../src/observability/index.js'
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

describe('createBridgeApp — Observability integration', () => {
  it('does NOT mount /metrics when observability undefined (backward-compat)', async () => {
    const { registry } = await buildTestRegistry({ hostId: 'teammind' })
    const app = createBridgeApp({ manifest: MANIFEST, registry, toolHandlers: {} })
    const res = await app.request('/metrics')
    expect(res.status).toBe(404)
  })

  it('mounts /metrics + counts HTTP requests when observability.registry provided', async () => {
    const { registry } = await buildTestRegistry({ hostId: 'teammind' })
    const metrics = new MetricsRegistry()
    const app = createBridgeApp({
      manifest: MANIFEST,
      registry,
      toolHandlers: {},
      observability: { registry: metrics },
    })
    // Scrape baseline
    let res = await app.request('/metrics')
    expect(res.status).toBe(200)
    const ct = res.headers.get('content-type')
    expect(ct).toContain('text/plain')
    expect(ct).toContain('version=0.0.4')
    const text = await res.text()
    expect(text).toContain('# TYPE plugin_bridge_http_requests_total counter')
    expect(text).toContain('# TYPE plugin_bridge_uptime_seconds gauge')
    expect(text).toContain('# TYPE plugin_bridge_host_registry_size gauge')

    // Hit an endpoint and verify counter increments
    await app.request('/metrics') // increments itself
    res = await app.request('/metrics')
    const text2 = await res.text()
    // We should now have at least 1 sample for /metrics
    expect(text2).toMatch(/plugin_bridge_http_requests_total\{[^}]*path="\/metrics"[^}]*\} [1-9]/)
  })

  it('host_registry_size reflects current registry state', async () => {
    const { registry } = await buildTestRegistry({ hostId: 'teammind' })
    const metrics = new MetricsRegistry()
    const app = createBridgeApp({
      manifest: MANIFEST,
      registry,
      toolHandlers: {},
      observability: { registry: metrics },
    })
    const res = await app.request('/metrics')
    const text = await res.text()
    expect(text).toMatch(/plugin_bridge_host_registry_size 1/)
  })
})

describe('createBridgeApp — staticUi integration', () => {
  let dir: string
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'plug-tmpl-staticui-'))
    await writeFile(join(dir, 'app.js'), 'export const x = 1', 'utf-8')
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('serves files at default /static/ui when staticUi opts provided', async () => {
    const { registry } = await buildTestRegistry({ hostId: 'teammind' })
    const app = createBridgeApp({
      manifest: MANIFEST,
      registry,
      toolHandlers: {},
      staticUi: { staticDir: dir },
    })
    const res = await app.request('/static/ui/app.js')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('export const x = 1')
  })

  it('returns 404 with Drift #103 shape for missing file', async () => {
    const { registry } = await buildTestRegistry({ hostId: 'teammind' })
    const app = createBridgeApp({
      manifest: MANIFEST,
      registry,
      toolHandlers: {},
      staticUi: { staticDir: dir },
    })
    const res = await app.request('/static/ui/missing.js')
    expect(res.status).toBe(404)
    expect(await res.json()).toMatchObject({ error: { code: 'not_found' } })
  })
})

describe('register-host with relay_url (v0.2.0 baseline)', () => {
  it('accepts relay_url + records it as provided optional field', async () => {
    const { registry } = await buildTestRegistry({ hostId: 'teammind' })
    const app = createBridgeApp({ manifest: MANIFEST, registry, toolHandlers: {} })

    const NEW_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAnewkeynewkeynewkeynewkeynewkeynewkeynewkey0
-----END PUBLIC KEY-----`
    const res = await app.request('/plugin-bridge/v1/register-host', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        host_id: 'markview',
        public_key_pem: NEW_KEY,
        host_version: '0.1.3',
        relay_url: 'ws://127.0.0.1:3300/relay',
      }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      host_record_status: { missing_optional_fields: string[]; reregister_recommended: boolean }
    }
    expect(body.host_record_status.missing_optional_fields).toEqual([])
    expect(body.host_record_status.reregister_recommended).toBe(false)
  })

  it('returns missing_optional_fields with relay_url + host_version when omitted', async () => {
    const { registry } = await buildTestRegistry({ hostId: 'teammind' })
    const app = createBridgeApp({ manifest: MANIFEST, registry, toolHandlers: {} })
    const NEW_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAanotherkeyanotherkeyanotherkeyanotherkeyANO
-----END PUBLIC KEY-----`
    const res = await app.request('/plugin-bridge/v1/register-host', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host_id: 'minimal', public_key_pem: NEW_KEY }),
    })
    const body = (await res.json()) as {
      host_record_status: { missing_optional_fields: string[]; reregister_recommended: boolean }
    }
    expect(body.host_record_status.missing_optional_fields.sort()).toEqual(['host_version', 'relay_url'])
    expect(body.host_record_status.reregister_recommended).toBe(true)
  })
})
