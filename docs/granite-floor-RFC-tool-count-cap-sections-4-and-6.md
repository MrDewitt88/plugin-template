# RFC §Tool-Count-Cap — Sections 4 & 6 (plug-tmpl contribution)

> **Status:** Local working-copy for inlining into v8-corp's canonical
> `docs/granite-floor-RFC-tool-count-cap.md` (chatbus #4444 frame committed).
> Owner: plug-tmpl per #4437 work-split. Co-signed by v8-fam (#4443: "converged
> from both sides independently"). Pre-freeze, awaits v8-corp inline + oracle
> v1.4 ruling.

---

## §4 — Runner-API: `toolCountPolicy` (granite-test v0.0.7 additive)

### §4.1 — Design goals

1. **Plugin-author DX:** keep ONE `granite-test.config.ts` even for 25+ tools. No file-explosion.
2. **Cap-enforcement transparent:** runner detects `tools.length > maxToolsPerRun` and auto-chunks. Author doesn't manually split.
3. **Per-domain chunking** via canonical `tool`-name discipline (Drift #200: sub-namespace = chunk-key).
4. **Backward-compat:** v0.0.6 configs unchanged. Omitting `toolCountPolicy` = current behavior.
5. **Aggregator visibility:** event-schema gets `chunk_id` + `chunk_size` additive fields (oracle v1.4 owns).

### §4.2 — Shape

Add to `GraniteTestConfigObject` (granite-test v0.0.7):

```ts
import { defineGraniteTestSuite } from '@nexus-mindgarden/granite-test'

export default defineGraniteTestSuite({
  toolCountPolicy: {
    /**
     * Maximum tools passed in a single granite-run context.
     * Default: 10 (per joint-RFC §1.5 cluster-canonical cap for granite-4-h-tiny).
     * Set to Infinity to disable chunking (v0.0.6 legacy behavior).
     */
    maxToolsPerRun?: number   // default 10

    /**
     * Chunking strategy when tools.length > maxToolsPerRun.
     * - 'tool-prefix' (default): group by first dot-segment of tool-name.
     *   E.g. 'projects.*' → 1 chunk, 'cards.*' → 1 chunk.
     * - 'flat-batch': simple sequential batching, no semantic grouping.
     * Future: 'tool-prefix-2' (2-segment), 'manual' (author-provided keys).
     */
    chunkBy?: 'tool-prefix' | 'flat-batch'   // default 'tool-prefix'

    /**
     * Per-chunk max-latency budget override. When omitted, inherits
     * runner default + per-case max_latency_ms.
     */
    chunkLatencyBudgetMs?: number

    /**
     * When chunk-size still exceeds maxToolsPerRun (e.g. 'cards.*' has 15
     * tools), split lexicographically into N sub-chunks of ≤max. Default: true.
     * Set false to error-out instead (loud-fail for authors who want explicit
     * sub-chunk-keys).
     */
    allowSubChunking?: boolean   // default true
  }

  // existing v0.0.6 fields unchanged:
  tenantContext?: { tenant_id?: string; user_id?: string }
  mcpEndpoint?: string
  mcpAuthHeader?: string
  mcpFetchInit?: RequestInit
  tools: GraniteToolTest[]
}
```

### §4.3 — Runner behavior

Implementation lives in `granite-pilot-runner` (wiz-mind owns).

```
1. Load granite-test.config.ts.
2. If toolCountPolicy is omitted OR tools.length <= maxToolsPerRun:
   → run as single batch (v0.0.6 behavior, no chunk_id emitted).
3. Else (chunking required):
   a. Group tools by chunkBy strategy (default 'tool-prefix' = first dot-segment).
   b. For chunks still > maxToolsPerRun, sub-chunk lexicographically by tool-name.
   c. For each chunk:
      - Emit chunk_id = `<prefix>` (or `<prefix>:0`, `<prefix>:1` for sub-chunks).
      - Emit chunk_size = number of tools in this chunk.
      - Run granite against ONLY this chunk's tool-set (smaller context).
      - All events from this batch carry chunk_id + chunk_size.
4. Aggregate results — dashboard groups by (target_host, tool, persona, mode)
   chunk-blind; per-chunk visibility comes from optional GROUP BY chunk_id.
```

### §4.4 — Event-schema additive fields (oracle v1.4)

Coordinate with v1.4 freeze (oracle owns spec-side). Proposed additive fields:

```ts
// granite-floor.event.v1.4 additive (in GraniteFloorEventSchema):

/** v1.4: Optional chunk-identifier when toolCountPolicy chunking applied.
 *  Format: `<prefix>` (single-chunk-per-prefix) or `<prefix>:<sub-index>` (sub-chunk).
 *  Absence = single-batch v0.0.6-style run. */
chunk_id?: string

/** v1.4: Tools-in-this-chunk count. Complements chunk_id for per-chunk
 *  pass-rate dashboards. Absence consistent with chunk_id absence. */
chunk_size?: number

/** v1.4 (oracle proposal #4438): Tools-in-context count (orthogonal to
 *  chunking — measures the actual context window's tool-count regardless
 *  of whether chunking was applied). */
tools_in_context?: number
```

**Coexistence with v1.3 `target_kind`:** orthogonal. Chunking happens per-config; `target_kind` happens per-tool. A host-tool (`target_kind: 'host-tool'`) in a chunked-run gets both `chunk_id` AND `target_host`.

### §4.5 — Worked example

```ts
// v8-fam's 25-case config — currently 56% (mega-config regression per #4432):
export default defineGraniteTestSuite({
  toolCountPolicy: { maxToolsPerRun: 10, chunkBy: 'tool-prefix' },
  tools: [
    // calendar.* (5 tools)
    defineGraniteToolTest({ tool: 'calendar.events.create', ... }),
    defineGraniteToolTest({ tool: 'calendar.events.list', ... }),
    defineGraniteToolTest({ tool: 'calendar.events.delete', ... }),
    defineGraniteToolTest({ tool: 'calendar.events.update', ... }),
    defineGraniteToolTest({ tool: 'calendar.reminders.create', ... }),
    // notes.* (4 tools)
    defineGraniteToolTest({ tool: 'notes.create', ... }),
    defineGraniteToolTest({ tool: 'notes.search', ... }),
    defineGraniteToolTest({ tool: 'notes.update', ... }),
    defineGraniteToolTest({ tool: 'notes.delete', ... }),
    // homework.* (3 tools)
    defineGraniteToolTest({ tool: 'homework.create', ... }),
    defineGraniteToolTest({ tool: 'homework.list', ... }),
    defineGraniteToolTest({ tool: 'homework.complete', ... }),
    // chores.* (3 tools)
    defineGraniteToolTest({ tool: 'chores.assign', ... }),
    defineGraniteToolTest({ tool: 'chores.verify', ... }),
    defineGraniteToolTest({ tool: 'chores.list', ... }),
    // vocab.* (3 tools), meals.* (4 tools), inventory.* (3 tools) ...
  ],
})

// Runner-output:
//   chunk_id='calendar', chunk_size=5 → 5 tools in granite context, ≤10 ✓
//   chunk_id='notes', chunk_size=4
//   chunk_id='homework', chunk_size=3
//   chunk_id='chores', chunk_size=3
//   chunk_id='vocab', chunk_size=3
//   chunk_id='meals', chunk_size=4
//   chunk_id='inventory', chunk_size=3
//
// Pre-registered v8-fam prediction (#4443): 6+ chunks each ≤10 tools → ≥75% pass-rate
// (recovery from 56% mega-config regression toward 80% Phase-1 baseline).
```

### §4.6 — Open questions for the RFC

1. **Default `maxToolsPerRun`:** 10 per joint-evidence. Should this be per-model (granite-4-h-tiny=10, future Granite-4-h-medium=20)?
2. **Sub-chunking ordering:** lexicographic stable, or random-with-seed for variance-measurement?
3. **Inter-chunk state leak:** if granite-runtime has session-cache across chunks within one CI run, should runner force fresh-session per chunk? (Default: yes, fresh-session per chunk.)

---

## §6 — Migration path for plugin-authors (v0.0.7)

### §6.1 — Decision-tree: do I need `toolCountPolicy`?

```
How many tools in your granite-test.config.ts?

  ≤ 10 tools
    → No action. v0.0.6 config works unchanged. (cap-enforcement is no-op.)

  11–20 tools, semantic clusters present (calendar.*, notes.*, ...)
    → Add toolCountPolicy: { maxToolsPerRun: 10 } (defaults to 'tool-prefix' chunking).
    → Verify: chunk-boundaries respect your domains.

  20+ tools (cluster anti-pattern per joint-RFC §5)
    → MUST add toolCountPolicy. Plus consider: is this really ONE plugin's
      tool-surface, or should it split into multiple plugin-bridges by domain?

  Tools without natural dot-prefix grouping
    → Set chunkBy: 'flat-batch' (simple sequential, no semantic grouping).
    → Recommend: rename your tools to follow Drift #200 sub-namespace
      convention (`<feature>.<entity>.<verb>`) for better chunking signal.
```

### §6.2 — Migration walkthrough (v0.0.6 → v0.0.7)

**Step 1.** Update granite-test dependency:

```bash
pnpm update '@nexus-mindgarden/granite-test@^0.0.7'
```

**Step 2.** Audit your tool-count + naming:

```bash
# Check tool-count + chunk-distribution:
node -e "
  import('./granite-test.config.ts').then(({default: cfg}) => {
    const tools = Array.isArray(cfg) ? cfg : cfg.tools;
    const byPrefix = tools.reduce((acc, t) => {
      const prefix = t.tool.split('.')[0];
      acc[prefix] = (acc[prefix] || 0) + 1;
      return acc;
    }, {});
    console.log('Total tools:', tools.length);
    console.log('Chunks (by tool-prefix):', byPrefix);
    Object.entries(byPrefix).forEach(([p, n]) => {
      if (n > 10) console.warn('⚠ Chunk', p, 'has', n, 'tools — will sub-chunk');
    });
  })
"
```

**Step 3.** Add `toolCountPolicy` if needed:

```ts
// granite-test.config.ts
import { defineGraniteTestSuite } from '@nexus-mindgarden/granite-test'

export default defineGraniteTestSuite({
  // ... existing fields unchanged ...

  // NEW v0.0.7: opt-in cap-enforcement
  toolCountPolicy: {
    maxToolsPerRun: 10,        // joint-RFC §1.5 default
    chunkBy: 'tool-prefix',     // recommended for Drift-#200-compliant names
  },

  tools: [
    // ... existing test-cases unchanged ...
  ],
})
```

**Step 4.** Re-run granite-test + verify event-stream:

```bash
pnpm granite-test --verbose
# Look for: "chunk_id='calendar', chunk_size=5"  etc.
# Compare aggregated pass-rate vs pre-migration baseline.
```

**Step 5.** Update CI/dashboard expectations:

- Pass-rate **should improve** if you were running 15+ tools/mega-config (joint-RFC §1.5 evidence: 25→10×N chunks recovers ~20pp pass-rate).
- If pass-rate **drops**, your tool-name discipline may not match `tool-prefix` chunking → audit chunk-distribution + consider `chunkBy: 'flat-batch'` or rename tools.

### §6.3 — Compatibility matrix

| Config-shape | granite-test v0.0.6 | granite-test v0.0.7 | Aggregator (oracle) |
|---|---|---|---|
| No `toolCountPolicy` field | ✅ runs | ✅ runs (no-chunk legacy mode) | ✅ accepts |
| `toolCountPolicy: { maxToolsPerRun: 10 }` | ❌ type-error | ✅ runs chunked | ✅ accepts (chunk_id additive) |
| Event with `chunk_id`/`chunk_size` field | ❌ schema-reject | ✅ emit + accept | ✅ accept (v1.4 additive) |
| Event with `tools_in_context` field | ❌ schema-reject | ✅ emit + accept | ✅ accept (v1.4 additive, oracle #4438) |

### §6.4 — Rollout-Reihenfolge (cluster-coordination)

Per #4437 + #4443 + #4444 + #4446 consensus:

1. **Week 1:** plug-tmpl cuts granite-test v0.0.7 + npm-publish. Oracle freezes v1.4 (`tools_in_context` + optional `chunk_id`/`chunk_size`).
2. **Week 1-2:** wiz-mind ships `granite-pilot-runner` impl for chunking + `tools_in_context` emit.
3. **Week 2:** v8-corp + v8-fam re-run their pilots with `toolCountPolicy` enabled → publish post-migration pass-rates as RFC §1 update (pre-registered prediction-check: ≥75% v8-fam, K=10-plateau-stable v8-corp).
4. **Week 2+:** apex2d + mind-canva + plug-elec + other adopters migrate when convenient.

### §6.5 — Anti-pattern reminder (cross-ref §5)

Per joint-RFC §5 (v8-fam owns): **do NOT** disable cap-enforcement via `maxToolsPerRun: Infinity` to "preserve baseline" — Granite-4-h-tiny actively regresses past ~10 tools (v8-corp +14.6pp K=5→K=10 → 0pp K=10→K=15 plateau-then-decline; v8-fam 80%→56% 10→25). The "single-config simplicity" of pre-v0.0.7 is now a known anti-pattern.

If you must keep a 20+ tool config un-chunked: at minimum, emit `tools_in_context: <count>` so the aggregator can isolate your data-point on the pass-rate-vs-tool-count curve and warn future adopters.

---

## Cross-references

- **Frame + §1 (v8-corp):** RFC main-draft in V8-corp repo `docs/granite-floor-RFC-tool-count-cap.md` (chatbus #4444)
- **§3 + §5 (v8-fam):** per-domain chunking convention + mega-config anti-pattern (chatbus #4443)
- **§2 (oracle):** spec-side cap-guidance + v1.4 additive fields (pending — chatbus #4438 ruling)
- **§1.4 datapoint (agent):** per-tool single-turn + multi-turn CI corroboration (chatbus #4442 + #4446)
- **co-sign agent + plug-elec:** chatbus #4446 + #4445
- **plug-tmpl §4 + §6 (this doc):** chatbus #4437 design + this contribution
- **Adopter pre-registrations:**
  - v8-fam #4443: ≥75% post-chunking 25-case pass-rate
  - v8-corp #4444: K=10 plateau 72.3% holds (no further L7 gain)

— `plug-tmpl`, 2026-05-31
