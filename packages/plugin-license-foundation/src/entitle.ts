// Entitle-on-activation — the optional online step at plugin activation.
//
// `POST /api/licenses/entitlements/plugin { plugin_slug }` (Bearer=activation_token),
// idempotent. Free plugins → auto-grant (2xx). Paid plugins → 402 with
// `{ detail: { reason: 'purchase_required', … } }` (until shop-checkout exists).
// After a successful grant, the host refreshes entitlements (cache + SSE handle
// the rest) so the LicenseGate sees the new slug.

import type { LicenseGateResult } from './types.js'

export interface EntitlePluginOptions {
  /** Full entitle endpoint, e.g. `https://nexus.example/api/licenses/entitlements/plugin`. */
  endpoint: string
  /** Plugin slug to entitle (the NEXUS-canonical slug, e.g. `apex-2d`). */
  slug: string
  /** Device activation-token (Bearer) — the same credential used for getEntitlements. */
  activationToken: string
  /** Optional fetch override (tests / custom agent). Default global fetch. */
  fetchImpl?: typeof fetch
}

/**
 * Entitle a plugin on activation. Returns:
 *  - `{ ok: true }` on grant (free auto-grant, 2xx).
 *  - `{ ok: false, reason: 'purchase_required' }` on 402 (paid, not purchased) —
 *    deterministically mapped from `detail.reason === 'purchase_required'`.
 *  - `{ ok: false, reason: 'entitlement_error', message }` on any other failure.
 *
 * Never throws — always returns a LicenseGateResult (the activation seam wants a
 * decision, not an exception).
 */
export async function entitlePlugin(opts: EntitlePluginOptions): Promise<LicenseGateResult> {
  const fetchFn = opts.fetchImpl ?? fetch
  let res: Response
  try {
    res = await fetchFn(opts.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${opts.activationToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ plugin_slug: opts.slug }),
    })
  } catch (err) {
    return {
      ok: false,
      reason: 'entitlement_error',
      message: `entitle fetch failed: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  if (res.ok) return { ok: true }

  if (res.status === 402) {
    // Deterministic shape (nexus): { detail: { reason: 'purchase_required', message } }
    let reasonField: unknown
    let message: string | undefined
    try {
      const body = (await res.json()) as { detail?: { reason?: unknown; message?: unknown } }
      reasonField = body?.detail?.reason
      message = typeof body?.detail?.message === 'string' ? body.detail.message : undefined
    } catch {
      // ignore parse error — treat as purchase_required by status anyway
    }
    if (reasonField === 'purchase_required' || reasonField === undefined) {
      return { ok: false, reason: 'purchase_required', ...(message ? { message } : {}) }
    }
    return {
      ok: false,
      reason: 'entitlement_error',
      message: `402 with reason '${String(reasonField)}'`,
    }
  }

  return { ok: false, reason: 'entitlement_error', message: `entitle returned HTTP ${res.status}` }
}
