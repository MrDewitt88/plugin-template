// createAgentComplete — Foundation-Helper für Plugin-Authors.
//
// Supports two canonical transports (cluster-contract chatbus thread="contracts"
// 2026-05-21 § agent-complete + 2026-05-31 § agent.complete (a)+(b)):
//
//   transport: 'v8-bridge' (default, v0.3.0+)
//     Wraps fetch(${bridgeEndpoint}/call-tool) mit {tool: 'agent.complete',
//     arguments: req}. V8 + v8-fam exposen `/mcp/v1/call-tool` per Design-Y
//     (msg #445), forward zu Theseus' POST /agent/complete (msg #449).
//     Typischer endpoint: `http://127.0.0.1:3100/mcp/v1/call-tool` (V8).
//
//   transport: 'agent-socket-direct' (v0.7.0+)
//     POSTs raw AgentCompleteRequest body direkt zu ${bridgeEndpoint}.
//     Für standalone-bridge-plugins die direkt zu Theseus' :3400/agent/complete
//     sprechen statt durch V8/v8-fam zu hoppen (host-shared §2.7 (b) path,
//     agent msg #4385).
//     Typischer endpoint: `http://127.0.0.1:3400/agent/complete`.
//
// Zod-validation auf Request + Response macht silent-fail sichtbar. Cluster-
// contract `@theseus/agent-complete-schema` v0.15.0 FROZEN — response shape
// (`{text, toolCalls, stopReason, ...}`) ist über beide transports identisch.
//
// Plugin-Author-API:
//
//   import { createAgentComplete } from '@nexus-mindgarden/plugin-bridge-foundation/agent-complete'
//
//   // Path-A (V8/v8-fam reverse-call envelope, static token):
//   const agentComplete = createAgentComplete({
//     bridgeEndpoint: ctx.bridgeEndpoint,  // aus M17 accept-response
//     sessionToken: ctx.sessionToken,      // ebenfalls aus M17
//   })
//
//   // Path-B (direct agent-socket, per-plugin handshake-token via resolver):
//   const agentComplete = createAgentComplete({
//     bridgeEndpoint: 'http://127.0.0.1:3400/agent/complete',
//     transport: 'agent-socket-direct',
//     tokenResolver: () => tokenStore.currentHandshakeToken(),
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

/**
 * Transport mode discriminator. See module-doc for wire-shape differences.
 * @since v0.7.0 (`transport` field; default `'v8-bridge'` preserves v0.6.x behaviour)
 */
export type AgentCompleteTransport = 'v8-bridge' | 'agent-socket-direct'

export interface CreateAgentCompleteOptions {
  /**
   * Bridge endpoint.
   *
   * For `transport: 'v8-bridge'` (default): typically
   * `http://127.0.0.1:3100/mcp/v1/call-tool` (V8) or `:3050` (v8-fam).
   * Foundation strips trailing `/call-tool` and re-appends — both
   * `.../mcp/v1` and `.../mcp/v1/call-tool` accepted.
   *
   * For `transport: 'agent-socket-direct'`: typically
   * `http://127.0.0.1:3400/agent/complete` (Theseus agent socket-server).
   * Foundation POSTs to this URL as-is (trailing slash stripped only).
   */
  bridgeEndpoint: string
  /**
   * Transport-mode discriminator.
   * - `'v8-bridge'` (default): V8/v8-fam reverse-call envelope (`/call-tool` POST,
   *   body wraps as `{tool: 'agent.complete', arguments: req}`)
   * - `'agent-socket-direct'`: direct Theseus agent-socket call (POST raw req
   *   to bridgeEndpoint)
   *
   * @default `'v8-bridge'` (backward-compat with v0.6.x)
   * @since v0.7.0
   */
  transport?: AgentCompleteTransport
  /**
   * Static session-token (Bearer JWT) used for every request.
   *
   * Pass when the token is known at create-time and does not need refresh.
   * Common for V8/TeamMind static-token integration (Path-A `'v8-bridge'`
   * transport).
   *
   * **Exactly one of `sessionToken` or `tokenResolver` must be set.**
   * Both unset OR both set → throws `AgentCompleteError('invalid_request')`
   * at create-time.
   *
   * @see tokenResolver for per-request refresh of per-plugin handshake-tokens
   */
  sessionToken?: string
  /**
   * Resolver called before EACH request to provide a fresh Bearer-token.
   *
   * Use for per-plugin handshake-tokens (M17 accept-response, register-tenants
   * activation-handshake) that may rotate / refresh between calls. Common for
   * Path-B (`'agent-socket-direct'`) where the per-plugin JWT lives in the
   * plugin's own token-store and may be re-minted on expiry.
   *
   * **Exactly one of `sessionToken` or `tokenResolver` must be set.**
   * Resolver-throws / empty-token-returns surface as `AgentCompleteError`
   * (`'transport_failure'` or `'invalid_request'` respectively) at request-time.
   *
   * @example
   *   // Per-plugin handshake-token store (re-minted on TTL-expiry):
   *   createAgentComplete({
   *     bridgeEndpoint: 'http://127.0.0.1:3400/agent/complete',
   *     transport: 'agent-socket-direct',
   *     tokenResolver: () => pluginTokenStore.current(),
   *   })
   *
   * @since v0.7.0
   */
  tokenResolver?: () => string | Promise<string>
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
 *
 * Auth-options invariant (v0.7.0+): exactly one of `sessionToken` (static) or
 * `tokenResolver` (per-request) MUST be set. Both unset / both set throws
 * `AgentCompleteError('invalid_request')` at create-time (loud-fail vs runtime-fail).
 */
export function createAgentComplete(opts: CreateAgentCompleteOptions): AgentCompleteFn {
  // v0.7.0+ auth-options invariant: exactly-one-of (sessionToken | tokenResolver)
  const hasStatic = opts.sessionToken !== undefined
  const hasResolver = opts.tokenResolver !== undefined
  if (hasStatic === hasResolver) {
    throw new AgentCompleteError(
      'invalid_request',
      hasStatic
        ? 'CreateAgentCompleteOptions: pass exactly one of `sessionToken` or `tokenResolver` — both set'
        : 'CreateAgentCompleteOptions: pass exactly one of `sessionToken` or `tokenResolver` — neither set',
    )
  }

  // Per-request token resolver (always async-shaped, wraps static for uniformity)
  const resolveToken: () => Promise<string> = hasResolver
    ? async () => {
        let raw: string | Promise<string>
        try {
          raw = opts.tokenResolver!()
        } catch (err) {
          throw new AgentCompleteError(
            'transport_failure',
            `tokenResolver threw synchronously: ${(err as Error).message}`,
            undefined,
            err,
          )
        }
        let resolved: string
        try {
          resolved = await raw
        } catch (err) {
          throw new AgentCompleteError(
            'transport_failure',
            `tokenResolver promise rejected: ${(err as Error).message}`,
            undefined,
            err,
          )
        }
        if (typeof resolved !== 'string' || resolved.length === 0) {
          throw new AgentCompleteError(
            'invalid_request',
            'tokenResolver returned empty or non-string token',
          )
        }
        return resolved
      }
    : async () => opts.sessionToken as string

  // Transport-mode shapes endpoint URL + request body
  const transport: AgentCompleteTransport = opts.transport ?? 'v8-bridge'
  const requestUrl =
    transport === 'agent-socket-direct'
      ? // Direct agent-socket: POST raw bridgeEndpoint (trailing slash stripped)
        opts.bridgeEndpoint.replace(/\/$/, '')
      : // V8/v8-fam bridge: normalize bridgeEndpoint + append /call-tool
        `${opts.bridgeEndpoint.replace(/\/call-tool\/?$/, '').replace(/\/$/, '')}/call-tool`

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

    const token = await resolveToken()

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    }
    if (opts.callerId) headers['x-caller-id'] = opts.callerId
    if (opts.requestId) headers['X-Request-Id'] = opts.requestId

    // Body-shape per transport: v8-bridge envelope vs direct raw
    const requestBody =
      transport === 'agent-socket-direct'
        ? JSON.stringify(parsed.data)
        : JSON.stringify({ tool: 'agent.complete', arguments: parsed.data })

    let res: Response
    try {
      res = await fetchImpl(requestUrl, {
        method: 'POST',
        headers,
        body: requestBody,
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
