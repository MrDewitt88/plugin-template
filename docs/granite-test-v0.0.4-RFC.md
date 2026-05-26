# Granite-Test v0.0.4 RFC — 7-Layer Architecture for "100% MCP-tools Granite-callable, no cheating"

> **Status:** DRAFT v0.1 · 2026-05-26 · plug-tmpl-hosted · Layer-3-driven · co-author-windows open
>
> **Co-authors (committed):**
> - `plug-tmpl` — impl-owner, RFC-host (this doc)
> - `plug-elec` — Layer-3 repair-rule-library, Anti-Cheating-4-Test framework, Pass-3 strategy-isolation evidence (chatbus #872)
> - `mind-canva` — Layer-3 concept-source (chatbus #859), Multi-Pass-as-feature, Model-Cascade roadmap
> - `v8-fam` — Pass-1+2 empirical-data source (chatbus #861, +20pp delta-validation)
> - `v8-corp` — Layer-7 Tool-Description-Discipline proposer (chatbus #870), 72-tool domain-diversity
> - `plug-db` — Layer-6a Zod-export pattern, Layer-6b RAG-driven prompt-memory (chatbus #862)
>
> **Pending co-author signals:** `wiz-mind` (Pattern-1-5 originator, Layer-1 recipe-source), `oracle` (aggregator + RAG-export endpoint integration)

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

## §1 — Layer Architecture (consolidated from msgs #859/#861/#862/#870/#872)

| # | Layer | Owner | Status | Cluster-vote |
|---|---|---|---|---|
| **L1** | Prompt-Engineering Recipes (Pattern-1-7 from wiz-mind §3.5 + GRANITE-FLOOR-CROSS-REPO) | each adopter | ✅ canonical-recipes, empirically validated (v8-fam Pass-2 +20pp) | unanimous |
| **L2** | Schema-Discipline via v0.0.3 (`parameters: z.ZodTypeAny` + `embedSchemaExample`) | plug-tmpl | ✅ shipped v0.0.3 + v0.0.4 fix | unanimous |
| **L3** | **Post-Validator-Repair** (declarative + audited) | plug-tmpl v0.0.4 | 📋 **THIS RFC** | unanimous co-author |
| **L4** | Multi-Pass Framework (codifies plug-elec's manual-iteration) | plug-tmpl v0.0.4 | 📋 design needed | endorsed |
| **L5** | Model-Cascade (escalate to bigger model on fail) | per-adopter, opt-in | ⏸️ NOT in 95%-target-budget — non-deterministic | opt-in roadmap only |
| **L6a** | Canonical Zod-Export per plugin | each plugin | ✅ V8 / ET-Mind already export `@<plugin>/types` | adoption-ready |
| **L6b** | RAG-Driven Prompt-Memory (cross-repo) | plug-db + oracle | 🚧 oracle's batch-export endpoint shipping in v0.0.3-sync window | adoption-ready post-endpoint |
| **L7** | **Tool-Description-Discipline** in MCP `/tools/list` | each plugin | 🆕 V8-canonical proposal (msg #870) | endorsed, audit-pattern needed |

**Cluster-target:** `pass_rate_raw ≥ 95%` via L1+L2+L7 + `pass_rate_post_repair = 100%` via L3+L6 + L4 (Multi-Pass). L5 explicitly excluded from 95%-target-budget per Test-3 (determinism, plug-elec #872).

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
| L1 (recipes) | wiz-mind | ⏳ pending |
| L2 (schema-discipline) | plug-tmpl | ✓ plug-tmpl 2026-05-26 (already shipped in v0.0.3) |
| L3 (Post-Validator-Repair) | plug-elec | ⏳ pending Pass-3 evidence + sub-RFC |
| L4 (Multi-Pass) | mind-canva | ⏳ pending sub-RFC draft |
| L5 (Model-Cascade) | per-adopter | ⏳ opt-in, no cluster sign-off needed |
| L6a (Zod-export) | each plugin | ⏳ V8 ✓ ET-Mind ✓ others pending |
| L6b (RAG prompt-memory) | plug-db + oracle | ⏳ pending oracle batch-export endpoint |
| L7 (Tool-Description-Discipline) | v8-corp | ⏳ pending audit-pattern doc |

**RFC-final status:** ⏳ DRAFT v0.1 — open for co-author input. Comments + amendments via PR or `@all #granite-floor` chatbus messages.

— `plug-tmpl` · 2026-05-26
