// @nexus-mindgarden/plugin-bridge-foundation — Plugin-Bridge HTTP-Server Foundation
//
// Re-exports public API. Sub-paths verfügbar:
//   - @nexus-mindgarden/plugin-bridge-foundation              (this index — server + types)
//   - @nexus-mindgarden/plugin-bridge-foundation/auth         (jwt + host-keys-registry)
//   - @nexus-mindgarden/plugin-bridge-foundation/manifest     (loader + hash)
//   - @nexus-mindgarden/plugin-bridge-foundation/observability (logger + metrics) [v0.2.0]
//   - @nexus-mindgarden/plugin-bridge-foundation/testing      (mintTestBridgeToken) [v0.2.0]

export {
  createBridgeApp,
  type BridgeAppOptions,
  type BridgeObservabilityOptions,
} from './server.js'
export { staticUiHandler, type StaticUiHandlerOptions } from './endpoints/static-ui.js'
export * from './types.js'

// Re-export auth + manifest for one-stop import
export {
  BridgeTokenError,
  buildHostRecordStatus,
  fingerprintPublicKey,
  HostKeyRegistry,
  InMemoryHostKeyRepo,
  JsonFileHostKeyRepo,
  SqliteHostKeyRepo,
  verifyAuthorizationHeader,
  verifyBridgeToken,
  type HostKeyRepo,
  type HostKeyResolver,
  type HostVerification,
  type JsonFileHostKeyRepoOptions,
  type RegisterHostInput,
  type RegisterResult,
  type VerifyBridgeTokenOptions,
  type RegistryOptions,
  type SqliteHostKeyRepoDatabase,
  type SqliteHostKeyRepoOptions,
  type SqliteHostKeyRepoStatement,
} from './auth/index.js'

export {
  computeManifestHash,
  loadManifest,
  ManifestError,
  validateManifest,
} from './manifest/index.js'
