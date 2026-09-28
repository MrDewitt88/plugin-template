import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createBridgeApp } from '../src/server.js'
import { buildTestRegistry } from '../src/testing/index.js'
import {
  ExecuteToolResponseSchema,
  McpCallToolResultSchema,
  PluginMcpToolEntrySchema,
  type PluginManifest,
} from '../src/types.js'
import { validateManifest } from '../src/manifest/loader.js'

const fixture = JSON.parse(
  readFileSync(new URL('../../../fixtures/context-tool-contract-v1.json', import.meta.url), 'utf8'),
) as Record<string, unknown>

const TENANT = '00000000-0000-0000-0000-000000000001'
const USER = '00000000-0000-0000-0000-000000000002'

function manifest(): PluginManifest {
  return validateManifest({
    id: 'example-plugin',
    name: { en: 'Example' },
    description: { en: 'Example' },
    version: '0.1.0',
    distribution: { type: 'external-service' },
    compatibility: { apps: ['theseus'], min_app_version: '0.1.0' },
    provides: {
      routes: [],
      mcp_tools: [fixture.app_only_tool],
      module_extensions: [],
      scopes_required: [],
    },
  })
}

describe('shared context/tool contract fixture', () => {
  it('preserves MCP Apps metadata and unrelated extensions across manifest validation', () => {
    const tool = PluginMcpToolEntrySchema.parse(fixture.app_only_tool)
    expect(tool).toEqual(fixture.app_only_tool)
    const parsed = manifest()
    expect(parsed.provides.mcp_tools[0]).toEqual(fixture.app_only_tool)
    expect(validateManifest(parsed)).toEqual(parsed)
  })

  it('rejects malformed UI metadata without changing legacy tool entries', () => {
    const tool = fixture.app_only_tool as Record<string, unknown>
    expect(PluginMcpToolEntrySchema.parse('items.list')).toBe('items.list')
    expect(
      PluginMcpToolEntrySchema.safeParse({
        ...tool,
        _meta: { ui: { resourceUri: 'http://wrong' } },
      }).success,
    ).toBe(false)
    expect(
      PluginMcpToolEntrySchema.safeParse({ ...tool, _meta: { ui: { visibility: ['system'] } } })
        .success,
    ).toBe(false)
  })

  it('preserves model text, structured UI data and result metadata through the authenticated bridge', async () => {
    const expected = ExecuteToolResponseSchema.parse(fixture.bridge_tool_response)
    expect(McpCallToolResultSchema.parse(expected.ok ? expected.result : null)).toEqual(
      (fixture.bridge_tool_response as { result: unknown }).result,
    )

    const registry = await buildTestRegistry({ hostId: 'theseus' })
    const app = createBridgeApp({
      manifest: manifest(),
      registry: registry.registry,
      enforceScopes: true,
      toolHandlers: {
        'items.refresh': async () => (fixture.bridge_tool_response as { result: unknown }).result,
      },
    })
    const token = await registry.mintToken({
      pluginId: 'example-plugin',
      tenantId: TENANT,
      userId: USER,
      scopes: ['mcp.read.example-plugin'],
    })
    const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
    const manifestResponse = await app.request('http://localhost/plugin-bridge/v1/manifest', {
      headers,
    })
    expect(manifestResponse.status).toBe(200)
    expect(
      ((await manifestResponse.json()) as { manifest: PluginManifest }).manifest.provides
        .mcp_tools[0],
    ).toEqual(fixture.app_only_tool)

    const response = await app.request('http://localhost/plugin-bridge/v1/execute-tool', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        tool_name: 'items.refresh',
        arguments: { id: 'doc-42' },
        tenant_id: TENANT,
        user_id: USER,
      }),
    })
    expect(response.status).toBe(200)
    expect(ExecuteToolResponseSchema.parse(await response.json())).toEqual(
      fixture.bridge_tool_response,
    )
  })
})
