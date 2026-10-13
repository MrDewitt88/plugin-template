import { describe, expect, it, vi } from 'vitest'
import {
  MCP_APP_MIME,
  PluginAppHost,
  tokenIdentity,
  validatePluginEndpoint,
} from '../src/client.js'
const uri = 'ui://fixture/panel'
const claims = {
  aud: 'fixture',
  host_id: 'myMind',
  tenant_id: 'tenant',
  user_id: 'user',
  exp: Math.floor(Date.now() / 1000) + 3600,
}
const jwt = (overrides = {}) =>
  `test.${btoa(JSON.stringify({ ...claims, ...overrides }))}.signature`
const tool = {
  name: 'items.panel',
  description: 'Panel',
  _meta: { ui: { resourceUri: uri, visibility: ['model', 'app'] } },
}
function fixture(
  overrides: {
    response?: (path: string) => unknown
    current?: () => boolean
    token?: () => string
    timeoutMs?: number
  } = {},
) {
  const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(url)).pathname
    const result = path.endsWith('/handshake')
      ? {
          plugin_id: 'fixture',
          manifest: {
            id: 'fixture',
            provides: {
              mcp_tools: [
                tool,
                { name: 'hidden', _meta: { ui: { visibility: ['model'] } } },
                { name: 'app-only', _meta: { ui: { visibility: ['app'] } } },
              ],
            },
          },
          mcp_ui: {
            version: 1,
            mime_types: [MCP_APP_MIME],
            resources_list_endpoint: '/plugin-bridge/v1/resources/list',
            resources_read_endpoint: '/plugin-bridge/v1/resources/read',
          },
        }
      : path.endsWith('/list')
        ? { resources: [{ uri, name: 'Panel', mimeType: MCP_APP_MIME }] }
        : path.endsWith('/read')
          ? { contents: [{ uri, mimeType: MCP_APP_MIME, text: '<html>Widget</html>' }] }
          : {
              ok: true,
              result: {
                content: [{ type: 'text', text: JSON.parse(String(init?.body)).tool_name }],
                structuredContent: { items: [] },
              },
            }
    return Response.json(overrides.response ? overrides.response(path) : result)
  })
  const host = new PluginAppHost({
    pluginId: 'fixture',
    endpoint: 'https://fixture.example',
    tokenResolver: overrides.token ?? (() => jwt()),
    isCurrent: overrides.current ?? (() => true),
    fetch: fetcher,
    ...(overrides.timeoutMs ? { timeoutMs: overrides.timeoutMs } : {}),
  })
  return { host, fetcher }
}
describe('MCPi provider host boundary', () => {
  it('discovers, reads and forwards the local tool name exactly once', async () => {
    const { host, fetcher } = fixture()
    const catalog = await host.discover()
    expect(catalog.tools.map((t) => t.name)).toEqual(['items.panel', 'hidden', 'app-only'])
    expect((await host.read(uri)).text).toBe('<html>Widget</html>')
    expect(await host.call('items.panel', {})).toMatchObject({ structuredContent: { items: [] } })
    const body = JSON.parse(String(fetcher.mock.calls[3]?.[1]?.body))
    expect(body).toMatchObject({ tool_name: 'items.panel', tenant_id: 'tenant', user_id: 'user' })
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toMatchObject({
      plugin_id: 'fixture',
      host_id: 'myMind',
      tenant_id: 'tenant',
      user_id: 'user',
    })
    expect(
      fetcher.mock.calls.every((c) => c[1]?.redirect === 'error' && c[1]?.credentials === 'omit'),
    ).toBe(true)
  })
  it('allows app-only callbacks and refuses model-only or another plugin names', async () => {
    const { host, fetcher } = fixture()
    await host.discover()
    await host.call('app-only', {})
    await expect(host.call('hidden', {})).rejects.toMatchObject({ code: 'mcpi_tool_denied' })
    await expect(host.call('other.items.panel', {})).rejects.toMatchObject({
      code: 'mcpi_tool_denied',
    })
    expect(fetcher).toHaveBeenCalledTimes(3)
  })
  it('never resolves an undiscovered URI through HTTP or the filesystem', async () => {
    const { host, fetcher } = fixture()
    await host.discover()
    await expect(host.read('file:///etc/passwd')).rejects.toMatchObject({
      code: 'mcpi_resource_denied',
    })
    await expect(host.read('ui://other/panel')).rejects.toMatchObject({
      code: 'mcpi_resource_denied',
    })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
  it.each([
    { aud: 'other' },
    { aud: undefined },
    { exp: 0 },
    { user_id: undefined, sub: undefined },
    { host_id: undefined },
  ])('rejects invalid routing/expiry claims before sending a token %j', async (bad) => {
    const { host, fetcher } = fixture({ token: () => jwt(bad) })
    await expect(host.discover()).rejects.toMatchObject({ code: 'mcpi_token_invalid' })
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('rejects user or tenant rotation inside an existing session', async () => {
    let token = jwt()
    const { host, fetcher } = fixture({ token: () => token })
    await host.discover()
    token = jwt({ tenant_id: 'other' })
    await expect(host.read(uri)).rejects.toMatchObject({ code: 'mcpi_owner_stale' })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
  it('retires the owner before a callback reaches the provider', async () => {
    let current = true
    const { host, fetcher } = fixture({ current: () => current })
    await host.discover()
    current = false
    await expect(host.call('items.panel', {})).rejects.toMatchObject({ code: 'mcpi_owner_stale' })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
  it.each([
    { contents: [{ uri: 'ui://wrong', mimeType: MCP_APP_MIME, text: '<html>x</html>' }] },
    { contents: [{ uri, mimeType: 'text/html', text: '<html>x</html>' }] },
    { contents: [{ uri, mimeType: MCP_APP_MIME, text: '😃'.repeat(150000) }] },
  ])('validates the exact URI, MIME and UTF-8 resource bound', async (response) => {
    const f = fixture()
    await f.host.discover()
    f.fetcher.mockResolvedValueOnce(Response.json(response))
    await expect(f.host.read(uri)).rejects.toMatchObject({ code: 'mcpi_resource_invalid' })
  })
  it('revokes the old catalog on an unsuccessful refresh', async () => {
    const f = fixture()
    await f.host.discover()
    f.fetcher.mockResolvedValueOnce(Response.json({}))
    await expect(f.host.discover()).rejects.toMatchObject({ code: 'mcpi_ui_unsupported' })
    await expect(f.host.call('items.panel', {})).rejects.toMatchObject({ code: 'mcpi_tool_denied' })
  })
  it('requires HTTPS for native remote connections', () => {
    expect(validatePluginEndpoint('https://fixture.example', true)).toBe('https://fixture.example')
    for (const bad of [
      'http://192.168.1.2:3000',
      'http://localhost:3000',
      'https://user:token@fixture.example',
      'https://fixture.example/path',
      'file:///tmp',
    ])
      expect(() => validatePluginEndpoint(bad, true)).toThrow()
    expect(tokenIdentity(jwt(), 'fixture').userId).toBe('user')
  })
  it('bounds a stalled credential resolver without requiring new AbortSignal statics', async () => {
    const fetcher = vi.fn()
    const host = new PluginAppHost({
      pluginId: 'fixture',
      endpoint: 'https://fixture.example',
      tokenResolver: () => new Promise<string>(() => {}),
      isCurrent: () => true,
      fetch: fetcher,
      timeoutMs: 10,
    })
    await expect(host.discover()).rejects.toMatchObject({ code: 'mcpi_unavailable' })
    expect(fetcher).not.toHaveBeenCalled()
  })
})
