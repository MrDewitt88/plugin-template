/** MCPi is the Mind integration profile; UI uses the standard MCP Apps wire. */
export const MCP_APP_MIME = 'text/html;profile=mcp-app' as const
export const MAX_HTML_BYTES = 512 * 1024
export interface AppTool {
  readonly name: string
  readonly description: string
  readonly resourceUri?: string
  readonly visibility: readonly ('model' | 'app')[]
}
export interface AppResource {
  readonly uri: string
  readonly name: string
  readonly mimeType: typeof MCP_APP_MIME
}
export interface AppDocument {
  readonly uri: string
  readonly mimeType: typeof MCP_APP_MIME
  readonly text: string
}
export interface AppToolResult {
  readonly content: readonly Record<string, unknown>[]
  readonly structuredContent?: unknown
  readonly isError?: boolean
}
export interface PluginAppHostOptions {
  readonly pluginId: string
  /** Already authorized destination, never taken from a tool/resource response. */
  readonly endpoint: string
  readonly tokenResolver: () => string | Promise<string>
  readonly isCurrent: () => boolean
  readonly fetch?: typeof globalThis.fetch
  readonly timeoutMs?: number
}
export class McpiError extends Error {
  constructor(readonly code: string) {
    super(code)
    this.name = 'McpiError'
  }
}
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
export function uiUri(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 2048 &&
    /^ui:\/\/[^\s\u0000-\u001f\u007f]+$/u.test(value)
  )
}
function text(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max
}
/** iOS 16 supports AbortController, but not AbortSignal.any/timeout. */
function requestScope(
  signal: AbortSignal | undefined,
  timeoutMs: number,
): { signal: AbortSignal; dispose(): void } {
  const controller = new AbortController()
  const forward = (): void => controller.abort()
  if (signal?.aborted) forward()
  else signal?.addEventListener('abort', forward, { once: true })
  const timer = setTimeout(forward, timeoutMs)
  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', forward)
    },
  }
}
/** Claims are routing assertions only. The provider verifies signature/issuer/scopes. */
export function tokenIdentity(
  token: string,
  pluginId: string,
): { tenantId: string; userId: string; hostId: string } {
  try {
    const segment = token.split('.')[1]
    if (!segment || token.length > 32768) throw new Error()
    const decoded = JSON.parse(atob(segment.replaceAll('-', '+').replaceAll('_', '/'))) as unknown
    if (
      !isRecord(decoded) ||
      decoded.aud !== pluginId ||
      !text(decoded.tenant_id, 256) ||
      !text(decoded.host_id, 256) ||
      !text(decoded.user_id ?? decoded.sub, 256) ||
      typeof decoded.exp !== 'number' ||
      decoded.exp * 1000 <= Date.now() ||
      (typeof decoded.nbf === 'number' && decoded.nbf * 1000 > Date.now())
    )
      throw new Error()
    return {
      tenantId: decoded.tenant_id,
      userId: (decoded.user_id ?? decoded.sub) as string,
      hostId: decoded.host_id,
    }
  } catch {
    throw new McpiError('mcpi_token_invalid')
  }
}
export function validatePluginEndpoint(raw: string, remoteOnly = false): string {
  try {
    const u = new URL(raw)
    const loopback = /^(localhost|127(?:\.\d+){3}|\[::1\])$/i.test(u.hostname)
    if (
      u.username ||
      u.password ||
      u.search ||
      u.hash ||
      u.pathname !== '/' ||
      (u.protocol !== 'https:' && (u.protocol !== 'http:' || !loopback || remoteOnly)) ||
      (remoteOnly && loopback)
    )
      throw new Error()
    return u.origin
  } catch {
    throw new McpiError('mcpi_endpoint_invalid')
  }
}
export function parseAppToolResult(value: unknown): AppToolResult {
  if (
    !isRecord(value) ||
    !Array.isArray(value.content) ||
    value.content.length > 128 ||
    !value.content.every((item) => isRecord(item) && typeof item.type === 'string') ||
    (value.isError !== undefined && typeof value.isError !== 'boolean')
  )
    throw new McpiError('mcpi_result_invalid')
  return value as unknown as AppToolResult
}

/** No credentials/cookies/redirects or shared tenant cache. A host owns each instance. */
export class PluginAppHost {
  private readonly endpoint: string
  private readonly fetcher: typeof fetch
  private tools: readonly AppTool[] = []
  private resources: readonly AppResource[] = []
  private identity: { tenantId: string; userId: string } | null = null
  private revision = 0
  constructor(private readonly options: PluginAppHostOptions) {
    if (options.pluginId === 'host' || !/^[a-z0-9][a-z0-9_-]{0,127}$/.test(options.pluginId))
      throw new McpiError('mcpi_plugin_invalid')
    this.endpoint = validatePluginEndpoint(options.endpoint)
    this.fetcher = options.fetch ?? globalThis.fetch
    if (
      options.timeoutMs !== undefined &&
      (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 1 || options.timeoutMs > 30000)
    )
      throw new McpiError('mcpi_timeout_invalid')
  }
  private current(revision = this.revision): void {
    if (!this.options.isCurrent() || revision !== this.revision)
      throw new McpiError('mcpi_owner_stale')
  }
  private async request(
    path: string,
    body: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<unknown> {
    this.current()
    const revision = this.revision
    const scope = requestScope(signal, this.options.timeoutMs ?? 10000)
    const boundedSignal = scope.signal
    try {
      boundedSignal.throwIfAborted()
      let onAbort: (() => void) | undefined
      const token = await Promise.race([
        Promise.resolve().then(() => this.options.tokenResolver()),
        new Promise<never>((_, reject) => {
          onAbort = () => reject(new McpiError('mcpi_unavailable'))
          boundedSignal.addEventListener('abort', onAbort, { once: true })
        }),
      ]).finally(() => {
        if (onAbort) boundedSignal.removeEventListener('abort', onAbort)
      })
      this.current(revision)
      boundedSignal.throwIfAborted()
      const identity = tokenIdentity(token, this.options.pluginId)
      if (
        this.identity &&
        (this.identity.tenantId !== identity.tenantId || this.identity.userId !== identity.userId)
      )
        throw new McpiError('mcpi_owner_stale')
      this.identity ??= identity
      let response: Response
      try {
        response = await this.fetcher(`${this.endpoint}${path}`, {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify(
            path.endsWith('/handshake')
              ? {
                  ...body,
                  plugin_id: this.options.pluginId,
                  host_id: identity.hostId,
                  tenant_id: identity.tenantId,
                  user_id: identity.userId,
                }
              : body,
          ),
          credentials: 'omit',
          cache: 'no-store',
          redirect: 'error',
          signal: boundedSignal,
        })
        this.current(revision)
        boundedSignal.throwIfAborted()
        if (!response.ok)
          throw new McpiError(
            response.status === 401 || response.status === 403 ? 'mcpi_denied' : 'mcpi_unavailable',
          )
        if (!response.body) throw new McpiError('mcpi_response_invalid')
        const reader = response.body.getReader()
        let size = 0
        const chunks: Uint8Array[] = []
        try {
          while (true) {
            const next = await reader.read()
            this.current(revision)
            boundedSignal.throwIfAborted()
            if (next.done) break
            size += next.value.length
            if (size > 4 * 1024 * 1024) throw new McpiError('mcpi_response_oversize')
            chunks.push(next.value)
          }
        } finally {
          await reader.cancel().catch(() => {})
          reader.releaseLock()
        }
        const bytes = new Uint8Array(size)
        let offset = 0
        for (const chunk of chunks) {
          bytes.set(chunk, offset)
          offset += chunk.length
        }
        return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown
      } catch (error) {
        if (error instanceof McpiError) throw error
        throw new McpiError('mcpi_unavailable')
      }
    } finally {
      scope.dispose()
    }
  }
  async discover(
    signal?: AbortSignal,
  ): Promise<{ tools: readonly AppTool[]; resources: readonly AppResource[] }> {
    // Revokes any old catalog before a refresh, including a failed refresh.
    this.tools = []
    this.resources = []
    ++this.revision
    const revision = this.revision
    const raw = await this.request(
      '/plugin-bridge/v1/handshake',
      { host_id: 'mcpi-host', host_version: '1.0.0' },
      signal,
    )
    if (
      !isRecord(raw) ||
      raw.plugin_id !== this.options.pluginId ||
      !isRecord(raw.manifest) ||
      raw.manifest.id !== this.options.pluginId ||
      !isRecord(raw.mcp_ui) ||
      raw.mcp_ui.version !== 1 ||
      raw.mcp_ui.resources_list_endpoint !== '/plugin-bridge/v1/resources/list' ||
      raw.mcp_ui.resources_read_endpoint !== '/plugin-bridge/v1/resources/read' ||
      !Array.isArray(raw.mcp_ui.mime_types) ||
      !raw.mcp_ui.mime_types.includes(MCP_APP_MIME)
    )
      throw new McpiError('mcpi_ui_unsupported')
    const provides = raw.manifest.provides
    if (
      !isRecord(provides) ||
      !Array.isArray(provides.mcp_tools) ||
      provides.mcp_tools.length > 4096
    )
      throw new McpiError('mcpi_catalog_invalid')
    const tools: AppTool[] = []
    for (const candidate of provides.mcp_tools) {
      if (!isRecord(candidate) || !text(candidate.name, 256)) continue
      const meta = isRecord(candidate._meta) ? candidate._meta : {}
      const ui = isRecord(meta.ui) ? meta.ui : {}
      const visibility = ui.visibility ?? ['model', 'app']
      if (
        !Array.isArray(visibility) ||
        !visibility.length ||
        !visibility.every((v) => v === 'model' || v === 'app') ||
        (ui.resourceUri !== undefined && !uiUri(ui.resourceUri))
      )
        throw new McpiError('mcpi_catalog_invalid')
      tools.push({
        name: candidate.name,
        description:
          typeof candidate.description === 'string' ? candidate.description : candidate.name,
        visibility,
        ...(ui.resourceUri === undefined ? {} : { resourceUri: ui.resourceUri as string }),
      })
    }
    const listed = await this.request('/plugin-bridge/v1/resources/list', {}, signal)
    if (!isRecord(listed) || !Array.isArray(listed.resources) || listed.resources.length > 128)
      throw new McpiError('mcpi_catalog_invalid')
    const resources: AppResource[] = listed.resources.map((value) => {
      if (
        !isRecord(value) ||
        !uiUri(value.uri) ||
        !text(value.name, 256) ||
        value.mimeType !== MCP_APP_MIME
      )
        throw new McpiError('mcpi_catalog_invalid')
      return { uri: value.uri, name: value.name, mimeType: MCP_APP_MIME }
    })
    if (
      new Set(tools.map((t) => t.name)).size !== tools.length ||
      new Set(resources.map((r) => r.uri)).size !== resources.length
    )
      throw new McpiError('mcpi_catalog_invalid')
    this.current(revision)
    this.tools = tools
    this.resources = resources
    return { tools, resources }
  }
  async read(uri: string, signal?: AbortSignal): Promise<AppDocument> {
    if (!this.resources.some((r) => r.uri === uri)) throw new McpiError('mcpi_resource_denied')
    const raw = await this.request('/plugin-bridge/v1/resources/read', { uri }, signal)
    if (!isRecord(raw) || !Array.isArray(raw.contents) || raw.contents.length !== 1)
      throw new McpiError('mcpi_resource_invalid')
    const item = raw.contents[0]
    if (
      !isRecord(item) ||
      item.uri !== uri ||
      item.mimeType !== MCP_APP_MIME ||
      !text(item.text, MAX_HTML_BYTES) ||
      new TextEncoder().encode(item.text).length > MAX_HTML_BYTES
    )
      throw new McpiError('mcpi_resource_invalid')
    return { uri, mimeType: MCP_APP_MIME, text: item.text }
  }
  appTool(name: string): AppTool {
    const tool = this.tools.find((t) => t.name === name && t.visibility.includes('app'))
    if (!tool) throw new McpiError('mcpi_tool_denied')
    this.current()
    return tool
  }
  async call(
    name: string,
    args: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<AppToolResult> {
    this.appTool(name)
    if (!isRecord(args) || new TextEncoder().encode(JSON.stringify(args)).length > 65536)
      throw new McpiError('mcpi_args_invalid')
    if (!this.identity) throw new McpiError('mcpi_owner_stale')
    const raw = await this.request(
      '/plugin-bridge/v1/execute-tool',
      {
        tool_name: name,
        arguments: args,
        tenant_id: this.identity.tenantId,
        user_id: this.identity.userId,
        actor_class: 'user',
      },
      signal,
    )
    if (!isRecord(raw) || raw.ok !== true) throw new McpiError('mcpi_tool_failed')
    return parseAppToolResult(raw.result)
  }
}
