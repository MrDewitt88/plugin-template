// GET /plugin-bridge/v1/health — Liveness/Readiness-Probe.
// Hosts pollen das alle 5 Min für jede aktive Activation.
//
// `manifest_hash`-Field (Phase-3 Live-Re-Registration): Plugin signalisiert
// stable hash; Hosts cachen pro Activation; bei Diff trigger
// bridgeFetchManifest + reRegisterCapabilities.

import type { Context } from 'hono'

export interface HealthHandlerOptions {
  pluginVersion: string
  manifestHash: string
  /** Optional dynamic-status-callback. Default 'ok'. */
  statusFn?: () => 'ok' | 'degraded' | 'unhealthy'
  /** Optional last-active-timestamp. */
  lastActiveFn?: () => string | undefined
}

export function healthHandler(opts: HealthHandlerOptions) {
  return async (c: Context) => {
    const status = opts.statusFn?.() ?? 'ok'
    const lastActive = opts.lastActiveFn?.()
    const body: Record<string, unknown> = {
      status,
      version: opts.pluginVersion,
      manifest_hash: opts.manifestHash,
    }
    if (lastActive) body.last_active = lastActive
    return c.json(body)
  }
}
