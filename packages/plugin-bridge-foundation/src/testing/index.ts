// Test utilities for Plugin-Provider unit/integration-Tests. Eliminiert
// hand-rolling von Ed25519-keypair-Generation + JWT-signing + Registry-
// Bootstrapping in jedem Plugin-Repo.
//
// Usage:
//   import { mintTestBridgeToken, buildTestRegistry } from '@nexus-mindgarden/plugin-bridge-foundation/testing'
//
//   const { registry, mintToken } = await buildTestRegistry({ hostId: 'teammind' })
//   const token = await mintToken({ tenantId: '...', userId: '...', scopes: ['read'] })
//   const res = await app.request('/plugin-bridge/v1/handshake', {
//     method: 'POST',
//     headers: { Authorization: `Bearer ${token}` },
//     body: JSON.stringify({ ... }),
//   })

import { exportSPKI, generateKeyPair, SignJWT, type KeyLike } from 'jose'
import { HostKeyRegistry, InMemoryHostKeyRepo } from '../auth/host-keys.js'

export interface MintTokenOptions {
  pluginId: string
  hostId: string
  tenantId: string
  userId: string
  scopes?: string[]
  /** JWT-Lifetime. Default '1h'. */
  expiresIn?: string
  /** Override `iss`-claim. Default = hostId. */
  iss?: string
  /** Override `sub`-claim. Default = pluginId. */
  sub?: string
  /** Override `jti`-claim. Default = random hex string. */
  jti?: string
}

export interface TestRegistryHandle {
  /** Configured registry with bootstrap-host pre-approved. */
  registry: HostKeyRegistry
  /** Public-Key PEM that was registered. */
  publicKeyPem: string
  /** Mint a JWT signed by the registry's host private key. */
  mintToken: (opts: Omit<MintTokenOptions, 'hostId'>) => Promise<string>
  /** Raw private key (for tests that mint custom tokens themselves). */
  privateKey: KeyLike
}

export interface BuildTestRegistryOptions {
  /** Host-ID die in der Registry registriert wird. Default 'teammind'. */
  hostId?: string
  /** Wenn true (default), bootstrap-host wird mit autoAccept=true active. */
  autoAccept?: boolean
}

/**
 * Generates an Ed25519 keypair, builds a HostKeyRegistry with bootstrap-host,
 * returns the registry + a `mintToken()` helper that signs JWTs against the
 * generated private key. Ready für end-to-end Foundation tests.
 */
export async function buildTestRegistry(
  opts: BuildTestRegistryOptions = {},
): Promise<TestRegistryHandle> {
  const hostId = opts.hostId ?? 'teammind'
  const autoAccept = opts.autoAccept !== false
  const { publicKey, privateKey } = await generateKeyPair('EdDSA', { extractable: true })
  const publicKeyPem = await exportSPKI(publicKey)

  const repo = new InMemoryHostKeyRepo()
  const registry = new HostKeyRegistry(repo, { autoAccept })
  await registry.register({ host_id: hostId, public_key_pem: publicKeyPem })
  if (!autoAccept) {
    await registry.approve(hostId)
  }

  const mintToken = (mintOpts: Omit<MintTokenOptions, 'hostId'>): Promise<string> =>
    mintTestBridgeToken(privateKey, { ...mintOpts, hostId })

  return { registry, publicKeyPem, mintToken, privateKey }
}

/**
 * Mint a Bridge-JWT with the given private key + claims. Returns Bearer-Token-
 * compatible JWT string.
 */
export async function mintTestBridgeToken(
  privateKey: KeyLike,
  opts: MintTokenOptions,
): Promise<string> {
  const claims: Record<string, unknown> = {
    iss: opts.iss ?? opts.hostId,
    sub: opts.sub ?? opts.pluginId,
    jti: opts.jti ?? randomHex(16),
    plugin_id: opts.pluginId,
    host_id: opts.hostId,
    tenant_id: opts.tenantId,
    user_id: opts.userId,
    scopes: opts.scopes ?? [],
  }
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'EdDSA' })
    .setIssuedAt()
    .setExpirationTime(opts.expiresIn ?? '1h')
    .sign(privateKey)
}

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes)
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(arr)
  } else {
    for (let i = 0; i < bytes; i++) arr[i] = Math.floor(Math.random() * 256)
  }
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('')
}
