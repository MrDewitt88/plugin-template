// @nexus/plugin-bridge-foundation — Plugin-Bridge HTTP-Server Foundation
//
// Re-exports public API. Sub-paths verfügbar:
//   - @nexus/plugin-bridge-foundation       (this index — server + types)
//   - @nexus/plugin-bridge-foundation/auth  (jwt + host-keys-registry)
//   - @nexus/plugin-bridge-foundation/manifest (loader + hash)

export { createBridgeApp, type BridgeAppOptions } from './server.js'
export * from './types.js'

// Re-export auth + manifest for one-stop import
export {
  BridgeTokenError,
  buildHostRecordStatus,
  fingerprintPublicKey,
  HostKeyRegistry,
  InMemoryHostKeyRepo,
  JsonFileHostKeyRepo,
  verifyAuthorizationHeader,
  verifyBridgeToken,
  type HostKeyRepo,
  type HostKeyResolver,
  type JsonFileHostKeyRepoOptions,
  type RegisterHostInput,
  type RegisterResult,
  type RegistryOptions,
} from './auth/index.js'

export { computeManifestHash, loadManifest, ManifestError, validateManifest } from './manifest/index.js'
