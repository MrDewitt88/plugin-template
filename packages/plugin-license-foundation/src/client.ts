// createLicenseClient — produces a LicenseGate for the host's PluginManager.activate
// seam. Offline-first (consumes verified entitlement claims; no online call on the
// hot path), default-deny, with a host-policy last-known-good grace window.
//
// The host wires `resolveEntitlement` to yield the current entitlement — either
// from its already-verified NEXUS agent-JWT claims, or via verifyEntitlementJwt
// (this package) against JWKS. Revocation (ent_ver bump + SSE) is the host's
// reconcile job; this gate just answers "is this plugin entitled, right now?".

import type { Entitlement, LicenseGate, LicenseGateResult } from './types.js'

export interface CreateLicenseClientOptions {
  /**
   * Yields the current entitlement, or `null` when none is available (e.g.
   * offline and no token yet). May be sync or async. On `null`/throw the gate
   * falls back to last-known-good within the grace window.
   */
  resolveEntitlement: () => Promise<Entitlement | null> | Entitlement | null
  /**
   * Last-known-good offline grace (ms past the cached entitlement's `exp`). When
   * `resolveEntitlement` can't produce a fresh entitlement, a cached one is
   * trusted until `exp + graceMs`. Default `0` (no grace → only fresh claims pass).
   * Host-policy — NEXUS sends `exp` (short TTL), not a grace window.
   */
  graceMs?: number
  /**
   * When true, a gate that cannot resolve an entitlement AND has no usable cache
   * returns `{ ok: true }` instead of denying. Default `false` (DEFAULT-DENY).
   * Use only for dev / `enforce_entitlements=false` (issuance-before-enforcement).
   */
  failOpen?: boolean
  /** Clock (ms epoch). Default `Date.now`. Injectable for tests. */
  now?: () => number
}

export interface LicenseClient {
  gate: LicenseGate
  /** The cached last-known-good entitlement (for diagnostics / ent_ver reconcile). */
  lastKnownGood(): Entitlement | null
}

export function createLicenseClient(opts: CreateLicenseClientOptions): LicenseClient {
  const graceMs = opts.graceMs ?? 0
  const failOpen = opts.failOpen ?? false
  const now = opts.now ?? Date.now

  let cache: { entitlement: Entitlement; cachedAt: number } | null = null

  /** End of the trust window for a cached entitlement (ms epoch). */
  function trustUntil(c: { entitlement: Entitlement; cachedAt: number }): number {
    const base = c.entitlement.exp !== undefined ? c.entitlement.exp * 1000 : c.cachedAt
    return base + graceMs
  }

  function decide(entitlement: Entitlement, pluginId: string): LicenseGateResult {
    return entitlement.plugins.includes(pluginId)
      ? { ok: true }
      : { ok: false, reason: 'not_entitled', message: `plugin '${pluginId}' not in entitlement` }
  }

  const gate: LicenseGate = {
    async check(input) {
      let fresh: Entitlement | null = null
      let threw = false
      try {
        fresh = await opts.resolveEntitlement()
      } catch {
        threw = true
      }

      // Online path: a freshly-resolved entitlement is authoritative + cached.
      if (fresh) {
        cache = { entitlement: fresh, cachedAt: now() }
        return decide(fresh, input.pluginId)
      }

      // Offline path: fall back to last-known-good within the grace window.
      if (cache) {
        if (now() <= trustUntil(cache)) {
          return decide(cache.entitlement, input.pluginId)
        }
        // cache exists but is past exp + grace
        if (failOpen) return { ok: true }
        return {
          ok: false,
          reason: 'stale_entitlement',
          message: 'cached entitlement past exp + grace window',
        }
      }

      // No fresh entitlement and no cache at all.
      if (failOpen) return { ok: true }
      return {
        ok: false,
        reason: threw ? 'entitlement_error' : 'no_entitlement',
        message: threw
          ? 'resolveEntitlement threw and no cache available'
          : 'no entitlement available',
      }
    },
  }

  return { gate, lastKnownGood: () => cache?.entitlement ?? null }
}
