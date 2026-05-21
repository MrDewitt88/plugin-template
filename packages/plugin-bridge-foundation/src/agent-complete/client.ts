// createAgentComplete — Foundation-Helper für Plugin-Authors.
//
// Wraps fetch(bridgeEndpoint + '/mcp/v1/call-tool') mit {tool: 'agent.complete',
// arguments: validated}. Zod-validation auf Request + Response macht silent-fail
// sichtbar. Cross-Repo: V8 + v8-fam exposen `/mcp/v1/call-tool` per Design-Y
// (msg #445), forward zu Theseus' POST /agent/complete (msg #449).
//
// Plugin-Author-API:
//
//   import { createAgentComplete } from '@nexus-mindgarden/plugin-bridge-foundation/agent-complete'
//
//   const agentComplete = createAgentComplete({
//     bridgeEndpoint: ctx.bridgeEndpoint,  // aus M17 accept-response
//     sessionToken: ctx.sessionToken,      // ebenfalls aus M17
//   })
//
//   const result = await agentComplete({
//     messages: [{ role: 'user', content: 'Summarize this layout: ...' }],
//     responseFormat: { type: 'json_schema', schema: zodToJsonSchema(MySchema) },
//     maxTokens: 200,
//     cacheRetention: 'short',
//   })
//
//   if (result.error) handleError(result.error)
//   else MySchema.parse(JSON.parse(result.text))  // defense-in-depth

import {
  AgentCompleteRequestSchema,
  AgentCompleteResponseSchema,
  type AgentCompleteRequest,
  type AgentCompleteResponse,
} from './types.js'

export interface CreateAgentCompleteOptions {
  /**
   * Bridge endpoint from M17 guest-registration accept-response.
   * Typically `http://127.0.0.1:3100/mcp/v1/call-tool` (V8) oder `:3050` (v8-fam).
   * Foundation strips trailing `/call-tool` und re-appended.
   */
  bridgeEndpoint: string
  /** Session-token (Bearer JWT) from M17 accept-response. */
  sessionToken: string
  /**
   * Optional caller-id header for forensic-tracing. Foundation passes through
   * as `x-caller-id`. Useful for cross-repo debug (e.g. "mind-canva@v8-tenant-x").
   */
  callerId?: string
  /**
   * Optional `X-Request-Id`. If not provided, host or Foundation generates a
   * UUIDv4 (siehe plug-tmpl v0.2.2 X-Request-Id middleware).
   */
  requestId?: string
  /**
   * Custom fetch-impl. Default uses globalThis.fetch (Node 20+ / Browser).
   * Inject custom for tests or for fetch-instrumentation.
   */
  fetch?: typeof fetch
}

export class AgentCompleteError extends Error {
  constructor(
    public readonly code:
      | 'invalid_request'
      | 'http_error'
      | 'invalid_response'
      | 'transport_failure',
    message: string,
    public readonly httpStatus?: number,
    public readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'AgentCompleteError'
  }
}

export type AgentCompleteFn = (req: AgentCompleteRequest) => Promise<AgentCompleteResponse>

/**
 * Factory for typed `agent.complete` caller. Validates request/response via
 * the canonical schemas + wraps transport errors as `AgentCompleteError`.
 *
 * Drift #103 canonical-error-shape is preserved through V8's pass-through
 * dispatcher — server-side errors land in `response.error.{code,message,retryable}`,
 * NOT thrown. Throws only for transport-failures + schema-mismatches.
 */
export function createAgentComplete(opts: CreateAgentCompleteOptions): AgentCompleteFn {
  // Normalize endpoint: accept both `.../call-tool` and `.../mcp/v1` shapes
  const baseEndpoint = opts.bridgeEndpoint.replace(/\/call-tool\/?$/, '').replace(/\/$/, '')
  const callToolUrl = `${baseEndpoint}/call-tool`
  const fetchImpl = opts.fetch ?? globalThis.fetch

  return async (req) => {
    const parsed = AgentCompleteRequestSchema.safeParse(req)
    if (!parsed.success) {
      throw new AgentCompleteError(
        'invalid_request',
        `agent.complete request validation failed: ${parsed.error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; ')}`,
      )
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${opts.sessionToken}`,
      'Content-Type': 'application/json',
    }
    if (opts.callerId) headers['x-caller-id'] = opts.callerId
    if (opts.requestId) headers['X-Request-Id'] = opts.requestId

    let res: Response
    try {
      res = await fetchImpl(callToolUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ tool: 'agent.complete', arguments: parsed.data }),
      })
    } catch (err) {
      throw new AgentCompleteError(
        'transport_failure',
        `agent.complete transport failure: ${(err as Error).message}`,
        undefined,
        err,
      )
    }

    if (!res.ok) {
      // V8/v8-fam Drift #103 canonical-error: try to extract structured body
      let bodyText = ''
      try {
        bodyText = await res.text()
      } catch {
        // ignore
      }
      throw new AgentCompleteError(
        'http_error',
        `agent.complete HTTP ${res.status}: ${bodyText || res.statusText}`,
        res.status,
      )
    }

    let body: unknown
    try {
      body = await res.json()
    } catch (err) {
      throw new AgentCompleteError(
        'invalid_response',
        `agent.complete response is not valid JSON: ${(err as Error).message}`,
        res.status,
        err,
      )
    }

    const result = AgentCompleteResponseSchema.safeParse(body)
    if (!result.success) {
      throw new AgentCompleteError(
        'invalid_response',
        `agent.complete response schema mismatch: ${result.error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; ')}`,
        res.status,
      )
    }

    return result.data
  }
}

/**
 * Convenience helper: when you just want the text (most common case).
 * Throws if `result.error` is set OR `result.text` is empty.
 */
export async function agentCompleteText(
  client: AgentCompleteFn,
  req: AgentCompleteRequest,
): Promise<string> {
  const result = await client(req)
  if (result.error) {
    throw new AgentCompleteError(
      'invalid_response',
      `agent.complete returned error envelope: ${result.error.code} — ${result.error.message}`,
    )
  }
  return result.text
}
