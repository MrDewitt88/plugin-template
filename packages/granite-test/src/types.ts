// @nexus-mindgarden/granite-test — Type definitions.
//
// Source-of-truth: Oracle's `docs/granite-floor-spec.md` v1 (chatbus msg #708).
// Spec-freeze pending 2026-05-27 (72h review-window). All types here track v1
// and are versioned via `GRANITE_FLOOR_EVENT_KIND` constant.
//
// Pre-release: this package ships in skeleton-form pending decision-gate
// (wiz-mind + plug-elec adoption signals). Once decision-gate hits, full
// runtime implementation lands.

import { z } from 'zod'

// --- Spec-versioned event-kind discriminator ---

/**
 * Canonical event-kind identifier per Oracle's spec v1.
 * Repos emit this as `event_kind` in every granite-test result event.
 */
export const GRANITE_FLOOR_EVENT_KIND = 'granite-floor.event.v1' as const

// --- Persona enum (spec v1, agent msg #701 dual-mode design) ---

/**
 * Persona-scope of a tool-call. Required field.
 * - `user` = User-Agent mymind-mode (User-Privileges)
 * - `admin` = Kiara-Persona mymind-mode (Admin-Privileges)
 * - `any` = persona-agnostic (default if plugin-author omits explicit setting)
 *
 * Oracle dashboard drills-down `Kiara-Admin pass-rate vs User-Agent pass-rate`
 * per tool. Disjoint buckets (plug-tmpl vote in Q#2, msg #713). Tools
 * defaulted to `any` are surfaced as "unclassified" — audit-trail for
 * cluster-wide persona-coverage progress to September-Messe.
 */
export const PersonaSchema = z.enum(['user', 'admin', 'any'])
export type Persona = z.infer<typeof PersonaSchema>

// --- Mode enum (spec v1) ---

/**
 * Test-run mode.
 * - `ci` = deterministic test-suite run (primary milestone-tracker)
 * - `wild` = real-world tool-call observed in mymind production (canary-supplement)
 *
 * Oracle dashboard computes milestone-percent from `ci` mode ONLY. Wild is
 * additive signal, can detect `silent-fail` / `schema-issue` / `hallucination`
 * but NOT `mismatched-args` (no `expected_*` available in wild).
 */
export const ModeSchema = z.enum(['ci', 'wild'])
export type Mode = z.infer<typeof ModeSchema>

// --- Outcome enum (spec v1) ---

/**
 * Pass/fail discriminator. Spec invariant: `fail` ⇒ `fail_category` non-null +
 * `fail_detail` (≤500 chars). `pass` ⇒ `fail_category` null.
 */
export const OutcomeSchema = z.enum(['pass', 'fail'])
export type Outcome = z.infer<typeof OutcomeSchema>

// --- Fail-category enum (6 fix in spec v1, new cats = v2) ---

/**
 * Why a tool-call failed. Closed enum in v1 — Oracle aggregator validates
 * against this exact set. New categories require spec v2 + aggregator-side
 * migration.
 *
 * - `schema-issue` — Granite output does not match the tool's Zod-input-schema
 * - `multiturn-state-loss` — state-context from step N missing in step N+1
 * - `hallucination` — Granite called a non-existent tool OR invented arguments
 * - `silent-fail` — no tool-call dispatched despite prompt explicitly asking
 * - `length-exceeded` — output exceeded max-token budget mid-call
 * - `latency-spike` — call took longer than max_latency_ms in case-config
 */
export const FailCategorySchema = z.enum([
  'schema-issue',
  'multiturn-state-loss',
  'hallucination',
  'silent-fail',
  'length-exceeded',
  'latency-spike',
])
export type FailCategory = z.infer<typeof FailCategorySchema>

// --- Multiturn telemetry (v1: single event per chain, per-step = v2) ---

export const MultiturnTelemetrySchema = z.object({
  step_count: z.number().int().positive(),
  failed_at_step: z.number().int().nonnegative().nullable(),
  expected_tools: z.array(z.string()),
})
export type MultiturnTelemetry = z.infer<typeof MultiturnTelemetrySchema>

// --- Replay-bundle (spec v1.1 discriminated union by mode) ---
//
// PII-trust-boundary: wild-mode events MUST hash user_prompt (PII-leak risk
// from real user input). CI-mode events MAY carry verbatim user_prompt
// (synthetic test-fixtures, no PII). Aggregator hard-rejects wild-mode
// events with verbatim user_prompt — runner-side enforcement required.
//
// Source: Oracle spec v1.1 (msg #716), agent PII-blocker resolution.

/**
 * CI-mode replay-bundle. Verbatim user_prompt allowed because test-cases
 * are author-curated synthetic fixtures (no real PII).
 */
export const ReplayBundleCISchema = z.object({
  system_prompt_hash: z.string(),
  user_prompt: z.string(), // verbatim — synthetic fixture, no PII
  granite_response: z.string(),
  tool_state_before: z.record(z.unknown()).optional(),
  tool_state_after: z.record(z.unknown()).optional(),
})
export type ReplayBundleCI = z.infer<typeof ReplayBundleCISchema>

/**
 * Wild-mode replay-bundle. user_prompt MUST be sha256-hashed before emit
 * to prevent PII leakage to the cluster aggregator. Optional `local_log_ref`
 * is an opaque pointer (e.g. `"diary:2026-05-24:42"`) — aggregator treats
 * as read-only display string, no resolve/fetch.
 */
export const ReplayBundleWildSchema = z.object({
  system_prompt_hash: z.string(),
  user_prompt_hash: z.string(), // sha256-hex of original user_prompt
  granite_response: z.string(),
  local_log_ref: z.string().optional(),
})
export type ReplayBundleWild = z.infer<typeof ReplayBundleWildSchema>

// Union schema — actual discriminator is mode at event-level, not at
// replay-bundle-level. Validation logic in GraniteFloorEventSchema's
// refine() ensures shape matches mode.
export const ReplayBundleSchema = z.union([ReplayBundleCISchema, ReplayBundleWildSchema])
export type ReplayBundle = ReplayBundleCI | ReplayBundleWild

// --- The canonical Granite-Floor event (spec v1.1) ---

/**
 * Single test-result event. Emitted via chatbus `post_message`
 * to_role=`@floor` reserved-virtual-role, thread=`granite-floor`,
 * content = JSON-stringified event.
 *
 * Storage: Oracle aggregator `granite_floor_events` table with
 * `UNIQUE(run_id, case_id)` CAS-dedup.
 */
export const GraniteFloorEventSchema = z.object({
  event_kind: z.literal(GRANITE_FLOOR_EVENT_KIND),
  run_id: z.string().uuid(),
  case_id: z.string().min(1),
  repo: z.string().min(1),
  tool: z.string().min(1),
  persona: PersonaSchema,
  mode: ModeSchema,
  outcome: OutcomeSchema,
  fail_category: FailCategorySchema.nullable(),
  fail_detail: z.string().max(500).nullable(),
  model: z.string().min(1),
  latency_ms: z.number().int().nonnegative(),
  timestamp: z.string().datetime(),
  multiturn: MultiturnTelemetrySchema.optional(),
  replay_bundle: ReplayBundleSchema.optional(),
  // v1.1 additive (Oracle msg #732): runner-side PII-scrubbing attestation.
  // Optional — defaults to undefined which dashboard treats as "unattested".
  // Future v2 may hard-reject wild-events with runner_scrubbed=false.
  runner_scrubbed: z.boolean().optional(),
})
  .refine(
    (e) => (e.outcome === 'fail' ? e.fail_category !== null : e.fail_category === null),
    { message: 'outcome=fail ⇒ fail_category non-null; outcome=pass ⇒ fail_category null' },
  )
  .refine(
    (e) => {
      // v1.1 PII-guard: wild-mode replay-bundle must be the Wild-shape
      // (user_prompt_hash, not verbatim user_prompt). CI-mode bundle MAY be
      // either shape, but CI-shape is recommended (verbatim user_prompt OK).
      if (!e.replay_bundle) return true
      if (e.mode === 'wild') {
        return 'user_prompt_hash' in e.replay_bundle && !('user_prompt' in e.replay_bundle)
      }
      return true
    },
    {
      message:
        'wild-mode replay_bundle MUST use ReplayBundleWild shape (user_prompt_hash, not verbatim user_prompt) — PII guard, spec v1.1',
    },
  )
export type GraniteFloorEvent = z.infer<typeof GraniteFloorEventSchema>

// --- Plugin-author config-shape ---

/**
 * Single tool-test-case definition.
 *
 * Plugin-author declares cases per tool. Each case specifies a prompt, the
 * expected tool-args Granite should produce, and per-case quality-budgets
 * (max_latency_ms, etc.).
 */
export interface GraniteToolTestCase {
  /**
   * Stable case identifier — should be deterministic across runs for
   * Oracle's `UNIQUE(run_id, case_id)` CAS-dedup. Convention:
   * `<tool>.<scenario-slug>` (e.g. `kabel.dimensionierung.16A-25m`).
   */
  case_id: string

  /** User-prompt the runner feeds to Granite to elicit the tool-call. */
  prompt: string

  /** Expected tool-arguments the runner should observe. Omit for wild-mode. */
  expected_tool_args?: Record<string, unknown>

  /**
   * Optional max-latency budget for this case. If exceeded → outcome=fail,
   * fail_category=latency-spike. Defaults to `GraniteTestConfig.default_max_latency_ms`.
   */
  max_latency_ms?: number

  /**
   * For multiturn-chains: expected tool-sequence the runner should observe.
   * v1 emits one event for the whole chain; per-step telemetry = v2.
   */
  expected_multiturn?: string[]
}

/**
 * Plugin-author-declared test-suite for ONE tool. Multiple of these
 * compose a plugin's full `granite-test.config.ts`.
 */
export interface GraniteToolTest {
  /**
   * MCP-tool-name (Option A canonical convention per v8-corp msg #735).
   *
   * MUST match the MCP `tools/list`-response value 1:1. Format:
   * `<feature>.<entity>.<verb_lowercase>` (e.g. `calendar.events.create`,
   * `projects.cards.move`, `heizlast.berechnen`).
   *
   * **No repo-prefix.** Cross-repo namespace-uniqueness is guaranteed by
   * the `(repo, tool)` pair (Oracle spec v1.1 dedup-invariant), NOT by
   * tool-name-prefix. Drift #200 (V8): "MCP-Tools ohne `<plugin>.`-Prefix".
   *
   * If `mcpEndpoint` is configured in the test-suite top-level, the runner
   * validates each `tool` against the live `tools/list`-response at config-
   * load-time. Typos caught at config-time instead of run-time.
   */
  tool: string

  /**
   * Persona-scope this tool requires. See `Persona` doc-comment for
   * dashboard-bucket semantics. Default: `'any'` (unclassified).
   */
  persona: Persona

  /** Test-cases for this tool. */
  cases: GraniteToolTestCase[]
}

/**
 * Top-level config-shape returned by `granite-test.config.ts`.
 *
 * Two formats supported:
 *
 * **Array-form** (simple) — just an array of tool-tests:
 * ```ts
 * export default [
 *   defineGraniteToolTest({
 *     tool: 'calendar.events.create',  // Option A: MCP /tools/list 1:1
 *     persona: 'user',
 *     cases: [
 *       { case_id: 'calendar.basic', prompt: 'Schedule a meeting tomorrow at 2pm', ... },
 *     ],
 *   }),
 *   defineGraniteToolTest({
 *     tool: 'projects.cards.delete',
 *     persona: 'admin',
 *     cases: [...],
 *   }),
 * ]
 * ```
 *
 * **Object-form** (with options) — config + tools:
 * ```ts
 * export default {
 *   mcpEndpoint: 'http://localhost:3550/mcp',  // optional config-time validation
 *   tools: [
 *     defineGraniteToolTest({ tool: 'calendar.events.create', ... }),
 *   ],
 * }
 * ```
 *
 * If `mcpEndpoint` is set, the runner queries `tools/list` at config-load
 * to validate each `tool`-name 1:1 against the live MCP-server. Typos
 * caught at config-time instead of run-time. Optional — air-gapped CI
 * runs or bridge-not-bootstrapped scenarios omit it.
 */
export interface GraniteTestConfigObject {
  /**
   * Optional MCP-endpoint for config-time tool-name validation. When set,
   * runner queries `tools/list` and validates each `defineGraniteToolTest.tool`
   * exists in the response. Catches typos at config-time. Omit for offline-
   * mode or test-first development.
   */
  mcpEndpoint?: string
  tools: GraniteToolTest[]
}

export type GraniteTestConfig = GraniteToolTest[] | GraniteTestConfigObject

// --- Reporter API (transport contract) ---

/**
 * Options for `reportToCluster()`.
 *
 * v1.0: chatbus-transport via `@floor` reserved-virtual-role.
 * v1.1 candidate: HTTP-transport opt-in for higher-volume aggregator (per
 * Oracle Q#6 backpressure follow-up + plug-tmpl batch-suggestion in msg #713).
 */
export interface ReportToClusterOptions {
  /**
   * Transport mode. `chatbus` is v1.0 default + spec-v1. `http` is v1.1+
   * candidate for batch-emission when chatbus WS-fanout backpressure hits.
   */
  transport?: 'chatbus' | 'http'

  /** Endpoint for `transport: 'http'`. Ignored for `chatbus`. */
  http_endpoint?: string

  /** Batch-flush interval in milliseconds. Default 2000. */
  batch_flush_ms?: number

  /** Batch-flush event-count threshold. Default 50. */
  batch_flush_count?: number
}
