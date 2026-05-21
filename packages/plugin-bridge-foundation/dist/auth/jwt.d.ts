import type { BridgeTokenClaims } from '../types.js';
export declare class BridgeTokenError extends Error {
    readonly code: 'invalid_token' | 'host_not_registered' | 'host_pending' | 'host_rejected' | 'expired' | 'invalid_claims';
    constructor(code: 'invalid_token' | 'host_not_registered' | 'host_pending' | 'host_rejected' | 'expired' | 'invalid_claims', message: string);
}
export interface HostKeyResolver {
    /**
     * Returnt PEM-encoded SPKI Public-Key für den gegebenen host_id. Wirft
     * `BridgeTokenError('host_not_registered')` / `host_pending` / `host_rejected`
     * wenn Host nicht active in Registry.
     */
    getActivePublicKey(hostId: string): Promise<string>;
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
export declare function verifyBridgeToken(token: string, resolver: HostKeyResolver): Promise<BridgeTokenClaims>;
/**
 * Hono-Middleware-Helper: extrahiert + verifiziert Bearer-Token aus
 * `Authorization: Bearer <jwt>` Header. Returns claims oder wirft.
 */
export declare function verifyAuthorizationHeader(authHeader: string | undefined | null, resolver: HostKeyResolver): Promise<BridgeTokenClaims>;
//# sourceMappingURL=jwt.d.ts.map