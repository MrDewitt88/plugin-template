// Test utilities for Plugin-Provider unit/integration-Tests. Eliminiert
// hand-rolling von Ed25519-keypair-Generation + JWT-signing + Registry-
// Bootstrapping in jedem Plugin-Repo.
//
// Usage:
//   import { mintTestBridgeToken, buildTestRegistry } from '@nexus/plugin-bridge-foundation/testing'
//
//   const { registry, mintToken } = await buildTestRegistry({ hostId: 'teammind' })
//   const token = await mintToken({ tenantId: '...', userId: '...', scopes: ['read'] })
//   const res = await app.request('/plugin-bridge/v1/handshake', {
//     method: 'POST',
//     headers: { Authorization: `Bearer ${token}` },
//     body: JSON.stringify({ ... }),
//   })
import { exportSPKI, generateKeyPair, SignJWT } from 'jose';
import { HostKeyRegistry, InMemoryHostKeyRepo } from '../auth/host-keys.js';
/**
 * Generates an Ed25519 keypair, builds a HostKeyRegistry with bootstrap-host,
 * returns the registry + a `mintToken()` helper that signs JWTs against the
 * generated private key. Ready für end-to-end Foundation tests.
 */
export async function buildTestRegistry(opts = {}) {
    const hostId = opts.hostId ?? 'teammind';
    const autoAccept = opts.autoAccept !== false;
    const { publicKey, privateKey } = await generateKeyPair('EdDSA', { extractable: true });
    const publicKeyPem = await exportSPKI(publicKey);
    const repo = new InMemoryHostKeyRepo();
    const registry = new HostKeyRegistry(repo, { autoAccept });
    await registry.register({ host_id: hostId, public_key_pem: publicKeyPem });
    if (!autoAccept) {
        await registry.approve(hostId);
    }
    const mintToken = (mintOpts) => mintTestBridgeToken(privateKey, { ...mintOpts, hostId });
    return { registry, publicKeyPem, mintToken, privateKey };
}
/**
 * Mint a Bridge-JWT with the given private key + claims. Returns Bearer-Token-
 * compatible JWT string.
 */
export async function mintTestBridgeToken(privateKey, opts) {
    const claims = {
        iss: opts.iss ?? opts.hostId,
        sub: opts.sub ?? opts.pluginId,
        jti: opts.jti ?? randomHex(16),
        plugin_id: opts.pluginId,
        host_id: opts.hostId,
        tenant_id: opts.tenantId,
        user_id: opts.userId,
        scopes: opts.scopes ?? [],
    };
    return new SignJWT(claims)
        .setProtectedHeader({ alg: 'EdDSA' })
        .setIssuedAt()
        .setExpirationTime(opts.expiresIn ?? '1h')
        .sign(privateKey);
}
function randomHex(bytes) {
    const arr = new Uint8Array(bytes);
    if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
        globalThis.crypto.getRandomValues(arr);
    }
    else {
        for (let i = 0; i < bytes; i++)
            arr[i] = Math.floor(Math.random() * 256);
    }
    return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}
//# sourceMappingURL=index.js.map