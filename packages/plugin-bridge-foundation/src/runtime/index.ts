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
 * The `plugin:mcp-call` CustomEvent.detail shape. Emitted by plugin-bundles.
 */
export interface PluginMcpCallDetail {
  request_id: string
  qualified_name: string
  arguments: unknown
}

/**
 * The `plugin:mcp-response` CustomEvent.detail shape. Emitted by the host-app
 * after routing the call to the plugin-bridge. Discriminated by `ok`.
 */
export type PluginMcpResponseDetail<T = unknown> =
  | { request_id: string; ok: true; result: T }
  | { request_id: string; ok: false; code: string; message?: string }

/**
 * Curried-form return-type from `createCallMcpDispatcher()`.
 */
export type CallMcpDispatcher = <T = unknown>(
  qualifiedName: string,
  args: unknown,
) => Promise<T>

/**
 * Thrown by `callMcp()` when the host returns `{ ok: false, code }` or when
 * the runtime is missing required globals. `code` maps to Drift #103
 * canonical error-codes (e.g. `tool_not_found`, `insufficient_scope`,
 * `crypto_unavailable`).
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
 * @returns Promise<T> resolving with the tool's result, or rejecting with
 *   CallMcpError. T defaults to `unknown`; pass an explicit type-arg for
 *   tool-specific result-shape.
 *
 * @example
 * // Inside a Svelte 5 custom-element:
 * import { callMcp } from '@nexus-mindgarden/plugin-bridge-foundation/runtime'
 *
 * const result = await callMcp<{ session_id: string }>(
 *   this,
 *   'wizmind.session.start',
 *   { campaign_id: 'c_abc' }
 * )
 * console.log(result.session_id)
 */
export function callMcp<T = unknown>(
  mount: HTMLElement,
  qualifiedName: string,
  args: unknown,
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
  return new Promise<T>((resolve, reject) => {
    const onResponse = (e: Event): void => {
      const detail = (e as CustomEvent<PluginMcpResponseDetail<T>>).detail
      if (!detail || detail.request_id !== request_id) {
        // Not our request (multiple in-flight calls share the same listener target)
        return
      }
      mount.removeEventListener(PLUGIN_MCP_RESPONSE_EVENT, onResponse as EventListener)
      if (detail.ok) {
        resolve(detail.result)
      } else {
        reject(new CallMcpError(detail.code, detail.message))
      }
    }
    mount.addEventListener(PLUGIN_MCP_RESPONSE_EVENT, onResponse as EventListener)
    mount.dispatchEvent(
      new CustomEvent<PluginMcpCallDetail>(PLUGIN_MCP_CALL_EVENT, {
        detail: { request_id, qualified_name: qualifiedName, arguments: args },
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
 * @example
 * import { createCallMcpDispatcher } from '@nexus-mindgarden/plugin-bridge-foundation/runtime'
 *
 * const mcp = createCallMcpDispatcher(this)
 * await mcp('wizmind.session.start', { campaign_id: 'c_abc' })
 * await mcp('wizmind.scene.advance', { scene_id: 's_xyz' })
 */
export function createCallMcpDispatcher(mount: HTMLElement): CallMcpDispatcher {
  return <T = unknown>(qualifiedName: string, args: unknown): Promise<T> =>
    callMcp<T>(mount, qualifiedName, args)
}
