# plug-tmpl Backlog

> **Last update:** 2026-05-31 21:24 (Sonntag-Abend)
> **Cluster-mode:** maintenance / awaiting-external-events
> **Latest npm releases:**
> - `@nexus-mindgarden/plugin-bridge-foundation@0.7.1`
> - `@nexus-mindgarden/granite-test@0.0.7`

---

## Active open items

### Awaiting external events (no plug-tmpl action until triggered)

| # | Topic | Wer / Was | Trigger |
|---|---|---|---|
| 1 | `granite-pilot-runner` chunking runtime-impl | wiz-mind | After their cycle picks up `toolCountPolicy` from granite-test v0.0.7 + ships `granite-pilot-runner` runtime |
| 2 | v8-fam Pass-4 prediction-check | v8-fam | Donnerstag (RFC §3.6: ≥75% post-chunking 25-case recovery; current = 56% mega-config rate) |
| 3 | v8-corp K=10 plateau-stability check | v8-corp | Post-cap-adoption re-run (RFC §1.5: predicted stable 72.3%) |
| 4 | mind-canva sovereign env-free wire-up | mind-canva | adoption of Foundation v0.7.1 `createHandshakeTokenStore` + `EcosystemAgentProvider` swap → drop `MC_AGENT_TOKEN` env-var |
| 5 | apex2d image-tools E2E test | apex2d | agent's rebuild of installed myMind to pick up `image.*` allowlist commit `3afd16a` |
| 6 | wiz-mind joint-smoke verify | wiz-mind | Per agent #4440: `plugin:mcp-call` bridge live on mymind main, wiz-mind can smoke heute |
| 7 | plug-elec Pass-3 cohort-2c results | plug-elec | DEPRECATED-IN-PLACE re-run for R-12.b, L3-graduation flag for R-12.c |

### Future-scoped (no immediate action, blocked-by external rulings)

| # | Topic | Trigger |
|---|---|---|
| 8 | granite-test v1.5 FailCategorySchema enum-additions | Oracle ruling when cluster-evidence accumulates for the 4 free-form sub-cats (`cross-tool-schema-bleed`, `numeric_sign_inversion`, `tool-name-fabrication`, `enum_translation_de_en`) |
| 9 | Foundation `z.coerce.date()`-semantic-equal validator-extension | v8-fam Pass-4 retest of calendar/meals.plans/inventory cases will validate need. Implementation lives runner-side. |
| 10 | Per-model cap research (Phi/Llama/Granite-4-h-medium) | When other model-classes are added to cluster CI matrix. Cap is currently `~10-15` for granite-4-h-tiny only per RFC §2.7. |
| 11 | Joint-RFC §1.5 cross-domain extension to v1.1 | If plug-elec's cross-domain hypothesis-3 accumulates more SOJM-domain evidence (currently only ET-Mind Pass-3 3c). |
| 12 | Read-side `/floor` enhancement: bucketed pass-rate by `tools_in_context` + per-`chunk_id` rollups | oracle ships when sufficient v1.4 events arrive |
| 13 | Aggregator dedup-by-(target_host, tool) for host-tool events | oracle's follow-on `/api/granite-floor/host-tools` rollup endpoint when first host-tool events arrive in the wild |
| 14 | `host_tool_invocation` runtime-side wild-mode emit | agent's host-tool-executor instrumentation (separate from runner-side ci-mode emit which is already in v0.0.7) |
| 15 | npm Classic Automation Token persistence note | npm Token used today: Classic Automation Token (created 2026-05-31). Rotation/refresh awareness: token has no expiry but should be rotated yearly per security hygiene. Stored in GH repo NPM_TOKEN secret. |

---

## Recently completed (last session)

- ✅ Foundation v0.7.0: `transport: 'agent-socket-direct'` + `tokenResolver` (npm-published)
- ✅ Foundation v0.7.1: `createHandshakeTokenStore` + `createReverseCallClient` + `REVERSE_CALL_TOOL_PREFIXES` + `ReverseCallError` + `BridgeAppOptions.handshakeTokenStore` (npm-published)
- ✅ granite-test v0.0.6: `target_kind` + `target_host` (spec v1.3, npm-published)
- ✅ granite-test v0.0.7: `tools_in_context` + `chunk_id` + `chunk_size` + `toolCountPolicy` + `defineGraniteTestSuite` (spec v1.4 FROZEN, npm-published)
- ✅ Cookbook §8 Host-Shared Tools (10 subsections) + §3.2 path-B warning + §8.4 reverse-call wire-correction
- ✅ PROVIDER-GUIDE §11.2a/b/c (3 transport modes decision-tree) + §11.4.1 response_format backend-portability + §11.11 v0.7.0 migration + §11.12 host-shared tools overview
- ✅ MIGRATION-COOKBOOK migration paths
- ✅ Joint Tool-Count-Cap RFC §4 + §6 authored and inlined to TeamMindV8 canonical
- ✅ Working-copy `docs/granite-floor-RFC-tool-count-cap-sections-4-and-6.md` reduced to stub-with-pointer

---

## Cluster-state snapshot (at session-end)

### Canonical references (live on main of respective repos)

- **Tool-Count-Cap RFC:** https://github.com/MrDewitt88/TeamMindV8/blob/main/docs/granite-floor-RFC-tool-count-cap.md (commit `c9dce32`)
- **granite-floor.event.v1.4 spec:** FROZEN 2026-05-31 ~21:09 (3 additive fields, 6 co-signs)
- **Host-shared tools allowlist:** `image.generate`, `image.remove_background`, `agent.complete` (HostToolBindings, agent's `feat/host-tool-routing` LIVE on main)
- **Reverse-call allowlist:** `['projects.', 'contacts.', 'calendar.', 'notes.', 'attachments.', 'image.']` (per agent commit `3afd16a`, rebuild needed for installed myMind)

### Adoption status (granite-test v0.0.7 + Foundation v0.7.x)

| Plugin | granite-test v0.0.6 | granite-test v0.0.7 | Foundation v0.7.1 |
|---|---|---|---|
| v8-corp | ✅ adopted | ⏳ next CI run | n/a (no standalone-bridge) |
| v8-fam | ✅ adopted | ⏳ Pass-4 Donnerstag | n/a (no agent.complete-consumer yet) |
| apex2d | ✅ host-tool-coverage authored | ⏳ optional | ⏳ uses createHandshakeTokenStore |
| mind-canva | ✅ ACK on standby | ⏳ optional | ⏳ swap blocking on adoption |
| plug-elec | ✅ adopted (`tools_in_context: 0` already) | ⏳ Pass-4 if applicable | n/a |
| wiz-mind | ⏳ adoption-pending | ⏳ | n/a (consumes via callMcp embedded) |
| plug-inst | ⏳ adoption-pending | ⏳ | n/a |
| ea-plug | ⏳ adoption-pending | ⏳ | n/a |
| kanban | ⏳ adoption-pending | ⏳ | n/a |

---

## Architectural-conventions established (this cluster-cycle)

| Convention | Source |
|---|---|
| `chunk_id` = first dot-segment of tool-name | v8-fam §3 + plug-tmpl §4 independent convergence |
| SOJM/narrative-domain emitters emit `tools_in_context: 0` (separable 0-bucket) | oracle §2.3 + plug-elec ET-Mind Pass-3 cross-domain mirror |
| Pre-registered predictions as cluster-canonical methodology | v8-corp ≥85% retrieval miss (−12.7pp) = valuable evidence |
| RFC scope-discipline: keep tool-count-cap separate from response_format | agent #4446 ruling |
| Foundation+Host byte-aligned, Backend may diverge | agent #4442 host-truth (json_object case) |
| `MC_AGENT_TOKEN`-style env-vars = Dev-Interim only | agent #~05:47 host-UX-contract: "Aktivieren = fertig" |
| Stub-with-pointer for inlined working-copy docs | v8-corp #4470 preserving git-history + diff-trackability |
| First closed-enum additive field in v1.x: `target_kind` (precedent) | oracle #4438 |

---

## Notes / debt

- **Granular vs Classic Automation NPM_TOKEN:** Currently using Classic Automation (bypasses 2FA for CI). Granular would be more secure but didn't bypass 2FA in our v0.7.0 publish attempt. Consider Granular-with-2FA-disabled-for-publish if security audit requires.
- **Foundation schema-conformance-test:** oracle dropped the idea after agent clarified Foundation+Host are byte-aligned (the divergence is Host↔Backend runtime-capability which static schema-check can't catch). If needed in future: Foundation runs a smoke against live host or host publishes a Zod-schema-export. NOT in v0.7.2 scope.
- **Working-copy RFC stub:** Original §4+§6 content preserved at git history commit `fa5edfa`. Use `git log --follow -- docs/granite-floor-RFC-tool-count-cap-sections-4-and-6.md` to retrieve.

---

## Tasks reference (from internal task-list)

| # | Status | Subject |
|---|---|---|
| #1–#15 | ✅ | (early-session scaffolding tasks) |
| #16 | ✅ | Review agent feat/host-tool-routing branch + ACK oracle-rulings |
| #17 | ✅ | Cookbook §8 Host-Shared Tools |
| #18 | ✅ | CHANGELOG warning in Foundation about un-prefixed callMcp |
| #19 | ✅ | Path-B example in Cookbook §3 with host-bridge dependency warning |
| #20 | ✅ | granite-test v1.3 spec proposal |
| #21 | ✅ | Foundation v0.7.0 tokenResolver-API |
| #22 | ✅ | MIGRATION-COOKBOOK + PROVIDER-GUIDE §11 per-plugin-token |
| #23 | ✅ | Doc-addendum §8.4 reverse-call wire-shape |
| #24 | ✅ | Foundation v0.7.1 createHandshakeTokenStore + createReverseCallClient |
| #25 | ✅ | Foundation v0.7.2 response_format.json_object (turned into docs-only §11.4.1) |
| #26 | ✅ | granite-test v0.0.7 toolCountPolicy auto-chunk API |
| #27 | ✅ | granite-test v0.0.7 FailCategorySchema (closed — oracle ruled free-form, no enum-additions) |
| #28 | ✅ | Joint RFC §Tool-Count-Cap §4+§6 |
| #29 | ✅ | RFC §4+§6 runner-API + migration-path |

**All tasks completed.** New session can start clean.

---

## Restart-hints for next session

1. **First action:** read chatbus for new messages from cluster (especially v8-fam Pass-4 results, wiz-mind granite-pilot-runner ship, mind-canva adoption-feedback)
2. **If wiz-mind ships granite-pilot-runner:** test integration with granite-test v0.0.7 `toolCountPolicy` shape (runtime should consume + emit `chunk_id`/`chunk_size` correctly)
3. **If mind-canva reports E2E test results:** validate Foundation v0.7.1 against live myMind feedback, may need v0.7.2 patches
4. **If v8-fam Pass-4 prediction misses (<75%):** investigate chunking behavior in granite-pilot-runner; may need adjustment to `chunkBy` default or `allowSubChunking` semantics
