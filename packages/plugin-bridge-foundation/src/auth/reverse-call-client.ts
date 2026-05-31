// createReverseCallClient — typed wrapper for myMind's
// POST /host-bridge/v1/execute-tool reverse-call endpoint.
//
// Why this exists:
//   The reverse-call wire has TWO wire-fußangeln that bit early adopters:
//     1. Body key is "args" — NOT "arguments" (the OpenAI-shaped name).
//     2. For image-tools, the actual PNG bytes live in response.metadata.image_base64,
//        NOT response.value (which is a human-readable description, base64-free).
//   This helper kapselt both so plugin-authors get type-safe access without
//   bringing wire-knowledge to every call-site.
//
// Allowlist (per agent #~05:47, 2026-05-31):
//   ['projects.', 'contacts.', 'calendar.', 'notes.', 'attachments.', 'image.']
// agent.complete is NOT here — it has its own /agent/complete endpoint, see
// createAgentComplete() with transport: 'agent-socket-direct'.
//
// Token-asymmetry (Cookbook §8.5.1):
//   - /host-bridge/v1/execute-tool accepts ONLY the per-plugin handshake JWT.
//   - Static MC_AGENT_TOKEN-style fallbacks are NOT supported on this endpoint.
//   → This client requires a HandshakeTokenStore (no static-token alternative).
//
// Error-shape (per agent #~05:47):
//   {code, message} — NO retryable/retryHint field. Common codes:
//     permission_denied, not_found, validation_failed, execution_error, timeout
//
// Plugin-Author-API (v0.7.1+):
//
//   import {
//     createHandshakeTokenStore,
//     createReverseCallClient,
//   } from '@nexus-mindgarden/plugin-bridge-foundation/auth'
//
//   const tokenStore = createHandshakeTokenStore()
//   const app = createBridgeApp({ ..., handshakeTokenStore: tokenStore })
//
//   const reverseCall = createReverseCallClient({
//     hostEndpoint: 'http://127.0.0.1:3400',
//     tokenStore,
//   })
//
//   // Generic — for any allowlisted tool:
//   const res = await reverseCall.executeTool('image.remove_background', {
//     image_base64: srcB64,
//     mime: 'image/png',
//   })
//   // res = ExecuteToolResponse — caller reads res.value or res.metadata.<field>
//
//   // Typed convenience for image-tools (handles metadata.image_base64 extraction):
//   const img = await reverseCall.executeImageTool('image.generate', {
//     prompt: 'pixel-art forest tile',
//     width: 256,
//     height: 256,
//   })
//   // img.image_base64 typed-extract, no metadata-vs-value guessing

import type { HandshakeTokenStore } from './handshake-token-store.js'

/**
 * Canonical allowlist of tool-prefixes accepted by the reverse-call endpoint
 * `POST /host-bridge/v1/execute-tool`. Source: agent #~05:47 (Q3),
 * post-commit `3afd16a` (2026-05-31).
 *
 * Note: `agent.complete` is NOT on this allowlist — it routes via the
 * dedicated `/agent/complete` HTTP endpoint (see `createAgentComplete` with
 * `transport: 'agent-socket-direct'`).
 */
export const REVERSE_CALL_TOOL_PREFIXES = [
  'projects.',
  'contacts.',
  'calendar.',
  'notes.',
  'attachments.',
  'image.',
] as const

export type ReverseCallToolPrefix = (typeof REVERSE_CALL_TOOL_PREFIXES)[number]

/**
 * `ExecuteToolResponse` discriminated by `ok`. The host returns this
 * shape for any reverse-call. For tool-specific structured data, read
 * `metadata.<field>` — `value` is typically a human-readable summary
 * (e.g. for image-tools, "Removed the background → 512×512 PNG").
 */
export type ExecuteToolResponse =
  | {
      ok: true
      value: unknown
      metadata?: Record<string, unknown>
    }
  | {
      ok: false
      error: ExecuteToolErrorBody
    }

/**
 * Error shape per agent #~05:47: no `retryable`, no `retryHint` —
 * just code + message. Common codes (Drift #103 aligned):
 *  - `permission_denied` — tool not on allowlist
 *  - `not_found` — unknown tool-name
 *  - `validation_failed` — args don't match tool's schema
 *  - `execution_error` — host-side failure during tool-invoke
 *  - `timeout` — tool exceeded host's timeout budget
 */
export interface ExecuteToolErrorBody {
  code: string
  message: string
}

/**
 * Foundation-emitted error codes (vs host-emitted in ExecuteToolErrorBody.code):
 *  - `no_handshake_yet` — tokenStore.current() threw (no handshake received)
 *  - `transport_failure` — fetch threw (ECONNREFUSED, abort, ...)
 *  - `invalid_response` — response body not valid JSON or not ExecuteToolResponse
 *  - `http_error` — non-2xx without parseable error envelope
 *  - `forbidden_prefix` — toolName doesn't match REVERSE_CALL_TOOL_PREFIXES (client-side guard)
 *
 * Plus all host-emitted codes from ExecuteToolErrorBody (permission_denied,
 * not_found, validation_failed, execution_error, timeout, ...) — surfaced
 * verbatim from response body.
 */
export class ReverseCallError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly httpStatus?: number,
    public readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'ReverseCallError'
  }
}

export interface CreateReverseCallClientOptions {
  /**
   * Host base URL (e.g. `http://127.0.0.1:3400` — Theseus' agent-socket host).
   * Foundation appends `/host-bridge/v1/execute-tool` automatically.
   */
  hostEndpoint: string

  /**
   * Token-store providing the per-plugin handshake JWT for the Bearer header.
   * Use `createHandshakeTokenStore()` + pass to `BridgeAppOptions.handshakeTokenStore`
   * so the token is auto-captured at handshake-time.
   */
  tokenStore: HandshakeTokenStore

  /**
   * Optional advisory header. Host validates `pluginId` from the Bearer JWT
   * (the token-bound activation wins); this header is purely a debug-hint.
   * Per agent #~05:47: "advisory-only — bestätigt".
   */
  sourcePlugin?: string

  /**
   * Optional X-Request-Id for distributed-tracing. Foundation passes through.
   * If absent, the host generates one.
   */
  requestId?: string

  /**
   * Custom fetch-impl. Default uses globalThis.fetch (Node 20+ / Browser).
   */
  fetch?: typeof fetch

  /**
   * Client-side guard: enforce that toolName starts with one of the
   * canonical REVERSE_CALL_TOOL_PREFIXES. Throws `forbidden_prefix` before
   * the network call when violated. Defaults to `true` (fail-fast). Set to
   * `false` if you're calling against a host with extended allowlist.
   */
  enforcePrefixGuard?: boolean
}

/**
 * Typed result for image-tool invocations. Foundation extracts the PNG
 * bytes from `metadata.image_base64` (NOT `value` which is a human-readable
 * description, base64-free). Per agent #4399 wire-clarification.
 */
export interface ImageToolResult {
  image_base64: string
  mime: string
  width: number
  height: number
  seed?: number
  backend?: string
}

export interface ReverseCallClient {
  /**
   * Generic reverse-call. Returns the full ExecuteToolResponse — caller
   * reads `.value` or `.metadata.<field>` depending on the tool's shape.
   *
   * Throws `ReverseCallError` on transport failures, schema mismatches,
   * client-side prefix-guard violations, or `no_handshake_yet`.
   *
   * Does NOT throw on host-side `{ ok: false, error }` envelopes —
   * those are returned as-is for the caller to handle.
   */
  executeTool(toolName: string, args: unknown): Promise<ExecuteToolResponse>

  /**
   * Typed wrapper for `image.*` tools. Extracts `metadata.image_base64`
   * into a flat `ImageToolResult` shape (no metadata-vs-value guessing).
   *
   * Throws `ReverseCallError('invalid_response')` if the response is
   * `ok: true` but `metadata.image_base64` is missing/non-string.
   * Throws `ReverseCallError(<host-code>)` if the response is `ok: false`.
   */
  executeImageTool(
    toolName: 'image.generate' | 'image.remove_background' | string,
    args: unknown,
  ): Promise<ImageToolResult>
}

/**
 * Factory for the canonical reverse-call client.
 *
 * @since v0.7.1
 */
export function createReverseCallClient(
  opts: CreateReverseCallClientOptions,
): ReverseCallClient {
  const baseEndpoint = opts.hostEndpoint.replace(/\/$/, '')
  const url = `${baseEndpoint}/host-bridge/v1/execute-tool`
  const fetchImpl = opts.fetch ?? globalThis.fetch
  const enforcePrefixGuard = opts.enforcePrefixGuard ?? true

  const executeTool = async (
    toolName: string,
    args: unknown,
  ): Promise<ExecuteToolResponse> => {
    // Client-side prefix-guard (fail-fast before network)
    if (enforcePrefixGuard) {
      const matchesPrefix = REVERSE_CALL_TOOL_PREFIXES.some((p) =>
        toolName.startsWith(p),
      )
      if (!matchesPrefix) {
        throw new ReverseCallError(
          'forbidden_prefix',
          `Tool "${toolName}" does not match REVERSE_CALL_TOOL_PREFIXES. ` +
            `Allowed: ${REVERSE_CALL_TOOL_PREFIXES.join(', ')}. ` +
            `Disable with enforcePrefixGuard: false if you intend to call extended-allowlist tools.`,
        )
      }
    }

    // Resolve handshake-token (may throw 'no_handshake_yet')
    let token: string
    try {
      token = await opts.tokenStore.current()
    } catch (err) {
      throw new ReverseCallError(
        'no_handshake_yet',
        `tokenStore.current() failed: ${(err as Error).message}`,
        undefined,
        err,
      )
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    }
    if (opts.sourcePlugin) headers['X-Source-Plugin'] = opts.sourcePlugin
    if (opts.requestId) headers['X-Request-Id'] = opts.requestId

    let res: Response
    try {
      res = await fetchImpl(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          tool: toolName,
          args, // ← canonical: key is "args", NOT "arguments"
        }),
      })
    } catch (err) {
      throw new ReverseCallError(
        'transport_failure',
        `reverse-call ${toolName} transport failure: ${(err as Error).message}`,
        undefined,
        err,
      )
    }

    let body: unknown
    try {
      body = await res.json()
    } catch (err) {
      throw new ReverseCallError(
        'invalid_response',
        `reverse-call ${toolName} response is not valid JSON (HTTP ${res.status}): ${(err as Error).message}`,
        res.status,
        err,
      )
    }

    // Validate envelope shape — defence against silently-malformed responses
    if (!body || typeof body !== 'object') {
      throw new ReverseCallError(
        'invalid_response',
        `reverse-call ${toolName} response is not an object (HTTP ${res.status})`,
        res.status,
      )
    }
    const envelope = body as Record<string, unknown>
    if (typeof envelope.ok !== 'boolean') {
      throw new ReverseCallError(
        'invalid_response',
        `reverse-call ${toolName} response missing 'ok' boolean (HTTP ${res.status})`,
        res.status,
      )
    }

    // Pass through the host-shaped response (ok:true with value+metadata,
    // OR ok:false with error). Caller handles error-envelope discrimination.
    if (!envelope.ok) {
      // For non-2xx without parseable error envelope, surface HTTP context
      if (!res.ok && !envelope.error) {
        throw new ReverseCallError(
          'http_error',
          `reverse-call ${toolName} HTTP ${res.status} without error envelope`,
          res.status,
        )
      }
      return {
        ok: false,
        error: envelope.error as ExecuteToolErrorBody,
      }
    }

    const success: ExecuteToolResponse = {
      ok: true,
      value: envelope.value,
    }
    if (envelope.metadata && typeof envelope.metadata === 'object') {
      success.metadata = envelope.metadata as Record<string, unknown>
    }
    return success
  }

  const executeImageTool = async (
    toolName: string,
    args: unknown,
  ): Promise<ImageToolResult> => {
    const res = await executeTool(toolName, args)
    if (!res.ok) {
      throw new ReverseCallError(
        res.error.code,
        `reverse-call ${toolName} returned error: ${res.error.message}`,
      )
    }
    const meta = res.metadata
    if (!meta || typeof meta.image_base64 !== 'string' || meta.image_base64.length === 0) {
      throw new ReverseCallError(
        'invalid_response',
        `reverse-call ${toolName}: response.metadata.image_base64 is missing or empty. ` +
          `(value field is human-readable description — NOT the PNG bytes; check host wired metadata correctly)`,
      )
    }
    const result: ImageToolResult = {
      image_base64: meta.image_base64,
      mime: typeof meta.mime === 'string' ? meta.mime : 'image/png',
      width: typeof meta.width === 'number' ? meta.width : 0,
      height: typeof meta.height === 'number' ? meta.height : 0,
    }
    if (typeof meta.seed === 'number') result.seed = meta.seed
    if (typeof meta.backend === 'string') result.backend = meta.backend
    return result
  }

  return {
    executeTool,
    executeImageTool,
  }
}
