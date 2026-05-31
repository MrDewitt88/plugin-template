// @nexus-mindgarden/granite-test — Granite-Floor test-coverage framework.
//
// Plugin-author-declared MCP-tool test-suites + chatbus-event reporter for
// Oracle's @floor aggregator. Out-of-the-box baseline for the September-Messe
// "100% of MCP-tools Granite-callable" cluster-goal (agent msg #693 ask,
// user-direktive approved 2026-05-24).
//
// **Pre-release status:** v0.0.1 skeleton. Full impl pending:
//   1. Oracle spec-freeze (2026-05-27, granite-floor.event.v1)
//   2. Decision-gate (wiz-mind + plug-elec adoption signals)
//   3. wiz-mind `@nexus-mindgarden/granite-pilot-runner` extract
//
// **Subpath exports:**
//   - `@nexus-mindgarden/granite-test`        (this — main API)
//   - `@nexus-mindgarden/granite-test/types`  (type-only re-exports, zero runtime)
//   - `@nexus-mindgarden/granite-test/reporter` (transport API)

export { defineGraniteToolTest, defineGraniteTestSuite } from './define-tool-test.js'
export {
  reportToCluster,
  ReportToClusterError,
  flushPending,
  resolveReporterConfig,
  type ResolvedReporterConfig,
} from './reporter.js'
export { buildEnumInjection, buildSystemPromptEnrichment } from './prompt-builder.js'

export {
  // Spec v1 constants
  GRANITE_FLOOR_EVENT_KIND,
  DEFAULT_MAX_LATENCY_MS,

  // Enums (schemas + inferred types)
  PersonaSchema,
  type Persona,
  ModeSchema,
  type Mode,
  OutcomeSchema,
  type Outcome,
  FailCategorySchema,
  type FailCategory,

  // Event-payload composites
  MultiturnTelemetrySchema,
  type MultiturnTelemetry,
  ReplayBundleCISchema,
  type ReplayBundleCI,
  ReplayBundleWildSchema,
  type ReplayBundleWild,
  ReplayBundleCIToolCallSchema,
  type ReplayBundleCIToolCall,
  ReplayBundleWildToolCallSchema,
  type ReplayBundleWildToolCall,
  ReplayBundleSchema,
  type ReplayBundle,
  GraniteFloorEventSchema,
  type GraniteFloorEvent,

  // Plugin-author config-shape
  type GraniteToolTestCase,
  type GraniteToolTest,
  type GraniteTestConfig,
  type GraniteTestConfigObject,

  // v0.0.7+ Tool-Count-Cap RFC additive shapes
  type ToolCountPolicy,

  // Reporter options
  type ReportToClusterOptions,
} from './types.js'
