import { type KeyLike } from 'jose';
import { HostKeyRegistry } from '../auth/host-keys.js';
export interface MintTokenOptions {
    pluginId: string;
    hostId: string;
    tenantId: string;
    userId: string;
    scopes?: string[];
    /** JWT-Lifetime. Default '1h'. */
    expiresIn?: string;
    /** Override `iss`-claim. Default = hostId. */
    iss?: string;
    /** Override `sub`-claim. Default = pluginId. */
    sub?: string;
    /** Override `jti`-claim. Default = random hex string. */
    jti?: string;
}
export interface TestRegistryHandle {
    /** Configured registry with bootstrap-host pre-approved. */
    registry: HostKeyRegistry;
    /** Public-Key PEM that was registered. */
    publicKeyPem: string;
    /** Mint a JWT signed by the registry's host private key. */
    mintToken: (opts: Omit<MintTokenOptions, 'hostId'>) => Promise<string>;
    /** Raw private key (for tests that mint custom tokens themselves). */
    privateKey: KeyLike;
}
export interface BuildTestRegistryOptions {
    /** Host-ID die in der Registry registriert wird. Default 'teammind'. */
    hostId?: string;
    /** Wenn true (default), bootstrap-host wird mit autoAccept=true active. */
    autoAccept?: boolean;
}
/**
 * Generates an Ed25519 keypair, builds a HostKeyRegistry with bootstrap-host,
 * returns the registry + a `mintToken()` helper that signs JWTs against the
 * generated private key. Ready für end-to-end Foundation tests.
 */
export declare function buildTestRegistry(opts?: BuildTestRegistryOptions): Promise<TestRegistryHandle>;
/**
 * Mint a Bridge-JWT with the given private key + claims. Returns Bearer-Token-
 * compatible JWT string.
 */
export declare function mintTestBridgeToken(privateKey: KeyLike, opts: MintTokenOptions): Promise<string>;
//# sourceMappingURL=index.d.ts.map