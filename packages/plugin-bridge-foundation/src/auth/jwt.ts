// JWT-Verify für Bridge-Tokens. Hosts (V8/Theseus/etc.) signen Tokens mit
// Ed25519; Plugin verifiziert mit Host-Public-Key aus Registry.
//
// Token-Claims (Spec PLUGIN-BRIDGE-PROTOCOL.md):
//   iss, sub=pluginId, jti, iat, exp, plugin_id, host_id, tenant_id,
//   user_id, scopes
//
// Multi-Host: jeder Host hat eigenen Public-Key. JWT-Header `kid` oder
// Body-Field `host_id` identifiziert welchen Key zur Verification nutzen.
// Foundation nutzt host_id-claim (kein kid required) — matched MarkView/
// Theseus convention.

import { decodeJwt, importSPKI, jwtVerify } from 'jose'
import type { BridgeTokenClaims } from '../types.js'

export class BridgeTokenError extends Error {
  constructor(
    public readonly code:
      | 'invalid_token'
      | 'host_not_registered'
      | 'host_pending'
      | 'host_rejected'
      | 'expired'
      | 'invalid_claims'
      | 'invalid_issuer'
      | 'invalid_audience',
    message: string,
  ) {
    super(message)
    this.name = 'BridgeTokenError'
  }
}

/**
 * v0.9.0 — per-Host Verifikations-Kontext. Erlaubt issuer/audience pro Host zu
 * binden (markview #5345, Multi-Host: V8 vs Theseus vs FamilyMind mit je
 * eigenem iss/aud). `expected_issuer`/`expected_audience` fehlend → keine
 * Erzwingung (backward-compat).
 */
export interface HostVerification {
  public_key_pem: string
  expected_issuer?: string | null
  expected_audience?: string | null
}

export interface HostKeyResolver {
  /**
   * Returnt PEM-encoded SPKI Public-Key für den gegebenen host_id. Wirft
   * `BridgeTokenError('host_not_registered')` / `host_pending` / `host_rejected`
   * wenn Host nicht active in Registry.
   */
  getActivePublicKey(hostId: string): Promise<string>
  /**
   * v0.9.0 (optional) — returnt PEM + per-Host expected issuer/audience. Wenn
   * implementiert, nutzt `verifyBridgeToken` dies und erzwingt iss/aud sofern
   * gesetzt. Resolver ohne diese Methode → Fallback auf `getActivePublicKey`
   * (reine Signatur-Verifikation, kein iss/aud — exakt v0.8.x-Verhalten).
   * Wirft dieselben host_not_registered/pending/rejected-Fehler.
   */
  getHostVerification?(hostId: string): Promise<HostVerification>
}

export interface VerifyBridgeTokenOptions {
  /**
   * v0.9.0 — wenn true, MUSS das Token einen string-`aud`-Claim tragen (auch
   * wenn der Host kein `expected_audience` setzt). Default false.
   */
  requireAudience?: boolean
  /**
   * v0.9.0 — optionales Format-Gate für `host_id` (Defense-in-Depth, markview
   * #5345). Wenn gesetzt und der host_id-Claim matcht NICHT → invalid_claims,
   * bevor überhaupt ein Key-Lookup passiert.
   */
  hostIdFormat?: RegExp
}

/**
 * Verifiziert Bridge-Token. Ablauf:
 *   1. Decode JWT body (no-sig) → extract `host_id`
 *   2. Resolve Host-Public-Key via Registry
 *   3. Verify signature mit dem Key
 *   4. Validate Claims (alle pflicht-Felder vorhanden)
 *
 * Returns claims wenn valide, wirft BridgeTokenError sonst.
 */
export async function verifyBridgeToken(
  token: string,
  resolver: HostKeyResolver,
  options: VerifyBridgeTokenOptions = {},
): Promise<BridgeTokenClaims> {
  let pre: ReturnType<typeof decodeJwt>
  try {
    pre = decodeJwt(token)
  } catch {
    throw new BridgeTokenError('invalid_token', 'malformed JWT')
  }

  const hostId = (pre as { host_id?: unknown }).host_id
  if (typeof hostId !== 'string' || hostId.length === 0) {
    throw new BridgeTokenError('invalid_claims', 'host_id claim missing')
  }
  if (options.hostIdFormat && !options.hostIdFormat.test(hostId)) {
    throw new BridgeTokenError('invalid_claims', `host_id '${hostId}' fails format gate`)
  }

  // v0.9.0 — per-Host iss/aud binding wenn der Resolver es liefert; sonst
  // Fallback auf reine PEM-Verifikation (backward-compat mit v0.8.x-Resolvern).
  let publicKeyPem: string
  let expectedIssuer: string | undefined
  let expectedAudience: string | undefined
  if (resolver.getHostVerification) {
    const hv = await resolver.getHostVerification(hostId)
    publicKeyPem = hv.public_key_pem
    expectedIssuer = hv.expected_issuer ?? undefined
    expectedAudience = hv.expected_audience ?? undefined
  } else {
    publicKeyPem = await resolver.getActivePublicKey(hostId)
  }
  const key = await importSPKI(publicKeyPem, 'EdDSA')

  let payload
  try {
    const result = await jwtVerify(token, key, {
      algorithms: ['EdDSA'],
      ...(expectedIssuer !== undefined ? { issuer: expectedIssuer } : {}),
      ...(expectedAudience !== undefined ? { audience: expectedAudience } : {}),
    })
    payload = result.payload
  } catch (err) {
    const e = err as { code?: string; claim?: string; message?: string }
    const msg = e.message ?? 'verify failed'
    // jose: ERR_JWT_CLAIM_VALIDATION_FAILED carries `claim` (iss/aud/exp).
    if (e.claim === 'iss' || /issuer/i.test(msg)) {
      throw new BridgeTokenError('invalid_issuer', msg)
    }
    if (e.claim === 'aud' || /audience/i.test(msg)) {
      throw new BridgeTokenError('invalid_audience', msg)
    }
    if (e.code === 'ERR_JWT_EXPIRED' || /expired/i.test(msg)) {
      throw new BridgeTokenError('expired', msg)
    }
    throw new BridgeTokenError('invalid_token', msg)
  }

  // Validate required claims
  const required: Array<keyof BridgeTokenClaims> = [
    'iss',
    'sub',
    'jti',
    'plugin_id',
    'host_id',
    'tenant_id',
    'user_id',
  ]
  for (const claim of required) {
    if (typeof (payload as Record<string, unknown>)[claim] !== 'string') {
      throw new BridgeTokenError('invalid_claims', `missing claim: ${claim}`)
    }
  }
  if (!Array.isArray((payload as { scopes?: unknown }).scopes)) {
    throw new BridgeTokenError('invalid_claims', 'scopes claim must be array')
  }
  if (options.requireAudience && typeof (payload as { aud?: unknown }).aud !== 'string') {
    throw new BridgeTokenError(
      'invalid_audience',
      'aud claim required (requireAudience) but missing',
    )
  }

  return payload as unknown as BridgeTokenClaims
}

/**
 * Hono-Middleware-Helper: extrahiert + verifiziert Bearer-Token aus
 * `Authorization: Bearer <jwt>` Header. Returns claims oder wirft.
 */
export async function verifyAuthorizationHeader(
  authHeader: string | undefined | null,
  resolver: HostKeyResolver,
  options: VerifyBridgeTokenOptions = {},
): Promise<BridgeTokenClaims> {
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
    throw new BridgeTokenError('invalid_token', 'Authorization: Bearer header required')
  }
  const token = authHeader.slice('bearer '.length).trim()
  return verifyBridgeToken(token, resolver, options)
}
