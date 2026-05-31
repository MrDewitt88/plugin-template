# @nexus-mindgarden/granite-test

Granite-Floor test-coverage framework for cluster-wide MCP-tool quality measurement.

> **Pre-release skeleton — v0.0.1.** Package shape is settled, runtime implementation lands once Oracle's `granite-floor.event.v1` spec freezes (2026-05-27) AND the v0.7.0 decision-gate hits (≥2 consumer-side adoption signals from wiz-mind + plug-elec).

## Purpose

The cluster-goal: by the September-Messe, **100% of MCP-tools across ~27 plugin-repos must be reliably callable from Granite-4-tiny-4bit** (sovereign-AI floor = product-differential).

Today: ~80% callable, no systematic measurement. This package provides the missing measurement-layer.

## Architecture (3-side ownership)

```
Oracle      = schema + aggregator + dashboard (@floor target)
plug-tmpl   = @nexus-mindgarden/granite-test  ← THIS PACKAGE
              + create-plugin CLI integration
              + .github/workflows/granite-test.yml.template
              + granite-test.config.ts template
wiz-mind    = @nexus-mindgarden/granite-pilot-runner  (runner-core, peerDep)
Repos       = granite-test.config.ts (consumer)
```

This package wraps `@nexus-mindgarden/granite-pilot-runner` (runner-mechanics owned by wiz-mind, extracted from their narrative-domain Granite-Pilot) with tool-call-domain-specifics:
- Config-shape (`defineGraniteToolTest`)
- Transport-adapter (`reportToCluster` → chatbus `@floor` reserved-role)
- Fail-categorization (6 fix categories per spec v1)

## Plugin-author usage (post-decision-gate)

```ts
// granite-test.config.ts in your plugin-repo root
import { defineGraniteToolTest } from '@nexus-mindgarden/granite-test'

export default [
  // Plugin-tool (this plugin owns + serves it):
  defineGraniteToolTest({
    tool: 'plug-elec.kabel.dimensionierung',
    persona: 'user',
    cases: [
      {
        case_id: 'kabel.16A-25m',
        prompt: 'Dimensioniere 16A Drehstromkreis 25m Länge',
        expected_tool_args: { strom: 16, phasen: 3, laenge: 25 },
        max_latency_ms: 8000,
      },
    ],
  }),

  // Host-tool (v0.0.6+, spec v1.3) — this plugin only consumes:
  defineGraniteToolTest({
    tool: 'image.generate',              // un-prefixed host-shared name
    persona: 'user',
    target_kind: 'host-tool',             // NEW v0.0.6 (spec v1.3)
    target_host: 'theseus',               // canonical theseus | v8 | v8-fam | markview
    cases: [
      {
        case_id: 'image.generate.pixel-tile-256',
        prompt: 'pixel-art forest tile 256x256',
        expected_tool_args: { width: 256, height: 256 },
        max_latency_ms: 30000,
      },
    ],
  }),

  defineGraniteToolTest({
    tool: 'plug-elec.project.delete',
    persona: 'admin',
    cases: [
      // …
    ],
  }),
]
```

### Host-shared tools (v0.0.6+, spec v1.3 FROZEN 2026-05-31)

Three host-shared callMcp tools land via agent's `feat/host-tool-routing` triple-landing 2026-05-31:

| Tool | Hosts | actorClass v1 | Wire-spec source |
|---|---|---|---|
| `image.generate` | theseus :3401 (Bonsai sidecar §2.5) | `'user'` only | `@theseus/tools-image-schema` |
| `image.remove_background` | theseus (ISNet via `@imgly/background-removal-node` §2.6) | `'user'` only | `@theseus/tools-image-schema` (same package, 2 tools) |
| `agent.complete` | theseus :3400 (agent-socket §2.7 (a)+(b)) | `'user'` + `'system'` | `@theseus/agent-complete-schema` v0.15.0 FROZEN |

Plugin-authors emit `target_kind: 'host-tool'` + `target_host: 'theseus'` for granite-coverage of these tools. Aggregator dedupes by `(target_host, tool)` (read-side `/api/granite-floor/host-tools` rollup follow-on; today's `tools_summary` continues grouping by `(repo, tool, persona, mode)` for attribution-by-emitter).

Run locally:
```bash
pnpm granite-test
```

CI: the `.github/workflows/granite-test.yml.template` (plug-tmpl-shipped) runs on every commit + reports events to Oracle's aggregator.

## Subpath exports

| Subpath | Purpose |
|---|---|
| `@nexus-mindgarden/granite-test` | Main API: `defineGraniteToolTest`, `reportToCluster` |
| `@nexus-mindgarden/granite-test/types` | Type-only re-exports (zero runtime, for compile-time imports) |
| `@nexus-mindgarden/granite-test/reporter` | Transport API: `reportToCluster`, `ReportToClusterError` |

## Persona-field design (agent msg #701)

Required field per tool-test. Three values:
- `user` — User-Agent mymind-mode (User-Privileges)
- `admin` — Kiara-Persona mymind-mode (Admin-Privileges)
- `any` — persona-agnostic (default, surfaced as "unclassified" in dashboard)

Oracle's dashboard drills down `Kiara-Admin pass-rate vs User-Agent pass-rate` per tool — divergence signals that persona-system-prompts wirk unterschiedlich gut auf Granite. **Disjoint buckets** (plug-tmpl vote in Q#2, msg #713): `any` is its own bucket, not double-counted in user+admin.

## Event-shape (per Oracle spec v1)

Every test-case-result becomes one `granite-floor.event.v1` event:

```typescript
{
  event_kind: 'granite-floor.event.v1',
  run_id: '<uuid>',
  case_id: 'kabel.16A-25m',
  repo: 'plug-elec',
  tool: 'plug-elec.kabel.dimensionierung',
  persona: 'user',
  mode: 'ci',         // or 'wild' for mymind-observed in-the-wild
  outcome: 'pass',    // or 'fail'
  fail_category: null,  // 6 fix categories if outcome='fail'
  fail_detail: null,
  model: 'granite-4-h-tiny-4bit',
  latency_ms: 3421,
  timestamp: '2026-05-24T11:30:00.000Z',
  multiturn: { step_count: 1, failed_at_step: null, expected_tools: [...] },
  replay_bundle: { user_prompt, granite_output, tool_state },
}
```

Transport: chatbus `post_message` mit `to_role="@floor"` (reserved-virtual-role, bypasses chat-stream-inbox), `thread="granite-floor"`. Total event size capped at 64 KB.

## Fail-categories (6 fix in v1, new = v2)

| Category | When |
|---|---|
| `schema-issue` | Granite output ≠ Zod-input-schema |
| `multiturn-state-loss` | State-context from step N missing in step N+1 |
| `hallucination` | Tool nicht existent / args erfunden |
| `silent-fail` | Kein tool-call obwohl prompt es verlangte |
| `length-exceeded` | Output exceeded max-token budget |
| `latency-spike` | Call exceeded `case.max_latency_ms` |

## Cross-References

- **Oracle spec:** `docs/granite-floor-spec.md` (Oracle repo, msg #708)
- **chatbus thread:** `#contracts` 2026-05-24 (msg #693 agent ask → #708 Oracle spec → #713 plug-tmpl ack)
- **Pre-design DM:** plug-tmpl msg #713 (3 votes + #6 backpressure batching-proposal)
- **Ownership map:** agent msg #701
- **Decision-gate candidates:** wiz-mind (msg #709), plug-elec (agent ping pending)

## Live smoke-test (opt-in)

The test-suite includes a live smoke-test that catches wire-shape silent-regressions (the class of bug that v0.0.3 had — built shape that returned 200 but never persisted). To run:

```bash
GRANITE_TEST_LIVE_SMOKE=1 \
CHATBUS_ENDPOINT=http://127.0.0.1:7878/api/messages \
pnpm test
```

The test:
1. Emits a marker-event via `reportToCluster()` with unique `run_id`
2. Polls `GET /api/granite-floor/health` before + after
3. Asserts `events_total` counter incremented (catches silent-200-no-persist class of bug)
4. (Optional) Verifies marker-event appears in `/api/granite-floor/runs?repo=plug-tmpl`

Without both env-vars set, the test is **skipped** (vitest reports as `skip`, not `fail`) — safe for any CI environment.

**Plugin-authors should run this opt-in test at least once after upgrading granite-test or chatbus-web** to catch wire-shape regressions before they cause silent 0-emission across the cluster.

## Status

- ✅ Skeleton landed (this package)
- ⏳ Oracle spec-freeze 2026-05-27
- ⏳ wiz-mind extract `@nexus-mindgarden/granite-pilot-runner`
- ⏳ Decision-gate: wiz-mind + plug-elec adoption signals
- ⏳ Full impl (post-decision-gate)
- ⏳ create-plugin CLI integration
- ⏳ GitHub Actions workflow template

## License

MIT
