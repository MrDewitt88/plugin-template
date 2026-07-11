# plug-tmpl Backlog

> **Last update:** 2026-07-11 (plugin-rollout session)
> **Cluster-mode:** plugin-rollout (customer-pilot) — co-authoring the lifecycle spec with agent
> **Drift #105:** ✅ CLOSED (a+b+c, 0.7.2-verified). **Drift #101 (Bun):** ✅ live in Describe-Mind. **markview adoption blockers #5345/#5348:** ✅ ALL shipped (v0.8.0 + v0.9.0).
> **RFC `requires.scopes`:** ✅ RATIFIED (oracle #5418) + SHIPPED v0.11.0. **Node 24** is the floor (CI `24.x`, `engines.node >=24`, action majors node24, `@types/node ^24`).
> **Plugin-rollout (agent #6044 + #6046):** ✅ SHIPPED — `manifest.<id>.yaml` dual-read + deterministic `bundle.tgz` packer + env-first `PLUGIN_BRIDGE_PORT` + `bundle.launch.json` launch-contract (bridge-foundation@0.12.0 + create-plugin@0.8.0).
> **Latest npm releases:**
> - `@nexus-mindgarden/create-plugin@0.8.0` (NEW — `bundle.launch.json` launch-contract, packer-validated; agent #6046)
> - `@nexus-mindgarden/plugin-bridge-foundation@0.12.0` (`discoverManifest` manifest.<id>.yaml dual-read; plugin-rollout agent #6044)
> - `@nexus-mindgarden/create-plugin@0.7.0` (manifest.<id>.yaml scaffold + deterministic bundle packer + env-first port + Node24)
> - `@nexus-mindgarden/plugin-bridge-foundation@0.11.0` (`requires.scopes` outgoing-grant ⟂ incoming-floor; RFC RATIFIED oracle #5418)
> - `@nexus-mindgarden/plugin-license-foundation@0.1.0` (NEXUS entitlement LicenseGate; offline JWKS verify, default-deny, grace)
> - `@nexus-mindgarden/plugin-bridge-foundation@0.10.0` (canonical V8 claim-set + raw-claims passthrough, markview #5357 / wiz-mind §7)
> - `@nexus-mindgarden/plugin-bridge-foundation@0.9.0` (per-host iss/aud binding + verify hardening, markview #5345)
> - `@nexus-mindgarden/plugin-bridge-foundation@0.8.0` (enforceScopes + staticUi allowedExtensions, #5206/#5348b)
> - `@nexus-mindgarden/plugin-storage-foundation@0.7.0` (runtime-agnostic / Bun support, Drift #101)
> - `@nexus-mindgarden/granite-test@0.0.7`

---

## Active open items

### Awaiting external events (no plug-tmpl action until triggered)

| # | Topic | Wer / Was | Trigger |
|---|---|---|---|
| 1 | `granite-pilot-runner` chunking runtime-impl | wiz-mind | After their cycle picks up `toolCountPolicy` from granite-test v0.0.7 + ships runtime |
| 2 | v8-fam Pass-4 prediction-check | v8-fam | K-knob cohort (RFC §3.6: family-domain K=5 ≥60% lower-bound) |
| 3 | v8-corp K=10 plateau-stability check | v8-corp | Post-cap-adoption re-run (RFC §1.5: predicted stable 72.3%) |
| 4 | mind-canva sovereign env-free wire-up | mind-canva | adoption of Foundation `createHandshakeTokenStore` + `EcosystemAgentProvider` swap → drop `MC_AGENT_TOKEN` env-var |
| 5 | apex2d image-tools E2E test | apex2d | agent's rebuild of installed myMind to pick up `image.*` allowlist |
| 6 | plug-elec Pass-3 cohort-2c results | plug-elec | DEPRECATED-IN-PLACE re-run for R-12.b, L3-graduation flag for R-12.c |

> **Closed 2026-06-06:** ~~Theseus register-host (a) key-fix~~ → agent shipped + 0.7.2-verified (#4671). · ~~Describe-Mind Stufe-5 Bun-Wire-up~~ → live (oracle #4670).
> **Closed 2026-06-27 (this session):** ~~markview #5206 scope-gap~~ → v0.8.0 `enforceScopes`. · ~~markview #5348b staticUi allowlist~~ → v0.8.0. · ~~markview #5345.1 verifyBridgeToken iss/aud~~ + ~~#5345.2 HostKeyRecord fields~~ + ~~#5348a aud claim/mint~~ → v0.9.0. · ~~plug-ea T13 Foundation-adoption Q (linking + auth/scope)~~ → answered (#5212) + scopes now a flag. **markview can now drop ~700–900 LOC.** Awaiting markview's actual adoption + any migration-against-live-host_keys feedback.

### Future-scoped (no immediate action, blocked-by external rulings)

| # | Topic | Trigger |
|---|---|---|
| 9 | granite-test v1.5 FailCategorySchema enum-additions | Oracle ruling when cluster-evidence accumulates for the 4 free-form sub-cats |
| 10 | Foundation `z.coerce.date()`-semantic-equal validator-extension | v8-fam Pass-4 retest of calendar/meals.plans/inventory cases will validate need |
| 11 | Per-model cap research (Phi/Llama/Granite-4-h-medium) | When other model-classes are added to cluster CI matrix |
| 12 | Read-side `/floor` enhancement: bucketed pass-rate by `tools_in_context` + per-`chunk_id` rollups | oracle ships when sufficient v1.4 events arrive |
| 13 | Aggregator dedup-by-(target_host, tool) for host-tool events | oracle's follow-on rollup endpoint when first host-tool events arrive |
| 14 | `host_tool_invocation` runtime-side wild-mode emit | agent's host-tool-executor instrumentation |
| 15 | storage-foundation `bun:sqlite` openConnection convenience | If multiple Bun-plugins want it — currently consumers open `new Database()` themselves. Revisit if 2+ Bun-plugins exist. |
| 16 | Foundation `actor_class`-gated cross-tenant authz on /execute-tool | BLOCKED on v8-corp ruling #5206 (kiara-admin impersonation semantics). v0.8.0 scope-enforcement deliberately reads only claims.scopes — no actor_class/tenant authz. |
| 17 | Relax `tenant_id`/`user_id` from `z.string().uuid()` → `z.string().min(1)` (or opt-in `relaxedIds`) across execute-tool/render-ui/invoke-hook/handshake | On-demand: plug-ea hit it (non-UUID test/bootstrap tenants, #5363) — non-blocking, real tokens are UUIDs. 2nd "Foundation stricter than needed" datapoint after the claim-set (v0.10.0). Do if plug-ea or another host confirms a real ongoing need; else hold (uuid = real validation). |

---

## Active threads (this session, awaiting others)

| Topic | Owner / Next | State |
|---|---|---|
| **Plugin-rollout** (manifest-filename + bundle + lifecycle) | agent (host discovery walker + bundle-start) · cad2d (first e2e) | ✅ **plug-tmpl side SHIPPED** (agent #6044 ruled A/B/C). `bridge-foundation@0.12.0` `discoverManifest` (manifest.<id>.yaml dual-read, suffix==id guard) + `create-plugin@0.7.0` (scaffold manifest.<id>.yaml, zero-dep deterministic `bundle.tgz` packer + `bundle.meta.json{signature:null}`, env-first `PLUGIN_BRIDGE_PORT`, Node24, NOTICES/provenance). **Awaiting:** agent's host-side discovery walker (matches only literal `manifest.yaml` today, manifest-loader.ts:171) + bundle-start/lifecycle; cad2d 1.2.0 env-first conformance. |
| **RFC `requires.scopes`** (incoming-floor ⟂ outgoing-grant) | hosts (agent/v8-corp/v8-fam): switch minting seed | ✅ **SHIPPED v0.11.0** (oracle ruling #5418 ratified name `requires.scopes`). Manifest `requires.scopes` (optional, no default) frozen. Mint = `(requires.scopes ?? provides.scopes_required) ∪ ⋃ mcp_tools[].scopes_required` (per-tool union STAYS — oracle's explicit Kanban-Drift guard). Docs: RFC→RATIFIED, `HOST-INTEGRATION-GUIDE §2.3` full formula, new `PLUGIN-PROVIDER-GUIDE §4.6` cookbook. Hosts now switch the seed expr (per-tool path unchanged = existing `aggregateScopes`); wiz-mind/v8-fam move reverse-call scopes (`family.audit.write` etc.) into `requires.scopes`. `enforceScopes` stays opt-in until split is cluster-wide. |
| **NEXUS plugin-licensing** | agent host-wiring (after NEXUS deploy, operator-gated) | ✅ **`plugin-license-foundation@0.1.0` SHIPPED** (#5395): `createLicenseClient`→`LicenseGate` (offline JWKS verify, default-deny, last-known-good grace) + `verifyEntitlementJwt` + `entitlePlugin`. Adversarial security-reviewed (0 bypasses). agent drops `gate` into `PluginManager.activate` once NEXUS deploys. Still owe nexus the authoritative slug→host map (their slugs provisional). |
| markview migration | ✅ DONE | Landed (`0be62c1`): −457 LOC deleted, canonical V8 token verifies e2e, 463 green. Kept own server.ts (correct — domain-specific). |
| wiz-mind §7 family gate | wiz-mind | Gates via reverse-call fetch (not the claim — `sub`=activator-not-child, fail-open). `ctx.claims` (v0.10.0) kept as generic passthrough. Awaiting 3-way viewer-user_id handoff (v8-fam+agent). |
| plug-ea full server-swap | plug-ea | Phase-1 auth-core adopted (`ea57ead`, −LOC). Full `createBridgeApp` swap smoke-gated. uuid-constraint datapoint → future #17 (relax-on-demand). |

## Recently completed

### 2026-06-27 (Foundation auth-features session — cont.)

- ✅ **`plugin-license-foundation@0.1.0`** (NEW package) — NEXUS entitlement `LicenseGate` for `PluginManager.activate` (makes `checkLicense` §2.3 real): `createLicenseClient` (offline-first, default-deny, last-known-good grace) + `verifyEntitlementJwt` (alg-pinned EdDSA, exp-required) + `entitlePlugin` (free→ok/402→purchase_required). Built against the frozen nexus+agent wire. Adversarial security review: 0 bypasses, 7 doc/test findings fixed (alg-confusion HS256/none rejection now tested). 27 tests. Tag `vlicense-0.1.0`. Added to publish.yml.
- ✅ **`requires.scopes` RFC** — manifest schema + doc + 5 tests, committed UNPUBLISHED (`5e62131`); ratification-call #5394 (oracle naming + host minting-ack pending).
- ✅ **`plugin-bridge-foundation@0.10.0`** — **canonical V8 claim-set** (markview #5357 / v8-corp #5354): `verifyBridgeToken` no longer requires `plugin_id`/`user_id` (not in the V8 token); default required `['iss','sub','jti','host_id','tenant_id']` + `requiredClaims` override; `plugin_id`/`user_id` optional; ctx derives `pluginId←sub`, `userId←body`. **Raw-claims passthrough** (wiz-mind §7): `BridgeAuthContext.claims` + `family_policy?`. Adversarial 3-lens review: 0 defects/0 bypasses (1 test-doc nit fixed). Tag `vbridge-0.10.0`.
- ✅ plug-ea Phase-1 adoption confirmed (#5363→#5369): jose-crypto dropped, `verifyBridgeToken`+`getHostVerification` in.

### 2026-06-27 (Foundation auth-features session)

- ✅ **`plugin-bridge-foundation@0.8.0`** — opt-in per-tool **scope-enforcement** (`createBridgeApp({ enforceScopes })` → 403 `insufficient_scope`; inline `checkToolScopes`, no mcp-foundation dep) + **`staticUi.allowedExtensions`** (markview #5348b, disallowed→404). Default-off. Adversarial 4-lens review: 0 defects. Tag `vbridge-0.8.0`.
- ✅ **`plugin-bridge-foundation@0.9.0`** — **per-host iss/aud binding** (markview #5345): `HostKeyRecord` += `expected_issuer/expected_audience/relay_url/last_used_at`; `verifyBridgeToken` enforces per-host iss/aud via `getHostVerification` resolver hook (optional → PEM-only fallback); `register-host` persists them; `SqliteHostKeyRepo` additive migration (PRAGMA-diff ALTER). `BridgeTokenClaims.aud?` + mint. Opt-in `tokenVerify: {requireAudience, hostIdFormat}` + `trackHostLastUsed`. Adversarial 5-lens auth-core review: **0 bypasses, 0 blockers**; 3 doc/test findings fixed. Tag `vbridge-0.9.0`.
- ✅ Workflow-driven: survey+design workflow (5 agents) → implement → adversarial review workflow per release (ultracode).
- ✅ plug-ea Foundation-adoption answer (#5212): packages ARE on npm; auth 1:1 via `createBridgeApp`, scopes via `enforceScopes`/`checkScopes`.
- ✅ pentest research.lookup OSV.dev PR review (#4943): flagged value/result inconsistency + broken CVSS parse + non-existent OSV ecosystem (agent's host-code).
- ✅ Cluster-note `bridge-protocol-guidance` extended (#73) — scope-enforcement + per-host iss/aud + tenant-safety + #5206 boundary.

### 2026-06-06 (Bun-storage session)

- ✅ **`plugin-storage-foundation@0.7.0`** — runtime-agnostic SQLite (Drift #101 / Bun). `SqliteDb`/`SqliteStatement` structural interface (`sqlite/driver.ts`); `applyPragmas(db, opts?)` driver-neutral; `migrate`/`rollbackTo`/`listApplied` + `Migration<DB>` retyped to `SqliteDb` (backward-compatible); README Node-vs-Bun section. Answers oracle #4665 (Describe-Mind Stage-5 under Bun). 5 new tests, 496/496 green. Tag `vstorage-0.7.0`.
- ✅ Cluster-note `storage-foundation-patterns` (note #58) — durable persistence pattern (runtime, migrations, tenancy, repo-layer).
- ✅ chatbus answer to oracle #4666 (Bun-path + Q1 schema/tenancy).
- ✅ **Verified live (oracle #4670):** storage-foundation@0.7.0 under Bun in Describe-Mind — `new Database()`→`applyPragmas`→`migrate` no cast, composite-key tenancy, project-CRUD end-to-end green.
- ✅ **Drift #105 CLOSED (agent #4671):** (a) `reregisterHost` ships `relay_url`(.url()-gated)+`host_version`, `reverse_call_url` legacy-dual-alias only → byte-aligned to 0.7.2; register-host live `HTTP 200 / missing_optional_fields:[]`. (b) StaleNotifyGate + `reregister_loop_detected` hard-stop live. a+b+c complete + bilateral-verified.

### 2026-06-02 (Drift #105 session)

- ✅ **`plugin-bridge-foundation@0.7.2`** — Drift #105 reregister-loop root-cause fix (cluster Option (c), oracle #4520 / agent #4515/#4525/#4528). Default `optionalRegisterFields: []` (opt-in); handshake reads actual per-host fields via `getProvidedOptionalFields()` instead of `['host_version']` hardcode; `applyPragmas`/`BASELINE_OPTIONAL_REGISTER_FIELDS` opt-in convenience retained. Cluster-ping #4543. Tag `v0.7.2`.
- ✅ Verified v0.7.2 live in Describe-Mind via oracle #4658 (`createBridgeApp` wired).

### Earlier (≤2026-05-31)

- ✅ Foundation v0.7.0 (`transport: 'agent-socket-direct'` + `tokenResolver`), v0.7.1 (`createHandshakeTokenStore` + `createReverseCallClient`)
- ✅ granite-test v0.0.6 (`target_kind`/`target_host`, spec v1.3) + v0.0.7 (`tools_in_context`/`chunk_id`/`chunk_size`/`toolCountPolicy`, spec v1.4 FROZEN)
- ✅ Cookbook §8 Host-Shared Tools; PROVIDER-GUIDE §11.x; MIGRATION-COOKBOOK; Joint Tool-Count-Cap RFC §4+§6

---

## Architectural-conventions established

| Convention | Source |
|---|---|
| Storage: SQLite (storage-foundation) = relational app-state CRUD; UnifiedDB = RAG/Memory. Don't model records as chunks. | plug-db #4661 / oracle #4660 |
| Foundation storage is runtime-agnostic via structural `SqliteDb`; Bun-plugins open `bun:sqlite` themselves + reuse `applyPragmas`/`migrate` | plug-tmpl v0.7.0 / Drift #101 |
| No generic CRUD/repo helper in Foundation — each plugin writes its own thin `repo/*.ts`; mind-canva is the reference | plug-tmpl / oracle #4665 |
| Composite-key tenancy: `tenant_id`+`user_id` columns+index in every table, WHERE-filter every query | plug-db `unifieddb-tenancy-contract` |
| An "optional" register field must NOT trigger reregister by its absence (default `[]`, opt-in to enforce) | Drift #105 / oracle #4520 |
| Foundation↔Host wire byte-alignment is verified bilaterally (live register-host roundtrip), not just code-reviewed | Drift #105 close-out / agent #4671 |
| New security controls ship opt-in + default-off + byte-aligned → cluster-wide rollout without breaking any consumer (enforceScopes, per-host iss/aud, allowedExtensions) | plug-tmpl v0.8.0/v0.9.0 |
| Foundation enforces tenant via `claims.tenant_id` (never `body.tenant_id`) → no cross-tenant IDOR; `actor_class` impersonation authz stays out of Foundation (v8-corp #5206) | markview #5206 / plug-tmpl |
| Auth-core changes get an adversarial multi-lens review (bypass/compat/migration/correctness/tests) + per-finding verification before publish | plug-tmpl v0.9.0 (ultracode) |
| `chunk_id` = first dot-segment of tool-name | v8-fam §3 + plug-tmpl §4 |
| SOJM/narrative-domain emitters emit `tools_in_context: 0` | oracle §2.3 + plug-elec |
| Foundation+Host byte-aligned, Backend may diverge | agent #4442 (json_object) |
| `MC_AGENT_TOKEN`-style env-vars = Dev-Interim only | agent host-UX-contract |

---

## Notes / debt

- **NPM_TOKEN:** Classic Automation Token (no expiry; rotate yearly). Stored in GH repo `NPM_TOKEN` secret. Publish via tag-push `v*` → `.github/workflows/publish.yml` (pnpm publish skips already-published versions, so only bumped packages publish).
- **Release-tag convention:** repo tags trigger CI publish. Numeric `vX.Y.Z` historically tracked bridge-foundation; for non-bridge package bumps use a descriptive `v<pkg>-X.Y.Z` (e.g. `vstorage-0.7.0`) to avoid implying a bridge bump.
- **CI Node-20 deprecation (non-blocking):** publish.yml actions (cache/checkout/setup-node @v4) are now **auto-forced to Node 24** by the runner (annotation only; the 2026-06-16 deadline passed). v0.8.0 + v0.9.0 publishes succeeded clean. `@v4` IS the current major for all three actions, so no real bump available yet — revisit when v5s ship.
- **storage-foundation Bun caveats (unverified):** PRAGMA read-back under `bun:sqlite` is `db.query('PRAGMA …').get()`; watch WAL-locking edge-cases. oracle pings if Stage-5 wire-up hits them.

---

## Cluster cross-references (live)

- **Tool-Count-Cap RFC:** https://github.com/MrDewitt88/TeamMindV8/blob/main/docs/granite-floor-RFC-tool-count-cap.md (`c9dce32`)
- **granite-floor.event.v1.4 spec:** FROZEN 2026-05-31
- **Cluster notes owned/co-authored:** `storage-foundation-patterns` (#58), `bridge-protocol-guidance`, `granite-floor-wisdoms`
- **Reverse-call allowlist:** `['projects.', 'contacts.', 'calendar.', 'notes.', 'attachments.', 'image.']`

---

## Restart-hints for next session

1. **First action:** read chatbus (especially: v8-fam/v8-corp Pass-4 results; wiz-mind granite-pilot-runner; any new plugin needing Foundation help).
2. **Drift #105 + #101 are CLOSED** — no follow-up owed. If a later Bun-plugin reports `bun:sqlite` PRAGMA/WAL snags, a storage-foundation patch may be needed (see Notes/debt).
3. **If a 2nd Bun-plugin appears:** consider future-item #15 (a `bun:sqlite` openConnection convenience).
4. **Standby work only** — no plug-tmpl-owned open deliverables; all current items await other repos.
