// Execute the generated bridge, not just assertions on template strings.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { discoverManifest } from '../../../packages/plugin-bridge-foundation/src/manifest/index.js'
import { buildTestRegistry } from '../../../packages/plugin-bridge-foundation/src/testing/index.js'
import { scaffold } from '../src/scaffolders/scaffold.js'
import type { Hono } from 'hono'

const ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const TENANT = '00000000-0000-4000-8000-000000000001'
const USER = '00000000-0000-4000-8000-000000000002'
let target: string

beforeEach(() => {
  target = mkdtempSync(join(tmpdir(), 'generated-bridge-'))
  scaffold({
    pluginName: 'test-plugin',
    hosts: ['teammind', 'theseus', 'familymind'],
    features: ['bridge'],
    target,
    force: true,
  })
  const entry = join(target, 'packages/test-plugin-bridge/src/index.ts')
  // Resolve only dependencies to this checkout. The generated application and
  // its copied health wrapper execute unchanged; no registry/network required.
  writeFileSync(
    entry,
    readFileSync(entry, 'utf8')
      .replace(
        "from '@nexus-mindgarden/plugin-bridge-foundation'",
        `from '${pathToFileURL(join(ROOT, 'packages/plugin-bridge-foundation/src/index.ts')).href}'`,
      )
      .replace(
        "from 'hono'",
        `from '${pathToFileURL(join(ROOT, 'packages/plugin-bridge-foundation/node_modules/hono/dist/index.js')).href}'`,
      ),
  )
})

afterEach(() => rmSync(target, { recursive: true, force: true }))

async function createApp(): Promise<Hono> {
  const entry = pathToFileURL(join(target, 'packages/test-plugin-bridge/src/index.ts')).href
  const mod = (await import(/* @vite-ignore */ entry)) as {
    createApp: (dir: string) => Promise<Hono>
  }
  return mod.createApp(target)
}

async function activate(app: Hono) {
  const h = await buildTestRegistry({ hostId: 'theseus' })
  const response = await app.request('/plugin-bridge/v1/register-host', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ host_id: 'theseus', public_key_pem: h.publicKeyPem }),
  })
  expect(response.status).toBe(200)
  return (scopes: string[] = [], pluginId = 'test-plugin') =>
    h.mintToken({
      pluginId,
      tenantId: TENANT,
      userId: USER,
      sub: USER,
      aud: pluginId,
      scopes,
      omitClaims: ['plugin_id', 'user_id'],
    })
}

async function call(app: Hono, token: string, name: string, args: Record<string, unknown> = {}) {
  return app.request('/plugin-bridge/v1/execute-tool', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ tool_name: name, arguments: args, tenant_id: TENANT, user_id: USER }),
  })
}

describe('generated bridge', () => {
  it('serves every declared tool and rejects the obsolete example name', async () => {
    const app = await createApp()
    const mint = await activate(app)
    const token = await mint()
    const { manifest } = await discoverManifest(target)
    for (const tool of manifest.provides.mcp_tools) {
      const name = typeof tool === 'string' ? tool : tool.name
      const response = await call(app, token, name, { id: 'missing' })
      expect(response.status, name).toBe(200)
      expect(await response.json(), name).toMatchObject({ ok: true })
    }
    expect(await (await call(app, token, 'documents.list')).json()).toMatchObject({
      ok: false,
      error: { code: 'tool_not_found' },
    })
    expect(await (await call(app, token, 'items.get')).json()).toMatchObject({
      ok: false,
      error: { code: 'invalid_arguments' },
    })
  })

  it('enforces both the plugin floor and per-tool scopes', async () => {
    const path = join(target, 'manifest.test-plugin.yaml')
    writeFileSync(
      path,
      readFileSync(path, 'utf8')
        .replace(/^  scopes_required: \[\]$/m, '  scopes_required: [mcp.read.test-plugin]')
        .replace('      scopes_required: []', '      scopes_required: [mcp.list.test-plugin]'),
    )
    const app = await createApp()
    const mint = await activate(app)
    for (const scopes of [[], ['mcp.read.test-plugin'], ['mcp.list.test-plugin']]) {
      const response = await call(app, await mint(scopes), 'items.list')
      expect(response.status).toBe(403)
      expect(await response.json()).toMatchObject({
        ok: false,
        error: { code: 'insufficient_scope' },
      })
    }
    const allowed = await call(
      app,
      await mint(['mcp.read.test-plugin', 'mcp.list.test-plugin']),
      'items.list',
    )
    expect(allowed.status).toBe(200)
    expect(await allowed.json()).toMatchObject({ ok: true, result: { items: [] } })
  })

  it('keeps readiness public even with an untrusted bearer and protects tools', async () => {
    const app = await createApp()
    for (const method of ['GET', 'HEAD']) {
      for (const authorization of ['', 'Bearer e30.eyJhdWQiOiJvdGhlci1wbHVnaW4ifQ.invalid']) {
        const response = await app.request('/plugin-bridge/v1/health?probe=1', {
          method,
          headers: { authorization },
        })
        expect(response.status).toBe(200)
        if (method === 'GET')
          expect(await response.json()).toMatchObject({
            status: 'ok',
            version: '0.1.0',
            manifest_hash: expect.any(String),
          })
        else expect(await response.text()).toBe('')
      }
    }
    expect((await app.request('/plugin-bridge/v1/manifest')).status).toBe(401)
    expect((await call(app, '', 'items.list')).status).toBe(401)
    const mint = await activate(app)
    expect((await call(app, await mint([], 'other-plugin'), 'items.list')).status).toBe(401)
  })
})
