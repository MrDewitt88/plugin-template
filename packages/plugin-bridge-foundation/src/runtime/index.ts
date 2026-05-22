// @nexus-mindgarden/plugin-bridge-foundation/runtime — Browser-side helpers for
// plugin custom-element bundles (Svelte web-components, lit-elements, vanilla
// custom-elements, etc.) running INSIDE a host-app UI shell.
//
// `callMcp()` provides a canonical request/response pattern for plugin-UI
// bundles to dispatch MCP-tool calls back through the host's IPC layer.
// Replaces ad-hoc per-plugin CustomEvent-naming with one shared wire-shape.
//
// Wire-Contract: agent (Luma) chatbus msg #607 design + wiz-mind msg #614
// vote-of-2-consumers-trigger. Host-side (mymind) catches `plugin:mcp-call`,
// validates the qualified-name's namespace against the dispatching plugin's
// pluginId (cross-plugin-attack-guard), routes via existing IPC to the
// plugin-bridge, then dispatches `plugin:mcp-response` with the matching
// request_id.
//
// Error-shape mirrors Drift #103 canonical `{ ok: false, code, message? }`.
//
// **This module is browser-runtime** — it uses `crypto.randomUUID`,
// `CustomEvent`, `EventTarget`, `HTMLElement`. Node 20+ provides all of these
// natively, so the module is safely importable in node-vitest tests too.

export const PLUGIN_MCP_CALL_EVENT = 'plugin:mcp-call' as const
export const PLUGIN_MCP_RESPONSE_EVENT = 'plugin:mcp-response' as const

/**
 * Actor-class for the call's authorization-context. `'user'` = user-initiated
 * action (default-actor-class semantics); `'kiara'` = system/agent-initiated
 * (e.g. autonomous Kiara persona-actions in mymind). Optional — when omitted
 * the host applies its default-actor-class policy.
 *
 * v0.6.1 contract: agent (Luma) msg #607 + wiz-mind msg #614.
 */
export type PluginMcpActorClass = 'user' | 'kiara'

/**
 * The `plugin:mcp-call` CustomEvent.detail shape. Emitted by plugin-bundles.
 *
 * `actor_class` is optional (v0.6.1+) — when omitted, the host applies its
 * default-actor-class policy. When set, it propagates to the bridge auth-context
 * for downstream permission-checks (e.g. some tools may be `'user'`-only).
 */
export interface PluginMcpCallDetail {
  request_id: string
  qualified_name: string
  arguments: unknown
  actor_class?: PluginMcpActorClass
}

/**
 * The `plugin:mcp-response` CustomEvent.detail shape. Emitted by the host-app
 * after routing the call to the plugin-bridge. Discriminated by `ok`.
 */
export type PluginMcpResponseDetail<T = unknown> =
  | { request_id: string; ok: true; result: T }
  | { request_id: string; ok: false; code: string; message?: string }

/**
 * Optional per-call options for `callMcp()` (v0.6.1+).
 *
 * Both fields are additive — `callMcp(mount, name, args)` (3-arg form) remains
 * fully supported and produces identical wire-output to `callMcp(mount, name, args, {})`.
 */
export interface CallMcpOptions {
  /**
   * Propagated as `actor_class` in the request-detail. Optional — when omitted,
   * the host applies its default-actor-class policy. Set to `'kiara'` for
   * autonomous-agent-initiated calls (e.g. background tasks), `'user'` for
   * explicit user-action mirroring.
   */
  actorClass?: PluginMcpActorClass

  /**
   * Per-call timeout in milliseconds. When the host does not dispatch a
   * matching `plugin:mcp-response` within this window, the Promise rejects
   * with `CallMcpError('timeout')`. Defaults to 30000ms (30 seconds) — sane
   * for typical tools, override for known-slow operations (e.g. PDF-export)
   * or known-fast operations (e.g. cache-hit list).
   */
  timeoutMs?: number
}

/**
 * Default timeout for callMcp() when `options.timeoutMs` is unset.
 * Exported so consumers can reference it for parity with their own defaults.
 */
export const CALL_MCP_DEFAULT_TIMEOUT_MS = 30_000 as const

/**
 * Curried-form return-type from `createCallMcpDispatcher()`.
 *
 * v0.6.1+ accepts an optional 3rd `options` argument matching `callMcp()`'s
 * 4th argument. 2-arg `(qualifiedName, args)` form remains supported.
 */
export type CallMcpDispatcher = <T = unknown>(
  qualifiedName: string,
  args: unknown,
  options?: CallMcpOptions,
) => Promise<T>

/**
 * Thrown by `callMcp()` when the host returns `{ ok: false, code }`, when
 * the runtime is missing required globals, or when the per-call timeout
 * elapses without a matching response.
 *
 * `code` maps to Drift #103 canonical error-codes plus three Foundation-emitted
 * codes:
 *   - `crypto_unavailable` — `crypto.randomUUID` missing (insecure context)
 *   - `timeout` — `options.timeoutMs` elapsed without matching response (v0.6.1+)
 *   - host-emitted codes (e.g. `tool_not_found`, `insufficient_scope`,
 *     `forbidden_namespace`)
 */
export class CallMcpError extends Error {
  readonly code: string
  constructor(code: string, message?: string) {
    super(message ?? code)
    this.code = code
    this.name = 'CallMcpError'
  }
}

/**
 * Dispatch an MCP-tool call from a plugin custom-element bundle. Returns a
 * Promise that resolves with the tool's result on `{ ok: true }` or rejects
 * with a `CallMcpError` on `{ ok: false }`.
 *
 * The host-app (mymind-side) catches `plugin:mcp-call`, validates that the
 * qualified-name's namespace matches the dispatching plugin's pluginId
 * (cross-plugin-attack-guard), routes via existing IPC to the plugin-bridge,
 * then dispatches `plugin:mcp-response` with the matching request_id.
 *
 * @param mount - The plugin's custom-element root (or any DOM-ancestor of it).
 *   Typically `this` inside a Svelte custom-element, or `this.shadowRoot?.host`.
 * @param qualifiedName - Fully-qualified tool-name (e.g. "wizmind.session.start").
 *   Namespace MUST match the plugin's pluginId — host enforces this guard.
 * @param args - Tool-specific arguments (forwarded as-is to the bridge).
 * @param options - Optional per-call options (v0.6.1+):
 *   - `actorClass`: propagated as `actor_class` in the request-detail;
 *     when omitted, host applies its default-actor-class policy
 *   - `timeoutMs`: per-call timeout; defaults to `CALL_MCP_DEFAULT_TIMEOUT_MS`
 *     (30000ms); on elapse rejects with `CallMcpError('timeout')`
 * @returns Promise<T> resolving with the tool's result, or rejecting with
 *   CallMcpError. T defaults to `unknown`; pass an explicit type-arg for
 *   tool-specific result-shape.
 *
 * @example
 * // Basic 3-arg form (v0.6.0+):
 * import { callMcp } from '@nexus-mindgarden/plugin-bridge-foundation/runtime'
 *
 * const result = await callMcp<{ session_id: string }>(
 *   this,
 *   'wizmind.session.start',
 *   { campaign_id: 'c_abc' }
 * )
 *
 * @example
 * // 4-arg form with options (v0.6.1+):
 * const pdf = await callMcp<{ pdf_url: string }>(
 *   this,
 *   'mind-canva.export.pdf',
 *   { layout_id: 'l_xyz' },
 *   { actorClass: 'kiara', timeoutMs: 60_000 }  // kiara-actor, 60s timeout for export
 * )
 */
export function callMcp<T = unknown>(
  mount: HTMLElement,
  qualifiedName: string,
  args: unknown,
  options: CallMcpOptions = {},
): Promise<T> {
  if (
    typeof globalThis.crypto === 'undefined' ||
    typeof globalThis.crypto.randomUUID !== 'function'
  ) {
    return Promise.reject(
      new CallMcpError(
        'crypto_unavailable',
        'crypto.randomUUID is required for callMcp; browser too old or non-secure context (must be https or localhost)',
      ),
    )
  }
  const request_id = globalThis.crypto.randomUUID()
  const timeoutMs = options.timeoutMs ?? CALL_MCP_DEFAULT_TIMEOUT_MS
  return new Promise<T>((resolve, reject) => {
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null

    const cleanup = (): void => {
      mount.removeEventListener(PLUGIN_MCP_RESPONSE_EVENT, onResponse as EventListener)
      if (timeoutHandle !== null) {
        clearTimeout(timeoutHandle)
        timeoutHandle = null
      }
    }

    const onResponse = (e: Event): void => {
      const detail = (e as CustomEvent<PluginMcpResponseDetail<T>>).detail
      if (!detail || detail.request_id !== request_id) {
        // Not our request (multiple in-flight calls share the same listener target)
        return
      }
      cleanup()
      if (detail.ok) {
        resolve(detail.result)
      } else {
        reject(new CallMcpError(detail.code, detail.message))
      }
    }

    // Schedule timeout if positive; non-positive (0 / negative) disables timeout
    // (caller opt-out via { timeoutMs: 0 } — useful for long-running streams).
    if (timeoutMs > 0 && Number.isFinite(timeoutMs)) {
      timeoutHandle = setTimeout(() => {
        cleanup()
        reject(
          new CallMcpError(
            'timeout',
            `plugin:mcp-call '${qualifiedName}' timed out after ${timeoutMs}ms (request_id=${request_id})`,
          ),
        )
      }, timeoutMs)
    }

    mount.addEventListener(PLUGIN_MCP_RESPONSE_EVENT, onResponse as EventListener)

    const detail: PluginMcpCallDetail = {
      request_id,
      qualified_name: qualifiedName,
      arguments: args,
    }
    // Spread-omit when undefined — matches host-side parser pattern (msg #619
    // line ~614: spread-omitted when actor_class not 'user'|'kiara')
    if (options.actorClass !== undefined) {
      detail.actor_class = options.actorClass
    }

    mount.dispatchEvent(
      new CustomEvent<PluginMcpCallDetail>(PLUGIN_MCP_CALL_EVENT, {
        detail,
        bubbles: true, // Allow ancestor host-shell to catch it
        composed: true, // Cross shadow-DOM boundaries
      }),
    )
  })
}

/**
 * Curried form of `callMcp()` — returns a dispatcher bound to a specific mount.
 * Useful for components that issue multiple MCP-calls (avoids re-passing mount).
 *
 * Accepts an optional 3rd `options` argument matching `callMcp()`'s 4th
 * argument (v0.6.1+).
 *
 * @example
 * import { createCallMcpDispatcher } from '@nexus-mindgarden/plugin-bridge-foundation/runtime'
 *
 * const mcp = createCallMcpDispatcher(this)
 * await mcp('wizmind.session.start', { campaign_id: 'c_abc' })
 * await mcp('wizmind.scene.advance', { scene_id: 's_xyz' })
 * await mcp('mind-canva.export.pdf', { layout_id }, { timeoutMs: 60_000 })
 */
export function createCallMcpDispatcher(mount: HTMLElement): CallMcpDispatcher {
  return <T = unknown>(
    qualifiedName: string,
    args: unknown,
    options?: CallMcpOptions,
  ): Promise<T> => callMcp<T>(mount, qualifiedName, args, options)
}
