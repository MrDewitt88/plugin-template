// Plugin-License Foundation — shared types for the NEXUS entitlement model.
//
// Entitlements ride as signed claims on the NEXUS agent-JWT (verified offline
// via JWKS): `plugins: string[]` (entitled plugin slugs) + `ent_ver: int`
// (monotonic version, bumped on revocation → host reconciles via SSE). The host
// already verifies this JWT for app-licensing; this package adds the per-plugin
// LicenseGate + last-known-good offline grace + the entitle-on-activation call.

import { z } from 'zod'

/** Entitlement payload extracted from a verified NEXUS agent-JWT. */
export interface Entitlement {
  /** Entitled plugin slugs (the authoritative offline list mirror). */
  plugins: string[]
  /** Monotonic entitlements version (revocation / reconcile cursor). */
  ent_ver: number
  /** JWT `exp` (unix seconds) — the claim's freshness boundary, if known. */
  exp?: number
}

/** Zod schema — parses the relevant claims off a verified JWT payload. Lenient
 *  about extra claims (the agent-JWT carries more than just entitlements). */
export const EntitlementSchema = z
  .object({
    plugins: z.array(z.string()).default([]),
    ent_ver: z.number().int().nonnegative().default(0),
    // REQUIRED: a verified NEXUS agent-JWT always carries `exp` (short TTL). An
    // exp-less token → `invalid_claims` at verify, so the gate's offline grace is
    // always anchored on a signed freshness boundary (closes the exp-less edge).
    exp: z.number().int().positive(),
  })
  .passthrough()

/**
 * Why a license check failed (or `undefined` on success):
 *  - `not_entitled`       — entitlement resolved, plugin not in `plugins[]`.
 *  - `no_entitlement`     — could not resolve an entitlement and no valid cache (default-deny).
 *  - `stale_entitlement`  — only a cached entitlement exists and it is past `exp` + grace.
 *  - `purchase_required`  — entitle-on-activation returned 402 (paid, not purchased).
 *  - `entitlement_error`  — resolving/parsing the entitlement threw.
 */
export type LicenseDenyReason =
  | 'not_entitled'
  | 'no_entitlement'
  | 'stale_entitlement'
  | 'purchase_required'
  | 'entitlement_error'

export type LicenseGateResult =
  | { ok: true }
  | { ok: false; reason: LicenseDenyReason; message?: string }

/** The seam `@theseus/plugin-system` `PluginManager.activate` calls before activation. */
export interface LicenseGate {
  check(input: {
    pluginId: string
    userId?: string
    manifest?: unknown
  }): Promise<LicenseGateResult>
}
