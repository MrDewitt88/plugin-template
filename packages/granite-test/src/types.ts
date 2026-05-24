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

// --- Replay-bundle (recommended for fails, total event size capped 64 KB) ---

export const ReplayBundleSchema = z.object({
  user_prompt: z.string(),
  granite_output: z.string(),
  // Tool-state-snapshot before the call (caller-provided opaque payload)
  tool_state: z.record(z.unknown()).optional(),
})
export type ReplayBundle = z.infer<typeof ReplayBundleSchema>

// --- The canonical Granite-Floor event (spec v1) ---

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
}).refine(
  (e) => (e.outcome === 'fail' ? e.fail_category !== null : e.fail_category === null),
  { message: 'outcome=fail ⇒ fail_category non-null; outcome=pass ⇒ fail_category null' },
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
  /** Fully-qualified tool-name (e.g. `plug-elec.kabel.dimensionierung`). */
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
 * Typical usage in a plugin-repo:
 * ```ts
 * import { defineGraniteToolTest } from '@nexus-mindgarden/granite-test'
 *
 * export default [
 *   defineGraniteToolTest({
 *     tool: 'plug-elec.kabel.dimensionierung',
 *     persona: 'user',
 *     cases: [
 *       { case_id: 'kabel.16A-25m', prompt: 'Dimensioniere 16A 25m', ... },
 *     ],
 *   }),
 *   defineGraniteToolTest({
 *     tool: 'plug-elec.project.delete',
 *     persona: 'admin',
 *     cases: [...],
 *   }),
 * ]
 * ```
 */
export type GraniteTestConfig = GraniteToolTest[]

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
