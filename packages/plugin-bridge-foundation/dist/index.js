// @nexus/plugin-bridge-foundation — Plugin-Bridge HTTP-Server Foundation
//
// Re-exports public API. Sub-paths verfügbar:
//   - @nexus/plugin-bridge-foundation              (this index — server + types)
//   - @nexus/plugin-bridge-foundation/auth         (jwt + host-keys-registry)
//   - @nexus/plugin-bridge-foundation/manifest     (loader + hash)
//   - @nexus/plugin-bridge-foundation/observability (logger + metrics) [v0.2.0]
//   - @nexus/plugin-bridge-foundation/testing      (mintTestBridgeToken) [v0.2.0]
export { createBridgeApp, } from './server.js';
export { staticUiHandler } from './endpoints/static-ui.js';
export * from './types.js';
// Re-export auth + manifest for one-stop import
export { BridgeTokenError, buildHostRecordStatus, fingerprintPublicKey, HostKeyRegistry, InMemoryHostKeyRepo, JsonFileHostKeyRepo, SqliteHostKeyRepo, verifyAuthorizationHeader, verifyBridgeToken, } from './auth/index.js';
export { computeManifestHash, loadManifest, ManifestError, validateManifest } from './manifest/index.js';
//# sourceMappingURL=index.js.map