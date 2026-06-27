// Offline JWKS verification of a NEXUS agent-JWT → Entitlement.
//
// The host typically already verifies the agent-JWT (for app-licensing) and can
// pass the verified claims straight to createLicenseClient via resolveEntitlement.
// This helper is for callers that hold the raw JWT and want the Foundation to do
// the verify: alg-pinned EdDSA, JWKS-cached, optional iss/aud — default-deny by
// construction (any verify failure throws, never returns a permissive result).

import { jwtVerify, createRemoteJWKSet, type JWTVerifyGetKey } from 'jose'
import { EntitlementSchema, type Entitlement } from './types.js'

export class LicenseVerifyError extends Error {
  constructor(
    public readonly code: 'jwks_fetch_failed' | 'invalid_token' | 'expired' | 'invalid_claims',
    message: string,
  ) {
    super(message)
    this.name = 'LicenseVerifyError'
  }
}

export interface VerifyEntitlementJwtOptions {
  /** JWKS endpoint, e.g. `https://nexus.example/api/licenses/jwks.json`, OR a pre-built jose key-getter. */
  jwks: string | JWTVerifyGetKey
  /** Expected `iss` (e.g. `nexus.digitaleprojekte.at`). Enforced if set. */
  issuer?: string
  /** Expected `aud` (e.g. `nexus`). Enforced if set. */
  audience?: string
}

/** Build (and let the caller cache) a JWKS key-getter from a URL. */
export function remoteJwks(jwksUrl: string): JWTVerifyGetKey {
  return createRemoteJWKSet(new URL(jwksUrl))
}

/**
 * Verify a NEXUS agent-JWT against JWKS (alg-pinned EdDSA) and extract the
 * entitlement claims. Throws LicenseVerifyError on any failure — there is no
 * permissive return path (default-deny by construction).
 *
 * NOTE: pass a pre-built `remoteJwks(url)` getter (cached across calls) rather
 * than a URL string in a hot path, so JWKS isn't re-fetched per verify.
 */
export async function verifyEntitlementJwt(
  token: string,
  opts: VerifyEntitlementJwtOptions,
): Promise<Entitlement> {
  const keyGetter = typeof opts.jwks === 'string' ? remoteJwks(opts.jwks) : opts.jwks
  let payload: Record<string, unknown>
  try {
    const result = await jwtVerify(token, keyGetter, {
      algorithms: ['EdDSA'], // alg-pinned: never accept HS*/none/etc.
      ...(opts.issuer !== undefined ? { issuer: opts.issuer } : {}),
      ...(opts.audience !== undefined ? { audience: opts.audience } : {}),
    })
    payload = result.payload as Record<string, unknown>
  } catch (err) {
    const e = err as { code?: string; message?: string }
    const msg = e.message ?? 'verify failed'
    // Token-expiry first — most specific.
    if (e.code === 'ERR_JWT_EXPIRED' || /expired/i.test(msg)) {
      throw new LicenseVerifyError('expired', msg)
    }
    // JWKS unreachable / no key / timeout / transport — distinct from a bad token,
    // so the host can retry-later instead of treating it as token-integrity.
    if (
      e.code === 'ERR_JWKS_NO_MATCHING_KEY' ||
      e.code === 'ERR_JWKS_TIMEOUT' ||
      e.code === 'ERR_JWKS_MULTIPLE_MATCHING_KEYS' ||
      /jwks|key set|fetch failed|timed out|network|ENOTFOUND|ECONNREFUSED/i.test(msg)
    ) {
      throw new LicenseVerifyError('jwks_fetch_failed', msg)
    }
    throw new LicenseVerifyError('invalid_token', msg)
  }

  const parsed = EntitlementSchema.safeParse(payload)
  if (!parsed.success) {
    throw new LicenseVerifyError(
      'invalid_claims',
      `entitlement claims invalid: ${parsed.error.issues.map((i) => i.path.join('.')).join(', ')}`,
    )
  }
  return {
    plugins: parsed.data.plugins,
    ent_ver: parsed.data.ent_ver,
    ...(parsed.data.exp !== undefined ? { exp: parsed.data.exp } : {}),
  }
}
