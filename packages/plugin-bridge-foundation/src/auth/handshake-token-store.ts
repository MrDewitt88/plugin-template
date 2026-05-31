// createHandshakeTokenStore — captures the inbound Bearer-token at
// /plugin-bridge/v1/handshake time so plugin-authors can hand it to
// outbound clients (createAgentComplete, createReverseCallClient).
//
// Context: Foundation v0.6.x's createBridgeApp validates incoming JWTs
// against host pubkeys (handshake-handler), but never caches the raw
// token-string for outbound use. Plugin-authors who want to make outbound
// calls (agent.complete via /agent/complete, image.* via reverse-call to
// /host-bridge/v1/execute-tool) need the same per-plugin handshake JWT as
// the Bearer for those calls.
//
// Plugin-Author-API (v0.7.1+):
//
//   import { createHandshakeTokenStore } from '@nexus-mindgarden/plugin-bridge-foundation/auth'
//   import { createBridgeApp } from '@nexus-mindgarden/plugin-bridge-foundation'
//
//   const tokenStore = createHandshakeTokenStore()
//
//   const app = createBridgeApp({
//     manifest,
//     registry,
//     toolHandlers: { ... },
//     handshakeTokenStore: tokenStore,  // NEW v0.7.1 opt-in: captures Bearer
//   })
//
//   // Then use anywhere in plugin:
//   const agentComplete = createAgentComplete({
//     bridgeEndpoint: 'http://127.0.0.1:3400/agent/complete',
//     transport: 'agent-socket-direct',
//     tokenResolver: () => tokenStore.current(),
//   })
//
// Cross-Ref: chatbus contracts thread 2026-05-31 ~05:19 + ~05:47 (agent's
// host-UX-contract: "Aktivieren = fertig. Kein Plugin baut je ein Token-
// Eingabefeld" — Foundation's tokenResolver is the auto-resolve path,
// MC_AGENT_TOKEN-style env-vars are Dev-Interim only).

/**
 * Read-only contract for token-store consumers.
 * Plugin-authors get this type as the result of `createHandshakeTokenStore()`
 * — but the read interface is what they pass to outbound clients.
 *
 * Implementation also carries an internal write-method `_capture()` used by
 * `createBridgeApp`'s handshake middleware. Not part of the public contract.
 */
export interface HandshakeTokenStore {
  /**
   * Returns the most recently captured handshake-Bearer. Called fresh on
   * every outbound request (so token-rotation is transparent — when the
   * host issues a new JWT at re-activation, the next outbound call uses it).
   *
   * Throws `Error('no_handshake_yet')` if called before the first
   * `/plugin-bridge/v1/handshake` POST has been received.
   */
  current(): Promise<string>

  /**
   * Timestamp of the last successful capture. `null` if never captured.
   * Useful for diagnostics + staleness-detection in monitoring dashboards.
   */
  lastUpdated(): Date | null
}

/**
 * Internal interface — Foundation uses `_capture(token)` to write the
 * incoming Bearer when the handshake-handler fires. Plugin-authors should
 * NOT call `_capture` themselves.
 */
export interface HandshakeTokenStoreImpl extends HandshakeTokenStore {
  /** @internal — wired by createBridgeApp middleware, do NOT call from user-code */
  _capture(token: string): void
}

export interface CreateHandshakeTokenStoreOptions {
  /**
   * Optional initial token-state (test-fixture only). Real usage relies on
   * Foundation's middleware-capture path; tests can seed a known value.
   */
  initialToken?: string

  /**
   * Optional initial captured-timestamp (test-fixture only). When provided
   * along with `initialToken`, sets the lastUpdated() return-value.
   * If only `initialToken` is provided, lastUpdated() returns the time of
   * factory-call.
   */
  initialTime?: Date
}

/**
 * Create a HandshakeTokenStore.
 *
 * Pass the result to `BridgeAppOptions.handshakeTokenStore` so Foundation's
 * handshake-middleware writes the inbound Bearer on every `/plugin-bridge/v1/handshake`
 * POST. Then pass the same instance to outbound clients (e.g. `createAgentComplete`'s
 * `tokenResolver`, `createReverseCallClient`'s `tokenStore`).
 *
 * The store is plain in-memory — no persistence. If your bridge restarts,
 * it waits for the next handshake from the host before outbound calls work.
 * (mymind is designed to re-handshake on bridge-restart anyway, so this is
 * not a real outage mode.)
 *
 * @since v0.7.1
 */
export function createHandshakeTokenStore(
  opts: CreateHandshakeTokenStoreOptions = {},
): HandshakeTokenStoreImpl {
  let token: string | null = opts.initialToken ?? null
  let updatedAt: Date | null =
    opts.initialToken !== undefined ? (opts.initialTime ?? new Date()) : null

  return {
    current: async () => {
      if (token === null) {
        throw new Error(
          'no_handshake_yet — handshakeTokenStore has not received a handshake yet. ' +
            'Ensure createBridgeApp was called with handshakeTokenStore: store, and ' +
            'wait for the host to POST /plugin-bridge/v1/handshake at least once.',
        )
      }
      return token
    },
    lastUpdated: () => updatedAt,
    _capture: (newToken: string) => {
      if (typeof newToken !== 'string' || newToken.length === 0) {
        // Silently ignore empty/invalid input — Foundation only calls _capture
        // after extracting from a valid Authorization: Bearer X header, so this
        // is defence-in-depth.
        return
      }
      token = newToken
      updatedAt = new Date()
    },
  }
}
