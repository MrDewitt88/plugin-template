import { describe, expect, it, vi } from 'vitest'
import { createBridgeApp } from '../src/server.js'
import { buildTestRegistry } from '../src/testing/index.js'
import { validateManifest } from '../src/manifest/index.js'
import {
  createMcpUiResourceClient,
  MCP_UI_HTML_MAX_BYTES,
  MCP_UI_LIST_PATH,
  MCP_UI_READ_PATH,
  MCP_UI_MIME_TYPE,
  HandshakeResponseSchema,
  ReadMcpUiResourceResponseSchema,
  type McpUiResourceDefinition,
  type BridgeAuthContext,
} from '../src/index.js'

const TENANT = '00000000-0000-4000-8000-000000000001'
const USER = '00000000-0000-4000-8000-000000000002'
const URI = 'ui://test-plugin/panel'
const POLICY = { ui: { csp: { resourceDomains: [], connectDomains: [] }, prefersBorder: true } }
const manifest = () =>
  validateManifest({
    id: 'test-plugin',
    name: { en: 'Test' },
    description: { en: 'Test' },
    version: '0.1.0',
    distribution: { type: 'external-service' },
    compatibility: { apps: ['theseus'], min_app_version: '0.1.0' },
    provides: {
      routes: [],
      module_extensions: [],
      scopes_required: ['mcp.read.test'],
      mcp_tools: [
        {
          name: 'items.panel',
          input_schema: { type: 'object' },
          _meta: { ui: { resourceUri: URI } },
        },
      ],
    },
  })

async function setup(
  read = vi.fn(async (_ctx: BridgeAuthContext) => '<html>Panel</html>'),
  definitions?: McpUiResourceDefinition[],
) {
  const host = await buildTestRegistry({ hostId: 'theseus' })
  const app = createBridgeApp({
    manifest: manifest(),
    registry: host.registry,
    toolHandlers: {},
    // The new resource boundary must remain enforced with legacy tools opted out.
    enforceScopes: false,
    mcpUiResources: definitions ?? [
      {
        resource: { uri: URI, name: 'panel', _meta: POLICY },
        scopesRequired: ['mcp.ui.test'],
        read,
      },
    ],
  })
  const mint = (scopes = ['mcp.read.test', 'mcp.ui.test'], extra = {}) =>
    host.mintToken({
      pluginId: 'test-plugin',
      tenantId: TENANT,
      userId: USER,
      aud: 'test-plugin',
      sub: USER,
      scopes,
      ...extra,
    })
  const post = async (path: string, body: unknown, token?: string) =>
    app.request(path, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token ?? (await mint())}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    })
  return { app, read, mint, post, host }
}

describe('MCP UI resource bridge', () => {
  it('discovers and reads the same fixed resource with resource-level policy', async () => {
    const f = await setup()
    const list = await f.post(MCP_UI_LIST_PATH, {})
    expect(await list.json()).toEqual({
      resources: [{ uri: URI, name: 'panel', mimeType: MCP_UI_MIME_TYPE, _meta: POLICY }],
    })
    const response = await f.post(MCP_UI_READ_PATH, { uri: URI })
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(ReadMcpUiResourceResponseSchema.parse(await response.json())).toEqual({
      contents: [
        {
          uri: URI,
          mimeType: MCP_UI_MIME_TYPE,
          text: '<html>Panel</html>',
          _meta: POLICY,
        },
      ],
    })
    expect(f.read.mock.calls[0]?.[0]).toMatchObject({
      pluginId: 'test-plugin',
      hostId: 'theseus',
      tenantId: TENANT,
      userId: USER,
    })
  })

  it('advertises resource paths only when enabled, preserving the handshake schema', async () => {
    const f = await setup()
    const body = {
      plugin_id: 'test-plugin',
      host_id: 'theseus',
      host_version: '1.0.0',
      tenant_id: TENANT,
      user_id: USER,
    }
    const enabled = HandshakeResponseSchema.parse(
      await (await f.post('/plugin-bridge/v1/handshake', body)).json(),
    )
    expect(enabled.mcp_ui).toEqual({
      version: 1,
      mime_types: [MCP_UI_MIME_TYPE],
      resources_list_endpoint: MCP_UI_LIST_PATH,
      resources_read_endpoint: MCP_UI_READ_PATH,
    })
    const legacy = createBridgeApp({
      manifest: manifest(),
      registry: f.host.registry,
      toolHandlers: {},
    })
    const headers = {
      authorization: `Bearer ${await f.mint()}`,
      'content-type': 'application/json',
    }
    expect(
      (
        await legacy.request(MCP_UI_READ_PATH, {
          method: 'POST',
          headers,
          body: JSON.stringify({ uri: URI }),
        })
      ).status,
    ).toBe(404)
    const response = await legacy.request('/plugin-bridge/v1/handshake', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })
    expect(HandshakeResponseSchema.parse(await response.json()).mcp_ui).toBeUndefined()
  })

  it.each([{ scopes: [] }, { scopes: ['mcp.read.test'] }, { scopes: ['mcp.ui.test'] }])(
    'filters discovery and denies reading with scopes $scopes',
    async ({ scopes }) => {
      const f = await setup()
      const token = await f.mint(scopes)
      expect(await (await f.post(MCP_UI_LIST_PATH, {}, token)).json()).toEqual({ resources: [] })
      expect((await f.post(MCP_UI_READ_PATH, { uri: URI }, token)).status).toBe(403)
      expect(f.read).not.toHaveBeenCalled()
    },
  )

  it('uses the existing wildcard scope semantics', async () => {
    const f = await setup()
    expect((await f.post(MCP_UI_READ_PATH, { uri: URI }, await f.mint(['mcp.*']))).status).toBe(200)
  })

  it('rejects unauthenticated, expired and foreign-plugin callers before reading', async () => {
    const f = await setup()
    const tokens = [
      '',
      await f.mint(undefined, { aud: 'foreign-plugin' }),
      await f.mint(undefined, { omitClaims: ['aud', 'plugin_id'], sub: 'test-plugin' }),
      await f.mint(undefined, { expiresIn: '-1s' }),
    ]
    for (const token of tokens) {
      expect((await f.post(MCP_UI_READ_PATH, { uri: URI }, token)).status).toBe(401)
    }
    expect(f.read).not.toHaveBeenCalled()
  })

  it('accepts legacy plugin_id and canonical user-sub tokens without trusting request identities', async () => {
    const f = await setup()
    const token = await f.mint(undefined, { omitClaims: ['plugin_id', 'user_id'] })
    expect((await f.post(MCP_UI_READ_PATH, { uri: URI }, token)).status).toBe(200)
    expect(f.read.mock.calls[0]?.[0].userId).toBe(USER)
    expect(
      (await f.post(MCP_UI_READ_PATH, { uri: URI, user_id: 'somebody-else' }, token)).status,
    ).toBe(400)
    const legacy = await f.mint(undefined, { omitClaims: ['aud'] })
    expect((await f.post(MCP_UI_READ_PATH, { uri: URI }, legacy)).status).toBe(200)
  })

  it.each([
    'file:///etc/passwd',
    'https://example.com/ui',
    'ui://test-plugin/missing',
    'ui://test-plugin/panel?user=other',
  ])('never resolves unregistered URI %s', async (uri) => {
    const f = await setup()
    expect((await f.post(MCP_UI_READ_PATH, { uri })).status).toBe(
      uri.startsWith('ui://') ? 404 : 400,
    )
    expect(f.read).not.toHaveBeenCalled()
  })

  it('bounds request bodies and rejects malformed JSON', async () => {
    const f = await setup()
    expect((await f.post(MCP_UI_READ_PATH, { uri: URI, padding: 'x'.repeat(5_000) })).status).toBe(
      413,
    )
    const response = await f.app.request(MCP_UI_READ_PATH, {
      method: 'POST',
      headers: { authorization: `Bearer ${await f.mint()}`, 'content-type': 'application/json' },
      body: '{',
    })
    expect(response.status).toBe(400)
    expect(f.read).not.toHaveBeenCalled()
  })

  it.each(['', 'ö'.repeat(MCP_UI_HTML_MAX_BYTES / 2 + 1)])(
    'rejects empty or oversized UTF-8 HTML',
    async (html) => {
      const f = await setup(vi.fn(async () => html))
      const response = await f.post(MCP_UI_READ_PATH, { uri: URI })
      expect(response.status).toBe(500)
      expect(await response.json()).toEqual({
        error: { code: 'resource_read_failed', message: 'resource_read_failed' },
      })
    },
  )

  it('redacts provider diagnostics rather than returning a file path', async () => {
    const f = await setup(
      vi.fn(async () => {
        throw new Error('/private/tenant/database.key')
      }),
    )
    expect(await (await f.post(MCP_UI_READ_PATH, { uri: URI })).text()).not.toContain('/private/')
  })

  it('fails startup on duplicate, dangling or wrong-MIME resource definitions', async () => {
    const host = await buildTestRegistry()
    const definition: McpUiResourceDefinition = {
      resource: { uri: URI, name: 'panel' },
      read: () => 'ok',
    }
    const base = { manifest: manifest(), registry: host.registry, toolHandlers: {} }
    expect(() => createBridgeApp({ ...base, mcpUiResources: [definition, definition] })).toThrow(
      'duplicate UI resource',
    )
    expect(() =>
      createBridgeApp({
        ...base,
        mcpUiResources: [
          { ...definition, resource: { uri: 'ui://test-plugin/other', name: 'other' } },
        ],
      }),
    ).toThrow('unregistered UI resource')
    expect(() =>
      createBridgeApp({
        ...base,
        mcpUiResources: [
          {
            ...definition,
            resource: { ...definition.resource, mimeType: 'text/html' as typeof MCP_UI_MIME_TYPE },
          },
        ],
      }),
    ).toThrow()
  })

  it('runs host adapter list/read against the authenticated app and uses current tokens', async () => {
    const f = await setup()
    let token = await f.mint()
    const request = vi.fn<typeof fetch>(async (input, init) => f.app.request(String(input), init))
    const client = createMcpUiResourceClient({
      bridgeEndpoint: 'http://127.0.0.1:3600',
      tokenResolver: () => token,
      fetch: request,
    })
    expect((await client.list()).resources[0]?.uri).toBe(URI)
    expect((await client.read(URI)).contents[0]?.text).toBe('<html>Panel</html>')
    expect(request.mock.calls[0]?.[1]).toMatchObject({
      redirect: 'error',
      credentials: 'omit',
      cache: 'no-store',
    })
    token = await f.mint([])
    await expect(client.read(URI)).rejects.toMatchObject({
      code: 'resource_request_failed',
      status: 403,
    })
  })

  it('rejects redirected resource identity and oversized replies in the host adapter', async () => {
    const client = (body: unknown) =>
      createMcpUiResourceClient({
        bridgeEndpoint: 'http://127.0.0.1:3600',
        tokenResolver: () => 'token',
        fetch: async () => Response.json(body),
      })
    await expect(
      client({
        contents: [{ uri: 'ui://other/panel', mimeType: MCP_UI_MIME_TYPE, text: 'other' }],
      }).read(URI),
    ).rejects.toMatchObject({ code: 'invalid_resource_response' })
    await expect(client({ data: 'x'.repeat(4 * 1024 * 1024 + 1) }).read(URI)).rejects.toMatchObject(
      { code: 'resource_response_too_large' },
    )
  })
})
