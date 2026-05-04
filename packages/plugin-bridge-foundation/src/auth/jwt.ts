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
      | 'invalid_claims',
    message: string,
  ) {
    super(message)
    this.name = 'BridgeTokenError'
  }
}

export interface HostKeyResolver {
  /**
   * Returnt PEM-encoded SPKI Public-Key für den gegebenen host_id. Wirft
   * `BridgeTokenError('host_not_registered')` / `host_pending` / `host_rejected`
   * wenn Host nicht active in Registry.
   */
  getActivePublicKey(hostId: string): Promise<string>
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

  const publicKeyPem = await resolver.getActivePublicKey(hostId)
  const key = await importSPKI(publicKeyPem, 'EdDSA')

  let payload
  try {
    const result = await jwtVerify(token, key, { algorithms: ['EdDSA'] })
    payload = result.payload
  } catch (err) {
    const msg = (err as Error).message ?? 'verify failed'
    if (msg.includes('expired')) {
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

  return payload as unknown as BridgeTokenClaims
}

/**
 * Hono-Middleware-Helper: extrahiert + verifiziert Bearer-Token aus
 * `Authorization: Bearer <jwt>` Header. Returns claims oder wirft.
 */
export async function verifyAuthorizationHeader(
  authHeader: string | undefined | null,
  resolver: HostKeyResolver,
): Promise<BridgeTokenClaims> {
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
    throw new BridgeTokenError('invalid_token', 'Authorization: Bearer header required')
  }
  const token = authHeader.slice('bearer '.length).trim()
  return verifyBridgeToken(token, resolver)
}
