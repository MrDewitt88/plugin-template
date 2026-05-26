# Granite-Test v0.0.4 RFC — 7-Layer Architecture for "100% MCP-tools Granite-callable, no cheating"

> **Status:** DRAFT v0.2 · 2026-05-26 · plug-tmpl-hosted · Spec v1.2.2 FROZEN-foundation · co-author-window closing
>
> **Co-authors (signs collected — see §A Appendix):**
> - `plug-tmpl` ✓ — impl-owner, RFC-host, L2 shipped v0.0.3-v0.0.5
> - `plug-elec` ✓ accepted — L3 Repair-Rule-Library + Anti-Cheating-4-Test framework + Pass-3 evidence (ETA 2-3 Tage)
> - `mind-canva` ✓ accepted — L4 Multi-Pass sub-RFC + L3 concept-source + Live-Pilot tomorrow
> - `v8-fam` ✓ accepted — Pass-1/2/3 empirical-data source (150-event Pass-3 burst tomorrow 09:00)
> - `v8-corp` ✓ accepted — L7 Tool-Description-Discipline + 72-tool domain-diversity (25/72 Phase-2)
> - `plug-db` ✓ accepted — L6a Zod-export + L6b RAG-driven prompt-memory (live consumer-side)
> - `oracle` ✓ Spec v1.2.2 FROZEN — aggregator/dashboard/CLI live, all RFC-required event-fields shipped
>
> **Sole-pending L1 signal:** `wiz-mind` — Pattern-1-7 canonical-recipe owner (DM-pinged msg #1887)
>
> **Spec foundation:** Spec v1.2.2 FROZEN (Oracle msgs #1015/#1289/#~1620) is the **canonical event-payload-spec** referenced throughout this RFC. All RFC-design-decisions about event-fields are SETTLED at spec-level.

---

## §0 — Premise (human msg #850)

The cluster-target: **100% of MCP-tools Granite-4-h-tiny-callable by September-Messe, without cheating and without tool-list-minimization.**

"Cheating" defined (plug-elec msg #872):
- ✗ Modifying the test (skip-tools, lax expectations) to artificially pass
- ✓ NOT cheating: canonicalizing production-MCP-tool-discovery (Layer-7) such that Granite has the same schema-knowledge in test + production
- ✓ NOT cheating: declarative+audited Layer-3-repairs that mirror production-handlers

Cluster-state at RFC-start (2026-05-26):
- Pass-Rate baseline: ~30% (16 of 23 events fail in `outcome=fail`, across plug-elec Modul-04 + V8-fam burst)
- 6+ critical fail-modes identified across 3 domains (narrative, structured-output, DE-locale)
- **No single Layer reaches 100% alone.** Stack is the answer.

---

## §0.1 — Spec v1.2.2 FROZEN-foundation (Oracle, 2026-05-26)

Spec v1.2.2 = canonical event-payload-spec for RFC v0.0.4 implementation. All event-fields shipped + spec-level Anti-Cheating refines enforced. Adopters emit v1.2.2-shaped events TODAY against Oracle's live aggregator + RFC consumers reference these as ground-truth.

### §0.1.1 — Spec-version timeline (single day, 3 microbumps)

| Spec | Trigger | Fields added |
|---|---|---|
| v1.1 (Oracle #732) | Initial freeze | event_kind/run_id/case_id/repo/tool/persona/mode/outcome/fail_category/fail_detail/model/latency_ms/timestamp/multiturn/replay_bundle |
| v1.1.1 (Oracle #831) | text-leak 7th fail-category | `text-leak` enum-value |
| **v1.2** (Oracle #1015) | L3+L4 RFC fields, additive | `outcome_raw`, `outcome_post_repair`, `applied_repairs[]`, `pass_id`, `prompt_version_hash`, `strengthen_recipes_applied[]`, `pass_predecessor_event_id?`, `fail_sub_category` |
| v1.2.1 (Oracle #1289) | Multi-violation plural | `fail_sub_categories[]` plural with consistency-rule |
| v1.2.2 (Oracle ~#1620) | Cross-domain analysis | `domain_kind` cross-domain classification |

### §0.1.2 — Spec-level Anti-Cheating refines (server-enforced)

```typescript
// Refine 1 (Anti-Cheating Test-2 Visibility + Test-4 Surface-Honesty):
outcome_raw === 'fail' AND outcome_post_repair === 'pass'
  REQUIRES applied_repairs[].length > 0
  // Otherwise server rejects with audit-trail-missing reason

// Refine 2 (Plural-Singular consistency, spec v1.2.1):
fail_sub_categories[0] === fail_sub_category
  WHEN both fields are set
  // Otherwise server rejects with consistency-violation
```

Both refines live in Foundation's Zod-schema (`@nexus-mindgarden/granite-test@^0.0.5`) AND Oracle's aggregator (`chatbus/granite_floor.py:validate_event()`). **Spec-level enforcement, not test-only.**

### §0.1.3 — Canonical event-payload example (full v1.2.2 envelope)

```json
{
  "event_kind": "granite-floor.event.v1",
  "run_id": "et-mind-modul04-pass3-2026-05-27-3b",
  "case_id": "aggregate_befund.efh-minimal.narrative",
  "repo": "ET-Mind",
  "tool": "switchgear.aggregate_befund",
  "persona": "user",
  "mode": "ci",
  "outcome": "pass",
  "outcome_raw": "fail",
  "outcome_post_repair": "pass",
  "fail_category": null,
  "fail_detail": null,
  "model": "ibm/granite-4-h-tiny",
  "latency_ms": 5234,
  "timestamp": "2026-05-27T09:14:23.000Z",
  "domain_kind": "structured-output-json-mode",

  // L3 fields:
  "applied_repairs": [
    { "rule_id": "verbatim-digit-replace", "audit_reason": "'zwölf' → '12' per DE-number-word-dict" },
    { "rule_id": "iso-tz-complete", "audit_reason": "'2026-06-15' → '2026-06-15T00:00:00+02:00' per ctx.tz" }
  ],

  // L4 fields:
  "pass_id": "3b",
  "prompt_version_hash": "sha256:abc123def456...",
  "strengthen_recipes_applied": ["R-04", "R-05", "R-11"],
  "pass_predecessor_event_id": "evt-pass2-baseline-001",

  // v1.2.1 plural sub-categorization:
  "fail_sub_category": "verbatim-discipline",
  "fail_sub_categories": ["verbatim-discipline", "enum-translate-de-en"]
}
```

---

## §1 — Layer Architecture (consolidated from msgs #859/#861/#862/#870/#872)

| # | Layer | Owner | Status | Cluster-vote |
|---|---|---|---|---|
| **L1** | Prompt-Engineering Recipes (Pattern-1-7 from wiz-mind §3.5 + GRANITE-FLOOR-CROSS-REPO) | each adopter | ✅ canonical-recipes, empirically validated (v8-fam Pass-2 +20pp) | unanimous |
| **L2** | Schema-Discipline (`parameters: z.ZodTypeAny` + `embedSchemaExample` + domain_kind-conditional-policy) | plug-tmpl | ✅ shipped v0.0.3 + v0.0.4 wire-fix + v0.0.5 spec-fields | unanimous |
| **L3** | **Post-Validator-Repair** (declarative + audited) | plug-tmpl v0.0.4 | 📋 **THIS RFC** | unanimous co-author |
| **L4** | Multi-Pass Framework (codifies plug-elec's manual-iteration) | plug-tmpl v0.0.4 | 📋 design needed | endorsed |
| **L5** | Model-Cascade (escalate to bigger model on fail) | per-adopter, opt-in | ⏸️ NOT in 95%-target-budget — non-deterministic | opt-in roadmap only |
| **L6a** | Canonical Zod-Export per plugin | each plugin | ✅ V8 / ET-Mind already export `@<plugin>/types` | adoption-ready |
| **L6b** | RAG-Driven Prompt-Memory (cross-repo) | plug-db + oracle | 🚧 oracle's batch-export endpoint shipping in v0.0.3-sync window | adoption-ready post-endpoint |
| **L7** | **Tool-Description-Discipline** in MCP `/tools/list` | each plugin | 🆕 V8-canonical proposal (msg #870) | endorsed, audit-pattern needed |

**Cluster-target:** `pass_rate_raw ≥ 95%` via L1+L2+L7 + `pass_rate_post_repair = 100%` via L3+L6 + L4 (Multi-Pass). L5 explicitly excluded from 95%-target-budget per Test-3 (determinism, plug-elec #872).

### §1.1 — L2 `embedSchemaExample` domain_kind-conditional policy (v8-corp request #1813)

L2 behavior is **conditional on `domain_kind`**, not unconditional default-on. Two empirically-grounded settings:

| `domain_kind` | `embedSchemaExample` default | Rationale | Validating evidence |
|---|---|---|---|
| `tool-call-with-tools-list` | **OFF** | MCP `tools/list` already canonicalises schema; in-prompt-schema would be DOUBLE-priming → can degrade granite | V8-corp 25/72 Phase-2 cases (#1813) all L2-OFF, R-13/14/15/16 reserved |
| `structured-output-json-mode` | **ON (default)** | No tools/list context; in-prompt-schema IS source-of-truth | ET-Mind + Mind-Canva twin-domain (mind-canva #1813 confirmation), wiz-mind cohort-2 evidence 0/3→3/3 |
| (other / unset) | ON (default) | Conservative default — wiz-mind cohort-2 evidence applies to most domains | wiz-mind msg #761 |

**Plugin-author API (v0.0.5+ already-shipped types support this):**

```typescript
// granite-test.config.ts (v8-corp pattern, L2-OFF for tool-call-with-tools-list):
defineGraniteToolTest({
  tool: 'calendar.events.create',
  persona: 'user',
  embedSchemaExample: false,    // ← explicit OFF per domain_kind policy
  parameters: CreateEventInputSchema,
  cases: [/* L7 tools/list-canonicalised */]
})

// granite-test.config.ts (ET-Mind/Mind-Canva pattern, L2-ON):
defineGraniteToolTest({
  tool: 'switchgear.aggregate_befund',
  persona: 'user',
  embedSchemaExample: true,     // ← explicit ON (or omit, ON is default)
  parameters: AggregateBefundInputSchema,
  cases: [/* domain_kind=structured-output-json-mode */]
})
```

**v0.0.6 runner-side enhancement (TBD):** runner could read top-level `tenantContext.domain_kind` from `granite-test.config.ts` object-form + auto-apply `embedSchemaExample` default per-domain-kind. Plugin-authors keep explicit-override capability per-tool.

**RFC sign-off:** L2-conditional-policy ✓ adopted, baked in v0.0.5 (config-shape supports it; runner-side autoconfig is v0.0.6 candidate).

---

## §2 — Anti-Cheating Framework (plug-elec msg #872)

Every layer-proposal MUST pass 4 falsification-tests:

### Test 1 — Audit-Trail Symmetry
> Production-handler MUSS dieselben repairs anwenden wie Pilot-handler.

If Granite-Floor passes only via test-only-repairs that production doesn't apply, the metric drifts from production-behavior = hidden cheating.

→ **L3 repair-rules are canonical-config**, exported as a shared package + consumed by both pilot-runner AND production-MCP-handler.

### Test 2 — Visibility / Separation
> Aggregator MUST emit `pass_rate_raw` ≠ `pass_rate_post_repair` als zwei distinct metrics.

Dashboard surfaces BOTH. Cluster-broadcast "100% pass!" when only post-repair valid but raw is 30%, that's misrepresentation.

→ **Spec v1.2 candidate:** Oracle's `granite-floor.event.v1` gains `outcome_raw` + `outcome_post_repair` discriminated fields (additive, non-breaking).

### Test 3 — Determinism
> Repair-rules MÜSSEN deterministisch + finite-rule-set sein.

L5 (LLM-cascade) is explicitly NOT-L3 because non-deterministic. L5 is opt-in roadmap, not in 100%-target-budget.

→ **L3 rules are pure-function:** `(graniteOutput, context) → repairedOutput | unrepairable`. No LLM in the rule-engine.

### Test 4 — Surface-Honesty
> Repair-rules MÜSSEN tatsächliche fail-modes adressieren, nicht "mask failures".

Content-loss-not-recoverable (e.g. Granite paraphrased "Lena had fever" instead of verbatim "Lena hatte 38.2 Fieber") MUST be marked `unrepairable` + transparent in event. Anti-cheating would be stillschweigend `pass`-markieren.

→ **L3 rule-engine emits `unrepairable: true` + `audit_reason: string`** when no rule applies. Aggregator counts these as raw-fail + post-repair-fail (no double-credit).

---

## §3 — Layer-3 Repair-Rule-Library (plug-elec msg #872 baseline)

9 canonical repair-rules extracted from current cluster-evidence (V8-fam burst, plug-elec Pilot Pass-1+2, mind-canva headlines):

| Rule-ID | Granite-output | Repair-target | Source-context | Status |
|---|---|---|---|---|
| `enum-translate-de-en` | `"richtig"` | `"correct"` | system-prompt enum-list | ✅ deterministic-repair |
| `enum-translate-en-de` | `"warm"` (when DE-expected) | (passthru, identity) | identity | ✅ deterministic-repair |
| `iso-tz-complete` | `"2026-06-15"` | `"2026-06-15T00:00:00+02:00"` | `ctx.tz` | ✅ deterministic-repair |
| `relative-date-resolve` | `"Wednesday"` / `"Mittwoch"` | `"2026-05-27"` | `ctx.today` | ✅ deterministic-repair |
| `namespace-prefix-restore` | `"tom-id"` | `"user-tom-id"` | `ctx.id_prefix` | ✅ deterministic-repair |
| `verbatim-digit-replace` | `"zwölf"` | `"12"` | DE/EN number-word-dictionary | ✅ deterministic-repair |
| `noun-mangling-detect` | `"Zimmeraufärrung"` | (mark unrepairable, audit-only) | dictionary-check | 🟡 audit-only |
| `paraphrase-rollback` | `"Lena hatte Fieber"` | (mark unrepairable wenn no anchor) | audit-only | 🟡 audit-only |
| `field-drop-detect` | `{choreId}` ohne `outcome` | (mark unrepairable, escalate to L4 retry) | schema-required check | 🟡 escalate-to-L4 |

**Summary:**
- **6 of 9** = deterministically-repairable (auto-pass-flippers)
- **3 of 9** = audit-only / escalate (transparent failures)

**Cluster-prediction (plug-elec #872):** V8-fam Pass-2 (5 ungelöste fails) × Layer-3 = ~9/10 pass after-repair (was 7/10 raw). Pending Pass-3 strategy-isolation evidence to confirm.

### Pass-3 4-sub-variant experiment design (plug-elec, ETA 2-3 Tage)

| Variant | Strategy | Layer-3-Implication |
|---|---|---|
| **3a** Pass-2 baseline (control) | nothing | Baseline: which fail-modes persist |
| **3b** In-prompt worked-example | structural (cohort-2-pattern) | Which fail-modes BETTER prompt fixes |
| **3c** Number-block reduced | structural (attention-overflow mitigation) | Which fail-modes SCHMALERN scope fixes |
| **3d** "Mention each" explicit | stronger-words only | Which fail-modes NOT-prompt-fixable → L3-rule-required |

**Direct mapping zu RFC-rule-prioritization:**
- Fail-modes die in 3b+3c kippen aber in 3d nicht: **L1-recipes reichen, kein L3-rule nötig**
- Fail-modes die in keiner Variante kippen (predicted: `verbatim_number_missing` für reduced-set): **L3-rules sind kanonischer Lösungsweg**

→ Pass-3 liefert die empirical-rule-set-priority-data. Combined with V8-fam Pass-2-data + mind-canva headlines-Pass-2 = **3-domain × 8-prompt-variant matrix** für RFC final-form.

---

## §4 — Layer-3 API Design (TBD, plug-tmpl draft for review)

### §4.1 Plugin-author surface

```ts
import { defineRepairRule } from '@nexus-mindgarden/granite-test'

// Plugin-authors can declare custom rules OR import the canonical library
import { canonicalRules } from '@nexus-mindgarden/granite-test/repair-rules'

defineGraniteToolTest({
  tool: 'calendar.events.create',
  persona: 'user',
  parameters: CreateEventInputSchema,        // L6a
  embedSchemaExample: true,                  // L2
  permitDualEmission: false,                 // L2
  repairRules: [                             // L3
    ...canonicalRules.dateRules,             // bundled set
    canonicalRules.enumTranslation('en'),    // parameterized
    // Plugin-specific custom rule:
    defineRepairRule({
      id: 'calendar-tz-vienna-default',
      detect: (output) => output.start_time && !output.start_time.includes('+0'),
      repair: (output) => ({ ...output, start_time: `${output.start_time}+02:00` }),
      auditReason: 'Vienna-TZ assumed when timezone omitted',
    }),
  ],
  cases: [/* ... */],
})
```

### §4.2 Runner-side execution

```
1. Execute case → raw Granite-output
2. Validate raw against schema → `outcome_raw: pass | fail`
3. If fail: apply repair-rules in order
   - For each rule: rule.detect(output) → bool
   - If detect-match: output = rule.repair(output) OR mark unrepairable
4. Validate repaired against schema → `outcome_post_repair: pass | fail | unrepairable`
5. Emit event with BOTH outcomes (Test 2 visibility)
```

### §4.3 Event-payload extension (v1.2 spec-additive, pending Oracle)

```ts
interface GraniteFloorEvent_v1_2 extends GraniteFloorEvent {
  outcome_raw: 'pass' | 'fail'
  outcome_post_repair: 'pass' | 'fail' | 'unrepairable'
  applied_repairs?: Array<{
    rule_id: string
    audit_reason: string
  }>
}
```

Backwards-compat: when `outcome_raw`/`outcome_post_repair` absent → aggregator defaults to old `outcome` semantics (= `outcome_raw`).

### §4.4 Production-handler integration (Test 1 — Audit-Trail Symmetry)

**Critical constraint:** the same `repairRules` array passed to `defineGraniteToolTest()` MUST be importable by production-MCP-handler code. Repairs are **canonical-config**, not test-only-augmentation.

Proposed pattern:
```ts
// In plugin's @<plugin>/repair-rules export (new convention)
export const calendarRepairs = [
  canonicalRules.dateRules,
  // ...
]

// In test:
import { calendarRepairs } from '@<plugin>/repair-rules'
defineGraniteToolTest({ repairRules: calendarRepairs, ... })

// In production-MCP-handler:
import { calendarRepairs } from '@<plugin>/repair-rules'
const repairedOutput = applyRepairs(graniteOutput, calendarRepairs)
```

→ **Spec-recommendation:** Each plugin SHOULD expose `@<plugin>/repair-rules` alongside `@<plugin>/types`.

---

## §5 — Layer-4 Multi-Pass Framework (TBD, mind-canva concept)

> Codifies plug-elec's manual Pass-1 → Pass-2 → Pass-3 iteration as first-class framework-feature.

Design-questions (pending RFC):
- Should the runner auto-retry on `outcome_raw=fail` after applying L3? (likely yes, opt-in via `multiPass: { maxPasses, backoffMs }`)
- Where does the strengthened-prompt come from between passes? (canonical recipes from L1? Custom per-test override?)
- How does L4 interact with L5 (Model-Cascade)? (L4 stays same-model; L5 escalates model. Strict separation per Test 3.)

Detailed sub-RFC needed (mind-canva to draft when capacity).

---

## §6 — Layer-7 Tool-Description-Discipline (v8-corp msg #870)

Each plugin's `tools/list`-response MUST include:

```json
{
  "name": "calendar.events.create",
  "description": "Create a calendar event. Requires ISO-datetime with Europe/Vienna timezone. allDay events use date-only format.",
  "input_schema": { /* JSON-Schema from CreateEventInputSchema (L6a) */ },
  "examples": [ /* canonical-correct inputs */ ]
}
```

**Critical property:** Layer-7-tool-descriptions are **production-canonical** (what MCP-clients see when they discover). When Granite-Floor with L1+L2+L3+L7 reaches 100%, that IS production-quality-evidence because the same descriptions are used in production-MCP. **No test-only-tooling-creep.**

**V8-canonical pattern (proposed for cluster-spec):**
```ts
export const eventsCreate: McpTool = {
  name: 'calendar.events.create',
  description: 'Create a calendar event. Requires ISO-datetime with Europe/Vienna timezone.',
  scope: 'mcp.write.calendar',
  inputSchema: CreateEventInputSchema,    // Zod with enum-values + .describe() per field
  examples: [ /* ... */ ],
}
```

**Audit-pattern (cluster-wide):**
- Each plugin reviews 100% of MCP-tools for: `.describe()` per field, enum-values explicit, datetime/locale-format-hints in description
- granite-test runner reads `tools/list` → extracts enum-values + descriptions → injects into system-prompt (Layer-2 with Layer-7 as source-of-truth)

---

## §7 — Layer-6a/6b Integration (plug-db msg #862)

### §7.1 L6a — Canonical Zod-Export per Plugin

Each plugin exposes `@<plugin>/types` with all MCP-tool input-schemas as named exports. Already canonical pattern for V8, ET-Mind, others. **Cluster-spec recommendation:** ALL plugins adopt this pattern by end-of-July.

### §7.2 L6b — RAG-Driven Prompt-Memory

Oracle batch-exports Granite-Floor events to plug-db (per Oracle msg #831, batch-export endpoint commitment in v0.0.3-sync-window). Plug-db RAG-indexes events as `granite_floor_event` doc_type (180d half-life).

**Cluster use-cases:**
- "Find similar fails to this one" (embedding-similarity over `fail_detail` + `actual_tool_args`)
- Cross-repo regression-detection
- Long-term training-corpus für prompt-iteration

**RFC-action:** Plug-db's batch-export envelope (one chunk per event, Option A per plug-db #834) is canonical. Pending Oracle's endpoint-stub-PR shipping.

---

## §8 — Pass-Rate Target Budget

| Stack | Predicted | Mechanism |
|---|---|---|
| **Raw (L1+L2+L7)** | ≥ 95% | Prompt-recipes + schema-discipline + canonical tool-descriptions |
| **Post-repair (+L3)** | 100% | Deterministic repair-rules + transparent-unrepairable audit |
| **Multi-pass (+L4)** | 100%+ stability | Auto-retry strengthened-prompt on raw-fail |
| **L5 Model-Cascade** | NOT in budget | Opt-in roadmap, fails Test 3 (non-deterministic) |

**Definition:** Cluster's "100% by September-Messe" = `pass_rate_post_repair = 100%` AND `pass_rate_raw ≥ 95%` AND L1-L4+L6+L7 all instrumented. L5 stays opt-in.

---

## §9 — RFC Process

**Draft cadence:**
- v0.1 (this) — plug-tmpl scaffold, all 7 layers consolidated
- v0.2 — co-author signals in, sections fleshed by owners (plug-elec L3, mind-canva L4, v8-corp L7-audit-pattern, plug-db L6 integration)
- v0.3 — Pass-3 strategy-isolation evidence integrated (plug-elec, ~2-3 Tage)
- v1.0 (FROZEN) — when all co-authors sign-off + at least 1 plugin has end-to-end L1-L7 pilot running

**Co-author sign-off process:** Each owner adds explicit `✓ <role> 2026-MM-DD` to their Layer section. Once all owners sign, RFC is FROZEN + becomes spec-input for `@nexus-mindgarden/granite-test` v0.0.4 implementation.

**v0.0.4 implementation scope:**
1. L3 `repairRules` API + canonical-rule library (~2h impl, plug-elec evidence-driven)
2. L4 `multiPass` framework (~3h impl, mind-canva design-driven)
3. Event-payload extension (`outcome_raw`/`outcome_post_repair`/`applied_repairs`) — pending Oracle's spec v1.2-additive sign-off
4. README + Provider-Guide §16 "Anti-Cheating Framework" essay

**Out-of-scope for v0.0.4 (deferred to v0.0.5+):**
- L5 Model-Cascade impl (opt-in package separate)
- L6b RAG-export consumer-side helpers (consumes Oracle's batch-export endpoint when shipped)

---

## §10 — Open questions

1. **Repair-rule namespacing:** `@nexus-mindgarden/granite-test/repair-rules` (Foundation-bundled) vs `@<plugin>/repair-rules` (per-plugin)? → Vote: both. Foundation ships canonical-set, plugins extend with custom.
2. **L4 retry-strategy:** Should runner read fail-category to pick repair-strategy? (e.g. `text-leak` → "permit second response without prose", `schema-issue` → "stronger schema-example") → Sub-RFC needed (mind-canva).
3. **L3 ordering:** Rules in declared-array-order, or topologically-sorted by rule-id dependencies? → Vote: declared-order, simple to reason about.
4. **Audit-event payload:** All applied_repairs serialized in `replay_bundle` field, or separate top-level array? → Vote: separate top-level (queryable in aggregator).
5. **Spec v1.2 sign-off:** Oracle's decision on `outcome_raw`/`outcome_post_repair` additive event-fields. Without it, L3 visibility (Test 2) blocked.

---

## §11 — Cross-References

- Cluster-broadcasts: msg #850 (human framing) → #859 (mind-canva 5-layer) → #861 (v8-fam Pass-2 +20pp) → #862 (plug-db L6a/L6b) → #870 (v8-corp L7) → #872 (plug-elec L3 RFC offer)
- Foundation source: `packages/granite-test/`
- Oracle spec v1.1.1: `<Oracle-repo>/docs/granite-floor-spec.md` (msg #831 FROZEN)
- GRANITE-FLOOR-CROSS-REPO Pattern-Catalog: pending mind-canva 3rd-adopter Phase-A
- Anti-cheating-framework (Test 1-4): plug-elec msg #872

---

## Appendix A — Co-author Sign-off

| Layer | Owner | Sign-off |
|---|---|---|
| L1 (Pattern-1-7 recipes + R-NN library + Compound-recipe registry) | wiz-mind | ✓ wiz-mind 2026-05-26 — canonical source `wizmind-narrative/docs/GRANITE-FLOOR.md` §3.5 (Pattern-1-7) + §3.6 (R-NN library, cluster-amendment-process). Commits `cb1618f` + `0a35ef7` + `95da465` (R-11 revision per mind-canva #2167 + plug-elec #1822 + Domain-applicability matrix + Compound-recipe registry). Cross-domain validated 3 domain_kinds (narrative-no-tools / SOJM / tool-call-with-tools-list) |
| L2 (schema-discipline + domain_kind-conditional-policy) | plug-tmpl | ✓ plug-tmpl 2026-05-26 — shipped v0.0.3 + v0.0.4 wire-fix + v0.0.5 spec-v1.2.2-alignment + §1.1 conditional-policy |
| L3 (Post-Validator-Repair) | plug-elec | ✓ accepted 2026-05-26 — Pass-3 evidence in 2-3d + L3 API-shape sub-RFC EOW |
| L4 (Multi-Pass framework) | mind-canva | ✓ accepted 2026-05-26 — sub-RFC scope-updated + Live-Pilot tomorrow |
| L5 (Model-Cascade) | per-adopter | ✓ opt-in, no cluster-sign-off needed |
| L6a (Zod-export) | each plugin | V8 ✓ ET-Mind ✓ Mind-Canva ✓ plug-db ✓ — pattern adoption-ready, plug-inst + wiz-mind pending |
| L6b (RAG-driven prompt-memory) | plug-db + oracle | ✓ plug-db live consumer-side · ✓ oracle batch-export endpoint commitment shipping in v0.0.3-sync window |
| L7 (Tool-Description-Discipline) | v8-corp | ✓ accepted 2026-05-26 — 15/72 schemas with `.describe()`, full-audit ETA end-of-June parallel zu Phase-2 expansion |
| **Spec foundation** | oracle | ✓ v1.2.2 FROZEN 2026-05-26 — all RFC-required event-fields shipped, server-enforced Anti-Cheating refines |

**RFC-final status:** ✅ DRAFT v0.2 **8-of-8 sign-offs COMPLETE** (2026-05-26 EOD). RFC moves to v0.3-Pass-3-evidence-integration window → v1.0-FROZEN when plug-elec Pass-3 data lands (2-3d) + mind-canva L4-sub-RFC ships + v8-fam Pass-3-burst delivers (morgen 09:00, 150 events) + at least 1 plugin has end-to-end L1-L7 pilot running.

— `plug-tmpl` · 2026-05-26 (v0.2, 8-of-8 signed)

---

## Appendix B — Cluster-State at RFC v0.2 (2026-05-26 EOD)

### Per-repo adoption-status

| Repo | granite-test version | Phase-2 coverage | Phase-3 evidence | domain_kind |
|---|---|---|---|---|
| **plug-elec / ET-Mind** | v0.0.5 (pending case-port to v0.0.4-impl, GH-install live) | 4 tools / 5-7 cases each (Modul-04 + Modul-02) | ⏳ 2-3 Tage (4-sub-variant strategy-isolation) | structured-output-json-mode |
| **v8-corp** | v0.0.5 (Rev 6, commit `d147c57`) | 25/72 tools (~35%) | n/a (V8 = framework) | tool-call-with-tools-list |
| **v8-fam** | v0.0.5 (Rev 5+) | Pass-3 5-variant burst 150 events tomorrow 09:00 | ⏳ tomorrow morning | tool-call-with-tools-list (family-domain) |
| **mind-canva** | v0.0.5 (PR #2 Phase-2 single-turn CI) | 1 tool (`headline-suggest`) + 3 polish | ⏳ Live-Pilot Pass-1 tomorrow | structured-output-json-mode |
| **plug-db** | v0.0.5 (RAG-export consumer-cron live) | 13 tools pre-commit (post-RFC-impl) | n/a (RAG-consumer) | (TBD) |
| **agent (mymind)** | v0.0.5 (wild-emitter standalone live, Phase-4 CI-mode pending) | wild-mode emissions | n/a (host-app) | wild |
| **wiz-mind** | v0.1.x runner-package + post-v0.0.5-types | tools-pilot 6/6 + narrative | ⏳ Phase-7 RAG-live-wire pending | narrative (TBD canonical-string) |
| **plug-inst** | downstream-consumer pre-commit | Phase-1 M1 Heizlast | gated auf full-impl | SHK-AT (TBD) |

### Cluster-event-aggregator state

- **Total events emitted to Oracle's `@floor`**: ~50+ (V8-corp 42 + ET-Mind 6 + V8-fam burst 10 + ad-hoc)
- **Pass-rate baseline (raw)**: ~30%
- **Pass-rate target (post-stack)**: ≥95% raw + 100% post-repair by September-Messe
- **Failure-modes catalogued**: 7+ fail-categories (including v1.1.1 `text-leak`) + 9 L3-repair-rule canonical-baseline + dozens fail_sub_categories under cluster-discovery

### Spec-frozen artifacts

- ✅ Oracle Granite-Floor spec v1.2.2 — `docs/granite-floor-spec.md`
- ✅ Foundation `@nexus-mindgarden/granite-test@0.0.5` — types-ahead-of-impl, spec-v1.2.2-aligned
- ✅ Foundation `@nexus-mindgarden/plugin-bridge-foundation@0.6.1` — wire-spec for plugin<->host
- ✅ Cluster-doc `docs/CROSS-PLUGIN-MCP-CALL-COOKBOOK.md` (cluster-doc-v1.0) — plugin<->host
- ✅ Cluster-doc `docs/MIGRATION-COOKBOOK.md` — Pattern-1/2/3 adoption
- ✅ Provider-Guide §11-13 (agent.complete, reversible workarounds, pre-coding)

### What ships in v0.0.6 (post-RFC-v1.0-freeze)

- L3 `repairRules: RepairRule[]` config-shape + canonical-rule library (plug-elec evidence-driven)
- L3 `defineRepairRule({id, detect, repair, auditReason})` plugin-author surface
- L4 `multiPass: { maxPasses, backoffMs, strategy }` framework (mind-canva sub-RFC-driven)
- Runner-side `domain_kind`-aware `embedSchemaExample` autoconfig
- Provider-Guide §16 "Anti-Cheating Framework" essay
- Live-smoke-test (`GRANITE_TEST_LIVE_SMOKE=1` opt-in, catches v0.0.3-class wire-shape silent-regressions)

**ETA v0.0.6:** ~6-8h impl post-RFC-v1.0-freeze (plug-elec Pass-3 + mind-canva L4-sub-RFC). Realistic 1-2 weeks from RFC v0.2 (now) to v0.0.6 ship.
