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

describe('register-host with relay_url (v0.2.0 baseline, v0.7.2 opt-in enforcement)', () => {
  const ENFORCE = ['host_version', 'relay_url']

  it('accepts relay_url + records it as provided optional field', async () => {
    const { registry } = await buildTestRegistry({
      hostId: 'teammind',
      optionalRegisterFields: ENFORCE,
    })
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

  it('with opt-in enforcement: returns missing_optional_fields when omitted', async () => {
    const { registry } = await buildTestRegistry({
      hostId: 'teammind',
      optionalRegisterFields: ENFORCE,
    })
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
    expect(body.host_record_status.missing_optional_fields.sort()).toEqual([
      'host_version',
      'relay_url',
    ])
    expect(body.host_record_status.reregister_recommended).toBe(true)
  })

  it('v0.7.2 DEFAULT (no opt-in): omitted optional fields do NOT trigger reregister (Drift #105 loop-fix)', async () => {
    // The Theseus 119k-loop root-cause: foundation default forced relay_url, so
    // a host that never sent it got reregister_recommended=true on every call.
    // New default = [] → absence of an optional field is no longer a trigger.
    const { registry } = await buildTestRegistry({ hostId: 'teammind' })
    const app = createBridgeApp({ manifest: MANIFEST, registry, toolHandlers: {} })
    const NEW_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAdefaultkeydefaultkeydefaultkeydefaultkeyDEF
-----END PUBLIC KEY-----`
    const res = await app.request('/plugin-bridge/v1/register-host', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host_id: 'minimal', public_key_pem: NEW_KEY }),
    })
    const body = (await res.json()) as {
      host_record_status: { missing_optional_fields: string[]; reregister_recommended: boolean }
    }
    expect(body.host_record_status.missing_optional_fields).toEqual([])
    expect(body.host_record_status.reregister_recommended).toBe(false)
  })
})

describe('handshake host_record_status — v0.7.2 reads actual provided fields, not a hardcode', () => {
  const TENANT = '00000000-0000-0000-0000-000000000001'
  const USER = '00000000-0000-0000-0000-000000000002'

  it('Drift #105: relay_url provided at register → handshake no longer false-flags it missing', async () => {
    // Under opt-in enforcement, the OLD hardcode (`providedOptionalFields=['host_version']`)
    // reported relay_url missing on EVERY handshake regardless of what the host
    // actually registered → endless reregister. The fix tracks per-host fields.
    const handle = await buildTestRegistry({
      hostId: 'teammind',
      optionalRegisterFields: ['host_version', 'relay_url'],
    })
    const app = createBridgeApp({ manifest: MANIFEST, registry: handle.registry, toolHandlers: {} })
    const token = await handle.mintToken({
      pluginId: 'test-plugin',
      tenantId: TENANT,
      userId: USER,
      scopes: [],
    })
    const doHandshake = async () => {
      const res = await app.request('http://localhost/plugin-bridge/v1/handshake', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plugin_id: 'test-plugin',
          host_id: 'teammind',
          host_version: '1.0.0',
          tenant_id: TENANT,
          user_id: USER,
        }),
      })
      expect(res.status).toBe(200)
      return (await res.json()) as {
        host_record_status: { missing_optional_fields: string[]; reregister_recommended: boolean }
      }
    }

    // Bootstrap host registered WITHOUT relay_url → handshake correctly flags it.
    let body = await doHandshake()
    expect(body.host_record_status.missing_optional_fields).toEqual(['relay_url'])
    expect(body.host_record_status.reregister_recommended).toBe(true)

    // Host now supplies relay_url (same key = idempotent, token stays valid).
    await handle.registry.register({
      host_id: 'teammind',
      public_key_pem: handle.publicKeyPem,
      host_version: '1.0.0',
      relay_url: 'ws://127.0.0.1:3300/relay',
    })

    // Handshake now reflects the ACTUAL provided fields → loop ends.
    // (Old hardcode would still report relay_url missing here → infinite loop.)
    body = await doHandshake()
    expect(body.host_record_status.missing_optional_fields).toEqual([])
    expect(body.host_record_status.reregister_recommended).toBe(false)
  })
})
