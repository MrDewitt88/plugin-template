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

/**
 * Default per-case max-latency budget (60s).
 *
 * Sized from plug-elec's ET-Mind Modul-04 Live-Granite-Pilot (commit `4e44298`,
 * chatbus msg #757): 31-49s p99 against Granite-4-h-tiny for structured-output
 * + long-prompt + Pattern-7-validation cases. 60s = generous-headroom for
 * 99.9% of expected cases. Authors override per-case for known-slow (large
 * payload) or known-fast (small structured-tool-call) operations.
 */
export const DEFAULT_MAX_LATENCY_MS = 60_000 as const

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
 * Why a tool-call failed. Open-enum semantics (Oracle spec v1.1.1, msg #831):
 * additive enum-extensions bump v1.x.y, not v2. Aggregator validates
 * server-side; runners that never emit a value see no impact.
 *
 * - `schema-issue` — Granite output does not match the tool's Zod-input-schema
 * - `multiturn-state-loss` — state-context from step N missing in step N+1
 * - `hallucination` — Granite called a non-existent tool OR invented arguments
 * - `silent-fail` — no tool-call dispatched despite prompt explicitly asking
 * - `length-exceeded` — output exceeded max-token budget mid-call
 * - `latency-spike` — call took longer than max_latency_ms in case-config
 * - `text-leak` (v1.1.1+) — prose-alongside-tool-call detected. Granite-4-H
 *   systematic model-gate per wiz-mind msg #761 6/6 cases evidence.
 *   Disambiguation: if BOTH prose AND tool-call present → `text-leak`;
 *   if tool-call ABSENT → `silent-fail`. Wild-detectable.
 */
export const FailCategorySchema = z.enum([
  'schema-issue',
  'multiturn-state-loss',
  'hallucination',
  'silent-fail',
  'length-exceeded',
  'latency-spike',
  'text-leak', // v1.1.1 additive (Oracle msg #831)
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

// --- v1.1-additive: tool-call sub-discriminator (wiz-mind msg #720 + oracle msg #732) ---
//
// When `kind: 'tool-call'` is set on a replay-bundle, additional tool-call-
// specific fields are validated. Plugin-authors emitting tool-call test-results
// should set kind='tool-call' for deterministic replay-rerun tooling.
//
// Bundles without `kind` field remain valid (backward-compat). When `kind` is
// 'tool-call', the extra fields enable Oracle's replay-system to re-execute the
// exact call deterministically.

const ToolCallExtraSchema = z.object({
  kind: z.literal('tool-call'),
  expected_tool_name: z.string().optional(),
  actual_tool_name: z.string().optional(),
  actual_tool_args: z.record(z.unknown()).optional(),
  expected_schema_failures: z.array(z.string()).optional(),
  multiturn_step: z.number().int().nonnegative().optional(),
})

export const ReplayBundleCIToolCallSchema = ReplayBundleCISchema.merge(ToolCallExtraSchema)
export type ReplayBundleCIToolCall = z.infer<typeof ReplayBundleCIToolCallSchema>

export const ReplayBundleWildToolCallSchema = ReplayBundleWildSchema.merge(ToolCallExtraSchema)
export type ReplayBundleWildToolCall = z.infer<typeof ReplayBundleWildToolCallSchema>

// Union schema — actual discriminator is mode at event-level, not at
// replay-bundle-level. Validation logic in GraniteFloorEventSchema's
// refine() ensures shape matches mode. Tool-call shapes are additive
// to base shapes via `kind: 'tool-call'` (optional).
export const ReplayBundleSchema = z.union([
  ReplayBundleCIToolCallSchema,
  ReplayBundleWildToolCallSchema,
  ReplayBundleCISchema,
  ReplayBundleWildSchema,
])
export type ReplayBundle =
  | ReplayBundleCI
  | ReplayBundleWild
  | ReplayBundleCIToolCall
  | ReplayBundleWildToolCall

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

  // --- Spec v1.2 additive (Oracle msg #1015 FROZEN) — L3+L4 RFC fields ---
  //
  // Anti-Cheating Test-2 + Test-4 enforced spec-side:
  //   outcome_raw === 'fail' AND outcome_post_repair === 'pass'
  //     REQUIRES applied_repairs non-empty (server-rejects otherwise)
  //
  // Backwards-compat: when these fields are absent, aggregator falls back to
  // legacy `outcome` semantics (= outcome_raw). v1.1.x emitters need no
  // changes. v1.2+ emitters can use these for L3/L4 visibility.

  /** v1.2: Pre-repair outcome. If absent, equals `outcome`. */
  outcome_raw: z.enum(['pass', 'fail']).optional(),

  /** v1.2: Post-repair outcome. If `outcome_raw === 'fail'` AND `outcome_post_repair === 'pass'`, `applied_repairs` MUST be non-empty (Anti-Cheating Test-2). */
  outcome_post_repair: z.enum(['pass', 'fail', 'unrepairable']).optional(),

  /** v1.2: List of repair-rules applied between outcome_raw and outcome_post_repair (L3). */
  applied_repairs: z
    .array(
      z.object({
        rule_id: z.string(),
        audit_reason: z.string(),
      }),
    )
    .optional(),

  /** v1.2: Pass identifier in Multi-Pass framework (L4). E.g. `1`, `2`, `"3a"`, `"3b"`, etc. */
  pass_id: z.union([z.number().int().positive(), z.string().min(1)]).optional(),

  /** v1.2: Hash of effective system-prompt for this pass — enables prompt-version-tracking (L4). */
  prompt_version_hash: z.string().optional(),

  /** v1.2: Recipe-IDs of L1 strengthen-applied (e.g. `["hard-error-framing", "flexion-coverage"]`). */
  strengthen_recipes_applied: z.array(z.string()).optional(),

  /** v1.2: Link to previous-pass event for delta-tracking (L4 + L6b chain-walker queries). */
  pass_predecessor_event_id: z.string().optional(),

  /** v1.2: Fail sub-categorization (singular, free-form per Oracle #1015). Strict-mode prefers `fail_sub_categories[]` plural. */
  fail_sub_category: z.string().nullable().optional(),

  /** v1.2.1 plural (Oracle msg #1289): multi-violation cases. `fail_sub_categories[0] === fail_sub_category` when both set. */
  fail_sub_categories: z.array(z.string()).optional(),

  /** v1.2.2 (Oracle FROZEN): domain-kind classification for cross-domain analysis (narrative / structured-output / multilingual / etc). */
  domain_kind: z.string().optional(),

  // --- Spec v1.3 additive (Oracle FROZEN 2026-05-31, chatbus thread="contracts") ---
  //
  // Host-shared tool routing per agent's `feat/host-tool-routing` triple-landing
  // 2026-05-31 (§2.6 image.remove_background, §2.7 agent.complete (a)+(b)):
  // tests against host-shared tools (image.generate, image.remove_background,
  // agent.complete) need to discriminate ownership-class (plugin-tool vs
  // host-tool) and emitter-vs-host attribution. Open precedent: target_kind
  // is the FIRST CLOSED-enum additive field (vs domain_kind open-on-receive)
  // — future amends to closed-enum fields follow this pattern.
  //
  // Orthogonal to domain_kind: domain_kind classifies test-task-shape
  // (text-to-image-generation, structured-output-json-mode); target_kind
  // classifies tool ownership (plugin vs host). Both coexist per event.

  /** v1.3: Tool ownership-class (FIRST closed-enum additive field). Defaults to 'plugin-tool' when omitted (back-compat). */
  target_kind: z.enum(['plugin-tool', 'host-tool']).optional(),

  /** v1.3: For target_kind='host-tool' — which host serves the tool (theseus, v8, v8-fam, markview). Required when target_kind='host-tool'; rejected when target_kind!='host-tool'. */
  target_host: z.string().min(1).optional(),

  // --- Spec v1.4 additive (Oracle FROZEN 2026-05-31 ~21:09 chatbus) ---
  //
  // Tool-Count-Cap RFC (`docs/granite-floor-RFC-tool-count-cap.md` in TeamMindV8
  // repo @ commit c9dce32). Three optional, additive observability fields that
  // let the aggregator measure the pass-rate-vs-tool-count saturation curve
  // cluster-wide. Spec MISST, ENFORCED NICHT — no schema-hardcap (per-model
  // cap is context-dependent; future Granite-4-h-medium/large + Phi/Llama may
  // shift the curve).
  //
  // Field provenance:
  // - v8-corp K-knob sweep (130×K trials, K=10 sweet spot 72.3% vs Ceiling 88.5%)
  // - v8-fam Phase-1 vs Phase-2 (10→25 tools = 80%→56% regression)
  // - agent per-tool single-turn + multi-turn CI (silent-fail at large tool-sets)
  // - plug-elec ET-Mind Pass-3 SOJM-domain (3c reduced-block −75% missing) —
  //   cross-domain 4th triangulation per oracle §2.4
  //
  // 0-anchor: SOJM/narrative-domain emitters set `tools_in_context: 0`
  // (no tool-selection step). This makes the 0-bucket separable from the
  // tool-selection saturation curve.

  /**
   * v1.4: Number of tool-definitions in Granite's context for this case-run.
   *
   * - Single-tool baseline (no retrieval): `1`
   * - Retrieval-K=N runs: `N`
   * - SOJM / narrative-domain (no tool-selection): `0` (separable bucket)
   *
   * Aggregator builds pass-rate-vs-tool-count curves via GROUP BY tools_in_context.
   * Cap-guidance per cluster-canonical Tool-Count-Cap RFC: ≤10 for granite-4-h-tiny.
   */
  tools_in_context: z.number().int().nonnegative().optional(),

  /**
   * v1.4: Per-domain chunk identifier when toolCountPolicy chunking applied.
   *
   * Convention (RFC §3 + §4.2 — v8-fam + plug-tmpl independent convergence):
   * `chunk_id` = first dot-segment of the tool-name.
   *
   * Examples:
   * - `calendar.events.create` → `chunk_id: 'calendar'`
   * - `image.generate` → `chunk_id: 'image'`
   * - `notes_get` (dot-less, Drift #200 violation) → no chunking, NO emit
   *
   * Absence = single-batch run (no chunking applied), consistent with v0.0.6
   * back-compat. For sub-chunking (when one chunk still > cap), emitters MAY
   * use `<prefix>:<sub-index>` (e.g. `projects:0`, `projects:1`).
   */
  chunk_id: z.string().min(1).optional(),

  /**
   * v1.4: Number of tools in this chunk. Complements `chunk_id` for per-chunk
   * pass-rate dashboards (GROUP BY chunk_id, chunk_size). Absence consistent
   * with `chunk_id` absence.
   */
  chunk_size: z.number().int().nonnegative().optional(),
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
  .refine(
    (e) => {
      // v1.2 Anti-Cheating Test-2 (Visibility/Separation) + Test-4 (Surface-
      // Honesty) per plug-elec msg #872 + Oracle msg #1015 spec-enforcement.
      //
      // If outcome_raw='fail' AND outcome_post_repair='pass', applied_repairs
      // MUST be non-empty — otherwise we have a hidden cheating (claim
      // post-repair-pass without auditable repair-evidence).
      if (e.outcome_raw === 'fail' && e.outcome_post_repair === 'pass') {
        return Array.isArray(e.applied_repairs) && e.applied_repairs.length > 0
      }
      return true
    },
    {
      message:
        'Anti-cheating: outcome_raw=fail → outcome_post_repair=pass requires non-empty applied_repairs (spec v1.2, Test-2 + Test-4)',
    },
  )
  .refine(
    (e) => {
      // v1.2.1 plural-singular consistency (Oracle msg #1289):
      // If both fail_sub_category + fail_sub_categories present, the singular
      // form MUST be the first element of the plural form.
      if (e.fail_sub_category && e.fail_sub_categories && e.fail_sub_categories.length > 0) {
        return e.fail_sub_categories[0] === e.fail_sub_category
      }
      return true
    },
    {
      message:
        'fail_sub_categories[0] must equal fail_sub_category when both are set (spec v1.2.1 plural-singular consistency)',
    },
  )
  .refine(
    (e) => {
      // v1.3 collapsed-refine per Oracle's chatbus-side `granite_floor.py`
      // validator-block: `target_host present ⇔ target_kind === 'host-tool'`.
      //
      // Both directions matter:
      //   - host-tool event MUST specify target_host (else aggregator rejects)
      //   - plugin-tool event (or omitted target_kind) MUST NOT carry target_host
      //
      // Spec source: chatbus contracts thread 2026-05-31 ~05:01 oracle (10 new
      // v1.3 tests in oracle's aggregator: omit/explicit-plugin/host-happy-path/
      // missing-host/empty-host/non-string-host/plugin-tool+host-rejection/
      // host-without-kind-rejection/invalid-enum/payload-round-trip).
      const isHostTool = e.target_kind === 'host-tool'
      const hasTargetHost = e.target_host !== undefined && e.target_host !== null
      return isHostTool === hasTargetHost
    },
    {
      message:
        'target_host present ⇔ target_kind=host-tool (v1.3: host-tool requires target_host; plugin-tool/omitted rejects target_host)',
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
   * fail_category=latency-spike. Defaults to **60_000ms** (60s) — based on
   * plug-elec's ET-Mind Modul-04 Pilot (commit `4e44298`, msg #757) which
   * measured 31-49s p99 against Granite-4-h-tiny. Sequential CI runs with
   * 20 cases ≈ 10-15min, so override per-case for known-fast (cache-hit)
   * or known-slow (large-prompt + structured-output) operations.
   */
  max_latency_ms?: number

  /**
   * For multiturn-chains: expected tool-sequence the runner should observe.
   * v1 emits one event for the whole chain; per-step telemetry = v2.
   */
  expected_multiturn?: string[]

  /**
   * v0.0.3+ — argument-matching strictness (v8-corp Q2, msg #790).
   *
   * - `'partial'` (default): expected_tool_args is a SUBSET-match. Granite
   *   may emit additional optional fields without failure. Use for nullable/
   *   optional-rich tool-schemas where Granite-omitted fields are acceptable.
   * - `'exact'`: expected_tool_args must match emitted args byte-for-byte
   *   (no extra keys, no missing keys). Use for strict-shape tools where
   *   any drift is a fail.
   */
  match_mode?: 'partial' | 'exact'

  /**
   * v0.0.3+ — per-case override für text-leak handling (wiz-mind msg #761,
   * Oracle msg #831 v1.1.1 text-leak fail-category).
   *
   * - `false` (default, strict): if Granite emits prose alongside tool-call,
   *   fail with `text-leak` fail-category. Reflects Granite-4-H model-gate
   *   that 6/6 cases exhibited per wiz-mind cohort-2 evidence
   * - `true` (permissive): plugin-author's backend filters text when
   *   toolCalls.length > 0, so text-leak is mitigated downstream. Pass-rate
   *   reflects "given backend-side-mitigation"
   *
   * Per V8-corp #790 matrix: `mcp.read.*` → permit, `mcp.write.*` → strict.
   */
  permitDualEmission?: boolean
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

  /**
   * v0.0.3+ — auto-prepend schema-example to system-prompt before each case
   * (wiz-mind msg #761 Cohort-2 evidence: 0/3 → 3/3 schema-pass).
   *
   * When `true` (default), runner derives a "call with this shape" string
   * from `parameters` Zod-schema or from `case.expected_tool_args`, and
   * prepends it to the system-prompt. Plugin-authors opt-out per-tool
   * when they want strict-baseline (no auto-help) measurement.
   *
   * Auto-derivation rules:
   * - If `parameters` Zod-schema present: extract from schema (enum-values,
   *   field-shape, required-fields) via `inferToolSchemaFromZod()` pattern
   * - If only `case.expected_tool_args` present: serialize as shape-hint
   * - If neither: no auto-injection (silent no-op)
   */
  embedSchemaExample?: boolean

  /**
   * v0.0.3+ — Zod-schema for tool input arguments (plug-elec msg #783 +
   * plug-db msg #780 + mind-canva-interest, 3-adopter signal).
   *
   * When provided, runner uses this to:
   * - Auto-inject available enum-values into system-prompt (cohort-2 pattern)
   * - Generate OpenAI/Anthropic tool-definition from Zod via
   *   wiz-mind's `buildOpenAIToolDef()` (granite-pilot-runner v0.1.2+)
   * - Validate emitted `tool_args` against schema (richer than match_mode='exact')
   *
   * Use this OR `expected_tool_args` per case — `parameters` is run-wide,
   * `expected_tool_args` is per-case-specific-values.
   */
  parameters?: z.ZodTypeAny

  /**
   * v0.0.6+ — Tool ownership-class per Oracle spec v1.3 (FROZEN 2026-05-31).
   *
   * - `'plugin-tool'` (default if omitted) — tool lives in this plugin's
   *   own capability-store (plugin-author owns + serves it). Events emit
   *   without `target_host`.
   * - `'host-tool'` — tool is host-shared (lives in `HOST_SHARED_TOOLS`
   *   allowlist: `image.generate`, `image.remove_background`, `agent.complete`).
   *   This plugin consumes the tool via `callMcp()` (un-prefixed name) or
   *   direct HTTP (per-plugin handshake-token, agent-socket-direct transport).
   *   Requires `target_host` to be set.
   *
   * Use for host-shared-tool granite-coverage in consuming plugins: e.g.
   * `apex2d` testing `image.generate` against Granite for content-gen quality;
   * `mind-canva` testing `agent.complete` for AI-assist quality.
   *
   * @since v0.0.6
   * @see target_host
   */
  target_kind?: 'plugin-tool' | 'host-tool'

  /**
   * v0.0.6+ — When `target_kind === 'host-tool'`: which host serves the tool.
   * Canonical values: `'theseus'`, `'v8'`, `'v8-fam'`, `'markview'` (extensible
   * per future host-additions). Aggregator validates: present ⇔ host-tool.
   *
   * Plugin-author convention: when testing a host-tool from a plugin that
   * runs inside Theseus' agent, set `target_host: 'theseus'`. When testing
   * the same tool from a V8/v8-fam-hosted plugin, set the respective host.
   *
   * @since v0.0.6
   * @see target_kind
   */
  target_host?: string
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

  /**
   * v0.0.3+ — Run-wide tenant context propagated into every emitted event
   * (v8-corp Q1, msg #790). All cases in `tools[]` inherit these IDs via
   * runner-side merge. Use this for multi-tenant SaaS plugins (V8-corp,
   * V8-fam) where tool-calls are tenant-scoped. Omit for single-tenant or
   * synthetic-tenant test-runs.
   */
  tenantContext?: {
    tenant_id?: string
    user_id?: string
  }

  /**
   * v0.0.3+ — Authorization header for protected `mcpEndpoint` (v8-corp Q's
   * follow-up, msg #790). Most V8-corp `/api/admin/mcp-tools` endpoints
   * require cookie or bearer auth — this field is passed verbatim as the
   * `Authorization` header when querying `mcpEndpoint`.
   *
   * For more complex auth (cookie, mTLS, custom headers), use `mcpFetchInit`
   * instead — it's passed as `init`-options to the underlying `fetch()`.
   */
  mcpAuthHeader?: string

  /**
   * v0.0.3+ — Full `fetch()` RequestInit override für `mcpEndpoint` requests.
   * Use this for cookie-based auth, custom headers, mTLS, etc. Mutually
   * exclusive with `mcpAuthHeader` (runtime warns if both set; mcpFetchInit
   * wins).
   *
   * @example
   * mcpFetchInit: {
   *   headers: { Cookie: 'session=abc123' },
   *   credentials: 'include',
   * }
   */
  mcpFetchInit?: RequestInit

  /**
   * v0.0.7+ — Tool-count-cap policy per canonical Tool-Count-Cap RFC
   * (`docs/granite-floor-RFC-tool-count-cap.md` in TeamMindV8 repo @ `c9dce32`).
   *
   * Cluster-canonical Granite-Selection-Capacity for granite-4-h-tiny saturates
   * at ~10–15 tools per context. Past cap, pass-rate regresses (v8-fam 80%→56%
   * at 10→25 tools; v8-corp K=10 plateau at 72.3% vs single-tool ceiling 88.5%).
   *
   * When set, runner partitions tools by `chunkBy` strategy and runs each chunk
   * as a separate granite-batch. Events carry `chunk_id` + `chunk_size` for
   * per-chunk aggregator visibility. Plus `tools_in_context` event-field
   * (runner-emitted) for cluster-wide pass-rate-vs-tool-count curves.
   *
   * Omitting `toolCountPolicy` preserves v0.0.6 behaviour: no chunking, no
   * chunk_id/chunk_size emission. Single-batch run as before.
   *
   * **Runtime implementation lives in `granite-pilot-runner` (wiz-mind owns).**
   * This package ships the config-shape + event-fields only.
   *
   * @since v0.0.7
   * @see https://github.com/MrDewitt88/TeamMindV8/blob/main/docs/granite-floor-RFC-tool-count-cap.md
   */
  toolCountPolicy?: ToolCountPolicy

  tools: GraniteToolTest[]
}

/**
 * v0.0.7+ — Tool-count-cap policy shape.
 *
 * Source: canonical Tool-Count-Cap RFC §4.2 (TeamMindV8 repo @ `c9dce32`).
 * Independent convergence: v8-fam §3 + plug-tmpl §4 derived the same chunking-key
 * (`first dot-segment of tool-name`) without prior coordination — strong
 * evidence the convention captures real structure.
 */
export interface ToolCountPolicy {
  /**
   * Maximum tools passed in a single granite-run context.
   *
   * Default: `10` (cluster-canonical cap for granite-4-h-tiny per RFC §2.7).
   * Set to `Infinity` to disable chunking (legacy v0.0.6 behaviour, plus
   * explicit `intentional_over_cap` annotation for cap-research per RFC §5.6).
   *
   * Per-model TBD: future Granite-4-h-medium/large + Phi/Llama may shift the
   * curve. Spec MISST, ENFORCED NICHT — this is non-normative guidance.
   */
  maxToolsPerRun?: number

  /**
   * Chunking strategy when `tools.length > maxToolsPerRun`.
   *
   * - `'tool-prefix'` (default): group by first dot-segment of `tool` field.
   *   Example: `calendar.events.create` → chunk `calendar`; `image.generate`
   *   → chunk `image`. Convention-aligned with Drift #200 sub-namespace.
   * - `'flat-batch'`: simple sequential batching, no semantic grouping. Use
   *   for tool-sets without natural dot-prefix clustering.
   *
   * Future v0.1.x: `'tool-prefix-2'` (second-dot-segment refinement per
   * RFC §3.5 sub-namespace explosion edge case), `'manual'` (author-provided
   * chunk-keys via per-tool annotation).
   */
  chunkBy?: 'tool-prefix' | 'flat-batch'

  /**
   * Per-chunk max-latency budget override (ms). When omitted, inherits the
   * runner default + per-case `max_latency_ms`. Useful when individual chunks
   * have widely-different expected latencies (small chunk = strict budget,
   * large chunk = generous budget).
   */
  chunkLatencyBudgetMs?: number

  /**
   * When `chunkBy='tool-prefix'` and a chunk STILL exceeds `maxToolsPerRun`
   * (e.g. `projects.*` has 15 tools), split lexicographically into N sub-chunks
   * of ≤max. Emits sub-chunk `chunk_id` as `<prefix>:<sub-index>` (e.g.
   * `projects:0`, `projects:1`).
   *
   * Default: `true` (graceful auto-resolution).
   * Set `false` to loud-fail with `validation_error` instead (for authors who
   * want explicit semantic sub-chunk-keys via second-dot-segment per RFC §3.5).
   */
  allowSubChunking?: boolean
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
