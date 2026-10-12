import type { Context } from 'hono'
import type { BridgeTokenClaims } from '../types.js'
import { McpUiResourceError, type McpUiResourceRegistry } from '../mcp-ui/registry.js'
import { ListMcpUiResourcesRequestSchema, ReadMcpUiResourceRequestSchema } from '../mcp-ui/types.js'

export function mcpUiResourcesHandler(registry: McpUiResourceRegistry, operation: 'list' | 'read') {
  return async (c: Context) => {
    // Resource templates can contain user data. Never retain them in shared caches.
    c.header('Cache-Control', 'no-store')
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: { code: 'invalid_request', message: 'malformed JSON' } }, 400)
    }
    const schema =
      operation === 'read' ? ReadMcpUiResourceRequestSchema : ListMcpUiResourcesRequestSchema
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return c.json(
        { error: { code: 'invalid_request', message: 'invalid resource request' } },
        400,
      )
    }
    try {
      const claims = c.get('claims') as BridgeTokenClaims
      return c.json(
        operation === 'list'
          ? registry.list(claims)
          : await registry.read((parsed.data as { uri: string }).uri, claims),
      )
    } catch (error) {
      const failure =
        error instanceof McpUiResourceError
          ? error
          : new McpUiResourceError('resource_read_failed', 500)
      return c.json({ error: { code: failure.code, message: failure.code } }, failure.status)
    }
  }
}
