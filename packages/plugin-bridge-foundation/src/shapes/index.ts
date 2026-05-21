// @nexus-mindgarden/plugin-bridge-foundation/shapes — Wire-shape-only subpath.
//
// Re-exports zod-schemas + inferred-types + canonical-constants for plugins that
// want drift-immunity types WITHOUT pulling the full Foundation runtime (hono +
// jose + storage-backends). Designed for two consumer-patterns:
//
//   1. In-Repo-Mirror consumers (e.g. kanban-style 56-LoC host-record-status.ts
//      mirror): replace the hand-rolled shape with `import type { HostRecordStatus }
//      from '@nexus-mindgarden/plugin-bridge-foundation/shapes'` — drift-immunity
//      with zero supply-chain-runtime-cost.
//
//   2. Helper-Lib consumers (e.g. markview-style Pfad-B adoption): import shape-
//      types + `buildHostRecordStatus()` runtime-helper-only from main subpath
//      `/auth`. The /shapes subpath is purely type/schema; tree-shake-friendly.
//
// **Scope intentionally narrow.** This subpath contains ONLY:
//   - Plugin-Manifest schemas + types (manifest.yaml wire-shape)
//   - Drift #206 host_record_status schema + canonical-constants
//   - All endpoint Request/Response Zod-schemas + inferred-types
//   - BridgeTokenClaims (JWT-wire-shape between Host and Bridge)
//
// **NOT** included (by design):
//   - `extractPublicKeyPem()` — runtime helper, lives in main subpath
//   - `HostKeyRecord` / `HostKeyStatus` — internal-storage shapes (may evolve
//     in v0.5.0 to support per-host `expectedIssuer`/`expectedAudience` for
//     multi-issuer bridges; mirror-consumers should NOT depend on these)
//   - `BridgeAuthContext` / `ToolHandler` / `HookHandler` / `RenderUiHandler` —
//     server-runtime types, not part of the wire-contract
//   - `createBridgeApp`, `HostKeyRegistry`, etc. — runtime building-blocks
//
// **Zero runtime-cost for type-only consumers:** all schema-exports require zod
// at runtime (since `HostRecordStatusSchema` is a Zod-object), but consumers
// who only `import type { ... }` pay zero runtime cost via TS-elision.

export {
  // --- Plugin-Manifest wire-shape ---
  PluginI18nStringSchema,
  type PluginI18nString,
  PluginRouteSchema,
  type PluginRoute,
  PluginMcpToolEntrySchema,
  type PluginMcpToolEntry,
  PluginModuleExtensionSchema,
  type PluginModuleExtension,
  PluginManifestSchema,
  type PluginManifest,

  // --- Bridge-Token (JWT) wire-shape ---
  // Claims-shape between Host (V8/markview/Theseus) and Plugin-Bridge.
  // Verification-runtime lives in main subpath as `verifyBridgeToken`.
  type BridgeTokenClaims,

  // --- Drift #206: Schema-Drift Signaling ---
  // Symmetric always-present host_record_status block emitted by /handshake
  // and /register-host responses. Source-of-Truth: msg #246 (oracle/plug-ea
  // symmetric contract), msg #237 (markview baseline), msg #242 (plug-elec).
  PLUGIN_REGISTRATION_SCHEMA_VERSION,
  BASELINE_OPTIONAL_REGISTER_FIELDS,
  HostRecordStatusSchema,
  type HostRecordStatus,

  // --- Bridge-Endpoint wire-shapes ---
  HandshakeRequestSchema,
  type HandshakeRequest,
  HandshakeResponseSchema,
  type HandshakeResponse,
  RegisterHostRequestSchema,
  type RegisterHostRequest,
  RegisterHostResponseSchema,
  type RegisterHostResponse,
  HealthResponseSchema,
  type HealthResponse,
  ExecuteToolRequestSchema,
  type ExecuteToolRequest,
  ExecuteToolResponseSchema,
  type ExecuteToolResponse,
  RenderUiRequestSchema,
  type RenderUiRequest,
  RenderUiResponseSchema,
  type RenderUiResponse,
  InvokeHookRequestSchema,
  type InvokeHookRequest,
  InvokeHookResponseSchema,
  type InvokeHookResponse,
} from '../types.js'
