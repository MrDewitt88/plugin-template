import { checkRequiredScopes } from '../auth/scope-check.js'
import type { BridgeAuthContext, BridgeTokenClaims, PluginManifest } from '../types.js'
import {
  MCP_UI_LIST_PATH,
  MCP_UI_READ_PATH,
  MCP_UI_MIME_TYPE,
  MCP_UI_RESOURCES_MAX,
  McpUiResourceSchema,
  ReadMcpUiResourceResponseSchema,
  type McpUiResourceDefinition,
  type McpUiResource,
  type McpUiDiscovery,
  type ReadMcpUiResourceResponse,
} from './types.js'

export class McpUiResourceError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: 401 | 403 | 404 | 500,
  ) {
    super(code)
    this.name = 'McpUiResourceError'
  }
}

interface Entry {
  resource: McpUiResource
  requiredScopes: string[]
  read: McpUiResourceDefinition['read']
}

/** One fixed allowlist per bridge; no filesystem/network resolution from a URI. */
export class McpUiResourceRegistry {
  private readonly entries = new Map<string, Entry>()
  private readonly pluginId: string
  readonly discovery: McpUiDiscovery = {
    version: 1,
    mime_types: [MCP_UI_MIME_TYPE],
    resources_list_endpoint: MCP_UI_LIST_PATH,
    resources_read_endpoint: MCP_UI_READ_PATH,
  }

  constructor(manifest: PluginManifest, definitions: readonly McpUiResourceDefinition[]) {
    this.pluginId = manifest.id
    if (definitions.length === 0 || definitions.length > MCP_UI_RESOURCES_MAX) {
      throw new Error(`mcpUiResources must contain 1..${MCP_UI_RESOURCES_MAX} resources`)
    }
    for (const definition of definitions) {
      // JSON clone pins metadata at startup; later provider mutations cannot
      // silently change the security policy already discovered by a host.
      const resource = McpUiResourceSchema.parse(JSON.parse(JSON.stringify(definition.resource)))
      if (this.entries.has(resource.uri)) throw new Error(`duplicate UI resource: ${resource.uri}`)
      if (typeof definition.read !== 'function')
        throw new Error(`UI resource has no reader: ${resource.uri}`)
      const scopes = [
        ...(manifest.provides.scopes_required ?? []),
        ...(definition.scopesRequired ?? []),
      ]
      if (scopes.some((scope) => typeof scope !== 'string' || scope.length === 0)) {
        throw new Error(`invalid UI resource scopes: ${resource.uri}`)
      }
      this.entries.set(resource.uri, {
        resource,
        requiredScopes: [...new Set(scopes)],
        read: definition.read,
      })
    }
    for (const tool of manifest.provides.mcp_tools) {
      if (typeof tool === 'string') continue
      const uri = tool._meta?.ui?.resourceUri ?? tool._meta?.['ui/resourceUri']
      if (uri && !this.entries.has(uri))
        throw new Error(`tool '${tool.name}' references unregistered UI resource '${uri}'`)
    }
  }

  private authorize(claims: BridgeTokenClaims): void {
    // sub identifies a user on myMind. It never authorizes a plugin audience.
    if ((claims.aud ?? claims.plugin_id) !== this.pluginId) {
      throw new McpUiResourceError('invalid_audience', 401)
    }
  }

  list(claims: BridgeTokenClaims): { resources: McpUiResource[] } {
    this.authorize(claims)
    const resources = [...this.entries.values()]
      .filter((entry) => checkRequiredScopes(entry.requiredScopes, claims.scopes).ok)
      .map((entry) => structuredClone(entry.resource))
    return { resources }
  }

  async read(uri: string, claims: BridgeTokenClaims): Promise<ReadMcpUiResourceResponse> {
    this.authorize(claims)
    const entry = this.entries.get(uri)
    if (!entry) throw new McpUiResourceError('resource_not_found', 404)
    if (!checkRequiredScopes(entry.requiredScopes, claims.scopes).ok) {
      throw new McpUiResourceError('insufficient_scope', 403)
    }
    const ctx: BridgeAuthContext = {
      pluginId: this.pluginId,
      hostId: claims.host_id,
      tenantId: claims.tenant_id,
      userId: claims.user_id ?? claims.sub,
      scopes: claims.scopes,
      jti: claims.jti,
      claims,
    }
    try {
      const text = await entry.read(ctx)
      return ReadMcpUiResourceResponseSchema.parse({
        contents: [
          {
            uri: entry.resource.uri,
            mimeType: MCP_UI_MIME_TYPE,
            text,
            ...(entry.resource._meta !== undefined ? { _meta: entry.resource._meta } : {}),
          },
        ],
      })
    } catch {
      // A local file path, validation dump or provider diagnostic is not wire data.
      throw new McpUiResourceError('resource_read_failed', 500)
    }
  }
}
