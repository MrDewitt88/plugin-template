// manifest_hash für Live-Re-Registration. Plugin-Provider berechnet hash
// des canonical-serialized manifest (z.B. JSON-stable-stringify) und
// reportet ihn in /health-Response. Hosts cachen lastManifestHash pro
// Activation; bei Diff trigger Re-Fetch + Re-Register-Capabilities.

import { createHash } from 'node:crypto'

/**
 * Stable JSON-serialize (sorted keys, deterministic). Identische Manifest-
 * Inhalte → identischer hash regardless object-key-order.
 */
function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return '[' + value.map(stableSerialize).join(',') + ']'
  }
  const keys = Object.keys(value as Record<string, unknown>).sort()
  const parts = keys.map(
    (k) => JSON.stringify(k) + ':' + stableSerialize((value as Record<string, unknown>)[k]),
  )
  return '{' + parts.join(',') + '}'
}

/**
 * SHA-256 hash des stable-serialized manifest. Hex-encoded ohne separators.
 * Wird in /health-Response als `manifest_hash` gesendet.
 */
export function computeManifestHash(manifest: unknown): string {
  return createHash('sha256').update(stableSerialize(manifest)).digest('hex')
}
