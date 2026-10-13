import { describe, expect, it } from 'vitest'
import { PluginAppHost } from '../dist/client.js'
import { createBridgeApp } from '../../plugin-bridge-foundation/src/server.js'
import { buildTestRegistry } from '../../plugin-bridge-foundation/src/testing/index.js'
import { validateManifest } from '../../plugin-bridge-foundation/src/manifest/index.js'

describe('packaged host against the real Foundation provider', () => {
  it('authenticates resource discovery/read and a tool callback with JWT identity and scopes', async () => {
    const tenantId = '00000000-0000-4000-8000-000000000001'
    const userId = '00000000-0000-4000-8000-000000000002'
    const uri = 'ui://test-plugin/panel'
    const host = await buildTestRegistry({ hostId: 'theseus' })
    const manifest = validateManifest({
      id: 'test-plugin',
      name: { en: 'Test' },
      description: { en: 'Test' },
      version: '1.0.0',
      distribution: { type: 'external-service' },
      compatibility: { apps: ['theseus', 'android', 'ios'], min_app_version: '0.1.0' },
      provides: {
        routes: [],
        module_extensions: [],
        scopes_required: ['mcp.read.test'],
        mcp_tools: [
          {
            name: 'items.panel',
            input_schema: { type: 'object' },
            _meta: { ui: { resourceUri: uri, visibility: ['model', 'app'] } },
          },
        ],
      },
    })
    const app = createBridgeApp({
      manifest,
      registry: host.registry,
      mcpUiResources: [
        {
          resource: { uri, name: 'Panel' },
          scopesRequired: ['mcp.ui.test'],
          read: (ctx) => `<html>${ctx.userId}</html>`,
        },
      ],
      toolHandlers: {
        'items.panel': (_args, ctx) => ({
          content: [{ type: 'text', text: 'Test' }],
          structuredContent: { userId: ctx.userId, tenantId: ctx.tenantId },
        }),
      },
    })
    const token = await host.mintToken({
      pluginId: 'test-plugin',
      aud: 'test-plugin',
      sub: userId,
      userId,
      tenantId,
      scopes: ['mcp.read.test', 'mcp.ui.test'],
    })
    const client = new PluginAppHost({
      pluginId: 'test-plugin',
      endpoint: 'https://fixture.example',
      tokenResolver: () => token,
      isCurrent: () => true,
      fetch: (input, init) => app.fetch(new Request(input, init)) as Promise<Response>,
    })
    expect((await client.discover()).resources).toMatchObject([{ uri }])
    expect((await client.read(uri)).text).toBe(`<html>${userId}</html>`)
    expect((await client.call('items.panel', {})).structuredContent).toEqual({ userId, tenantId })
  })
})
