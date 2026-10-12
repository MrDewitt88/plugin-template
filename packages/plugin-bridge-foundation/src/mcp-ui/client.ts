import {
  MCP_UI_LIST_PATH,
  MCP_UI_READ_PATH,
  McpUiUriSchema,
  ListMcpUiResourcesResponseSchema,
  ReadMcpUiResourceResponseSchema,
  type ListMcpUiResourcesResponse,
  type ReadMcpUiResourceResponse,
} from './types.js'

export interface McpUiResourceClientOptions {
  /** Host-authorized plugin service endpoint. Resource URIs never choose a destination. */
  bridgeEndpoint: string
  tokenResolver: () => string | Promise<string>
  fetch?: typeof globalThis.fetch
  timeoutMs?: number
}

export interface McpUiResourceClient {
  list(signal?: AbortSignal): Promise<ListMcpUiResourcesResponse>
  read(uri: string, signal?: AbortSignal): Promise<ReadMcpUiResourceResponse>
}

export class McpUiResourceClientError extends Error {
  constructor(
    public readonly code: string,
    public readonly status?: number,
  ) {
    super(code)
    this.name = 'McpUiResourceClientError'
  }
}

// JSON escaping can take six bytes for one HTML byte. HTML itself is limited
// by ReadMcpUiResourceResponseSchema; this additionally bounds the transport.
const RESPONSE_MAX_BYTES = 4 * 1024 * 1024
async function boundedJson(response: Response): Promise<unknown> {
  if (!response.body) throw new McpUiResourceClientError('invalid_resource_response')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      length += chunk.value.byteLength
      if (length > RESPONSE_MAX_BYTES)
        throw new McpUiResourceClientError('resource_response_too_large')
      chunks.push(chunk.value)
    }
    const bytes = new Uint8Array(length)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

/** Host adapter for MCP resources/list and resources/read over the Plugin Bridge. */
export function createMcpUiResourceClient(opts: McpUiResourceClientOptions): McpUiResourceClient {
  const endpoint = new URL(opts.bridgeEndpoint)
  if (
    !['http:', 'https:'].includes(endpoint.protocol) ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash ||
    endpoint.pathname !== '/'
  ) {
    throw new Error('bridgeEndpoint must be an HTTP(S) origin without credentials')
  }
  const timeoutMs = opts.timeoutMs ?? 10_000
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000)
    throw new Error('invalid resource timeout')
  const fetchImpl = opts.fetch ?? globalThis.fetch
  async function request(path: string, body: unknown, signal?: AbortSignal): Promise<unknown> {
    const token = await opts.tokenResolver()
    if (!token) throw new McpUiResourceClientError('resource_token_unavailable')
    try {
      const response = await fetchImpl(new URL(path, endpoint), {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
        redirect: 'error',
        credentials: 'omit',
        cache: 'no-store',
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])
          : AbortSignal.timeout(timeoutMs),
      })
      if (!response.ok) {
        await response.body?.cancel().catch(() => {})
        throw new McpUiResourceClientError('resource_request_failed', response.status)
      }
      return await boundedJson(response)
    } catch (error) {
      if (error instanceof McpUiResourceClientError) throw error
      throw new McpUiResourceClientError('resource_request_failed')
    }
  }
  return {
    async list(signal) {
      const parsed = ListMcpUiResourcesResponseSchema.safeParse(
        await request(MCP_UI_LIST_PATH, {}, signal),
      )
      if (!parsed.success) throw new McpUiResourceClientError('invalid_resource_response')
      return parsed.data
    },
    async read(uri, signal) {
      if (!McpUiUriSchema.safeParse(uri).success)
        throw new McpUiResourceClientError('invalid_resource_uri')
      const parsed = ReadMcpUiResourceResponseSchema.safeParse(
        await request(MCP_UI_READ_PATH, { uri }, signal),
      )
      if (!parsed.success || parsed.data.contents[0]?.uri !== uri)
        throw new McpUiResourceClientError('invalid_resource_response')
      return parsed.data
    },
  }
}
