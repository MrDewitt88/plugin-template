# Changelog

All notable changes to `@nexus-mindgarden/plugin-template` and its foundation packages are documented here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [plugin-bridge-foundation/0.8.0] — 2026-06-27

**Per-package minor: `@nexus-mindgarden/plugin-bridge-foundation@0.8.0`** — two additive, opt-in, fully backward-compatible features. Answers the operator GO for scope-enforcement (closes the markview #5206 + plug-ea scope gap) and markview #5348b (static-serving hardening). No change required for existing consumers — both default to v0.7.x behavior.

### Added — opt-in per-tool scope enforcement (`enforceScopes`)

- **`createBridgeApp({ enforceScopes: true })`** — on `/execute-tool`, checks the called tool's required scopes (`manifest.provides.scopes_required` ∪ the matched `mcp_tools` entry's `scopes_required`) against the verified JWT `claims.scopes`. On a miss → **HTTP 403** `{ ok:false, error:{ code:'insufficient_scope', message, details:{ required, missing } } }` **before** the handler runs.
- New pure helper `checkToolScopes(manifest, toolName, callerScopes)` (`src/auth/scope-check.ts`, not exported from the root). Self-contained — **no** dependency on `@nexus-mindgarden/plugin-mcp-foundation`; it replicates that package's documented scope contract (dedup union floor + caller-side trailing-`.*` wildcard) and locks parity with tests.
- **Default `false`** → byte-for-byte v0.7.x behaviour; the handler still receives `ctx.scopes` informationally.
- Precedence: `tool_not_found` wins over the scope check (no info-leak for unknown tools). Applies to `/execute-tool` **only** (render-ui/invoke-hook have no scope model in the manifest).
- **Boundary:** reads only `claims.scopes` + manifest scopes — **no** `actor_class`/`tenant_id` authz (cross-tenant/impersonation is blocked on v8-corp ruling #5206, deliberately out of scope).

### Added — static-UI extension allowlist (`staticUi.allowedExtensions`)

- **`StaticUiHandlerOptions.allowedExtensions?: string[]`** — when set, only files with a listed (lowercased) extension are served; anything else → **404 `not_found`** (no existence-leak, checked before stat/read). Closes markview #5348b (an accidental `secret.env`/`.map` in the bundle dir could be served via the octet-stream fallback).
- **Default `undefined` → permissive** (current v0.7.x behaviour: any existing file served). Recommended restrictive, e.g. `['.js', '.mjs', '.css', '.map', '.wasm']`.
- Added `.wasm` → `application/wasm` to the content-type table.

### Tests

- New `test/scope-enforcement.test.ts` (19): default-off compat, plugin-wide floor, per-tool union, wildcard semantics, string-form/not-in-manifest, `tool_not_found` precedence, 403 shape, + direct `checkToolScopes` parity unit tests.
- Extended `test/static-ui.test.ts` (+5): permissive default, allow/deny, case-insensitive ext, `.wasm` content-type. 287/287 bridge-foundation green, workspace typecheck clean.

### Consumer notes

- markview / plug-ea: flip `enforceScopes: true` once your tokens mint the right scopes. The remaining markview adoption blockers (per-host iss/aud verification + `HostKeyRecord` fields, #5345/#5348a) land next as a focused JWT-hardening release.

## [plugin-storage-foundation/0.7.0] — 2026-06-06

**Per-package minor: `@nexus-mindgarden/plugin-storage-foundation@0.7.0`** — makes the storage layer **runtime-agnostic** so Bun-runtime plugins can use it. Answers oracle #4665 (Describe-Mind Stage-5 persistence under Bun). Other foundation packages unchanged. Backward-compatible — no changes required for existing Node/Electron consumers.

### Why

`openConnection()` uses `better-sqlite3`, a native addon that does **not** load under **Bun** (`ERR_DLOPEN_FAILED`, Drift #101 — plug-helix). Bun ships its own native `bun:sqlite`. Rather than couple the Foundation to one driver, the migration + pragma layer now targets the small synchronous-SQLite surface both expose.

### Added

- **`SqliteDb` / `SqliteStatement`** (`sqlite/driver.ts`) — structural interface (only `exec` / `prepare` / `transaction`) that both `better-sqlite3` and `bun:sqlite` `Database` satisfy without a cast.
- **`applyPragmas(db, opts?)`** — applies the Foundation's production pragmas (WAL / foreign_keys / busy_timeout / synchronous / temp_store / cache_size) to **any** `SqliteDb` via raw `PRAGMA …` exec-statements (driver-neutral; not better-sqlite3's `.pragma()`). For Bun consumers that open their own `new Database()` from `bun:sqlite`.

### Changed

- **`migrate` / `rollbackTo` / `listApplied` and `Migration<DB>` retyped to `SqliteDb`** (generic, defaulting to `SqliteDb`). A `better-sqlite3` call still infers the richer type — **fully backward-compatible**; a `bun:sqlite` handle now type-checks against the same helpers. Internal `.prepare<>()` generics replaced with structural casts.
- `openConnection()` unchanged (better-sqlite3, Node/Electron) — still returns the full `Database` type with `.pragma()`.

### Canonical Bun path

```ts
import { Database } from 'bun:sqlite'
import {
  resolvePaths,
  ensurePaths,
  applyPragmas,
  migrate,
} from '@nexus-mindgarden/plugin-storage-foundation'
const db = new Database(resolvePaths({ storageRoot, pluginId, hostId, tenantId }).dbPath)
applyPragmas(db)
migrate(db, migrations)
```

### Tests

- New `driver.test.ts` (5 tests) drives `applyPragmas` + `migrate` + `rollbackTo` + `listApplied` through a `SqliteDb`-narrowed handle — proving the helpers need nothing beyond the bun:sqlite/better-sqlite3 overlap. 496/496 workspace green, typecheck clean.

## [plugin-bridge-foundation/0.7.2] — 2026-06-02

**Per-package patch: `@nexus-mindgarden/plugin-bridge-foundation@0.7.2`** — fixes **Drift #105 (reregister-Loop)**, the root-cause of Theseus' 119k/168k reregister-call spin. Implements cluster-ruling **Option (c)** (oracle #4520, agent #4515/#4525/#4528). Other foundation packages unchanged.

### Root-cause

A field named _optional_ must not, by its absence, trigger `reregister_recommended=true` — that is a self-contradiction in the Foundation heuristic. Two spots produced exactly that:

1. **`HostKeyRegistry.optionalFields` defaulted to `BASELINE_OPTIONAL_REGISTER_FIELDS` (`['host_version','relay_url']`).** Any host that never supplied `relay_url` was flagged for re-registration on _every_ call.
2. **`handshake.ts` hardcoded `providedOptionalFields = ['host_version']`.** So `relay_url` appeared structurally missing on every handshake regardless of what the host actually registered — the host could never satisfy it → infinite loop.

### Changed (Option (c))

- **Foundation default is now `optionalRegisterFields: []` (opt-in).** Absence of an optional field no longer triggers `reregister_recommended`. Plugins that genuinely want to enforce fields opt in:
  `new HostKeyRegistry(repo, { optionalRegisterFields: BASELINE_OPTIONAL_REGISTER_FIELDS })`.
- **`handshake.ts` no longer hardcodes provided fields.** It reads the optional fields the host _actually_ registered (`registry.getProvidedOptionalFields(host_id)`), unioned with the `host_version` carried in the handshake request. New per-host tracking (`HostKeyRegistry.getProvidedOptionalFields()`), populated at register-time as a union across re-registrations. Self-healing across process restart (one re-register repopulates the cache; not a loop).
- `BASELINE_OPTIONAL_REGISTER_FIELDS` retained, re-documented as an opt-in convenience (value unchanged → consumers/tests stable).
- `buildTestRegistry({ optionalRegisterFields })` passthrough for testing the enforcement paths.

### Tests

- `host-keys.test.ts`: default now `[]`; added `getProvidedOptionalFields` per-host tracking + union coverage.
- `reregister-loop.test.ts`: loop scenarios now model the real opt-in-enforcement case via a `makeReg` helper.
- `server-observability.test.ts`: opt-in register paths + **new default-behaviour test** (omitted fields → no reregister) + **new authenticated handshake integration test** proving the hardcode is gone (relay_url provided → handshake stops flagging it). 263/263 green, typecheck clean.

### Cluster coordination

- This is plug-tmpl's lever in the agreed ordering: **(c) lands first → Theseus ships (a)** (`relay_url`/`host_version` register-body key-fix). (b) Host-side backoff + flag-honor + hard-cap is already live on Theseus main (`c2568db`).

## [granite-test/0.0.7] — 2026-05-31

**Per-package patch: `@nexus-mindgarden/granite-test@0.0.7`** — aligns to Oracle's `granite-floor.event.v1.4` FROZEN spec (chatbus #~21:09, 2026-05-31). Adds three additive observability fields (`tools_in_context`, `chunk_id`, `chunk_size`) + plugin-author API surface for canonical Tool-Count-Cap RFC (`toolCountPolicy` shape + `defineGraniteTestSuite()` helper). Foundation packages unchanged.

### Spec source

- **Canonical RFC** (TeamMindV8 repo @ `c9dce32`): https://github.com/MrDewitt88/TeamMindV8/blob/main/docs/granite-floor-RFC-tool-count-cap.md
- **Multi-source triangulation** (4 mechanisms, same cap ~10–15 tools for granite-4-h-tiny):
  - v8-corp K-knob sweep (130×K trials, K=10 = 72.3% vs ceiling 88.5%)
  - v8-fam Phase-1 vs Phase-2 (10→25 tools = 80%→56% regression)
  - agent per-tool single-turn + multi-turn CI (silent-fail at large tool-sets)
  - plug-elec ET-Mind Pass-3 SOJM-domain (3c reduced-block −75% missing) — cross-domain 4th triangulation per RFC §2.4

### Added — GraniteFloorEventSchema v1.4 additive fields

All three optional, additive, fully back-compat (omitting them preserves v1.3 emission shape):

- **`tools_in_context?: number` (int≥0)** — Number of tool-definitions in Granite's context for this case-run.
  - Single-tool baseline (no retrieval): `1`
  - Retrieval-K=N runs: `N`
  - **SOJM / narrative-domain** (no tool-selection): `0` (separable 0-bucket per oracle §2.3)
  - Aggregator builds pass-rate-vs-tool-count curves via `GROUP BY tools_in_context`
- **`chunk_id?: string` (min 1)** — Per-domain chunk identifier when `toolCountPolicy` chunking applied.
  - Convention: first dot-segment of tool-name (v8-fam + plug-tmpl independent convergence per RFC §3 + §4.2).
  - Sub-chunking format: `<prefix>:<index>` (e.g. `projects:0`, `projects:1`) when one chunk still exceeds cap.
  - Absence = single-batch run (no chunking applied), consistent with v0.0.6 back-compat.
- **`chunk_size?: number` (int≥0)** — Tools-in-this-chunk count. Complements `chunk_id` for per-chunk pass-rate dashboards.

### Added — Plugin-author API surface

- **`defineGraniteTestSuite(config: GraniteTestConfigObject): GraniteTestConfigObject`** — new canonical wrapper (additive to existing `defineGraniteToolTest`). Recommended over array-form when ≥10 tools or when `toolCountPolicy` cap-enforcement wanted. Pure pass-through (future versions may validate chunk-distribution warnings).
- **`GraniteTestConfigObject.toolCountPolicy?: ToolCountPolicy`** — opt-in cap-policy with 4 fields:
  - `maxToolsPerRun?: number` (default 10 per RFC §2.7 cluster-canonical cap for granite-4-h-tiny)
  - `chunkBy?: 'tool-prefix' | 'flat-batch'` (default `'tool-prefix'` = first dot-segment per RFC §3)
  - `chunkLatencyBudgetMs?: number` (per-chunk latency override)
  - `allowSubChunking?: boolean` (default true — graceful auto-resolution when chunk still > cap)
- **`ToolCountPolicy` type-export** — for consumer-side type-annotations and tests.

### Spec-MISST-ENFORCED-NICHT posture (per oracle §2.1)

The schema does NOT hard-cap tool-count. Per-model cap is context-dependent (future Granite-4-h-medium/large + Phi/Llama may shift the curve). v0.0.7 ships **observability fields + plugin-author config-shape** — runtime chunking-logic lives in `granite-pilot-runner` (wiz-mind owns).

### Backward compatibility

- v1.3-only emitters (granite-test v0.0.6) continue to validate unchanged (3 v1.4 fields optional).
- Plug-elec ET-Mind Pass-3 (12 events, `tools_in_context: 0`) verified against v1.4 validator: 0 rejects (oracle confirmation #~21:09).
- defineGraniteToolTest API unchanged. Array-form configs work unchanged.
- All 73 v0.0.6 tests pass without modification (verified: 73/73 grün before changes, 98/98 grün after additions).

### Tests

- `test/skeleton.test.ts` — 25 new v1.4 tests:
  - 17 tests for `GraniteFloorEventSchema` v1.4 fields: back-compat (3 v1.3-only patterns), tools_in_context accept (0/1/10/72 + reject -1/1.5), chunk_id accept (canonical + sub-chunk + reject empty), chunk_size accept (5/0 + reject -1), full v1.4 triple, orthogonal coexistence with v1.3 target_kind + domain_kind, SOJM-domain 0-anchor pattern, event_kind stable
  - 8 tests for `defineGraniteTestSuite` + `toolCountPolicy`: helper export, pass-through config, declarability of all 4 toolCountPolicy fields, default/back-compat omitting, worked-example 25-case multi-domain config with chunk-distribution check matching v8-fam scaffold (largest chunk `meals` = 4 tools, all chunks ≤ 4)
- Total: 98/98 grün (was 73 in v0.0.6 → +25 v0.0.7 additions)

### Free-form convention sub-categories (per oracle §3 #4438 — NO enum-additions)

The following 4 sub-category-candidates surfaced in cluster-evidence but remain **free-form `fail_sub_category` values** (NOT FailCategorySchema enum-additions per oracle ruling):

- `cross-tool-schema-bleed` (v8-fam #4432: `chores.verify outcome:"correct"` ← `vocab.review` enum)
- `numeric_sign_inversion` (v8-fam #4432: `delta=1`→`-1` despite `z.number().positive()`)
- `tool-name-fabrication` (v8-corp #4434: `notes_get` instead of `notes.get`)
- `enum_translation_de_en` (cross-domain bidirectional: `"Mathe"`→`"Mathematics"` + `"fridge"`→`"Kühlschrank"`)

Future v1.5 may promote based on accumulated cluster-evidence. Emitters MAY use these strings now via `fail_sub_category: <value>` without schema-change.

### Cross-Repo Provenance

- **Oracle chatbus msg #~21:09 2026-05-31** — v1.4 FROZEN ruling, plus §2 RFC content (7 subs)
- **v8-corp chatbus msg #~21:12 2026-05-31** — RFC = CANONICAL announcement (commit `c9dce32`)
- **v8-fam chatbus msg #4467** — §3 + §5 canonical-content (chunking convention + mega-config anti-pattern)
- **plug-tmpl chatbus msg #4437 + #4468** — §4 + §6 design (toolCountPolicy + migration-path) + cross-section alignment
- **agent chatbus msg #4446** — RFC co-sign + §1.4 per-tool-CI datapoint + scope-discipline (response_format weglassen)
- **plug-elec chatbus msg #4464** — ET-Mind Pass-3 cross-domain 4th triangulation (R-12.c L3-graduation → §2.4)
- **CANONICAL RFC TeamMindV8 commits** — `eba921f` (Frame + §1) → `8663880` (§3+§5+§4+§6) → `c9dce32` (§2 + CANONICAL)

### Documentation

- README updated with `defineGraniteTestSuite` + `toolCountPolicy` example + v1.4 emit-pattern.
- Cross-ref to canonical Tool-Count-Cap RFC (TeamMindV8 repo).

## [0.7.1] — 2026-05-31

**Per-package patch: `@nexus-mindgarden/plugin-bridge-foundation@0.7.1`** — adds `createHandshakeTokenStore()` + `createReverseCallClient()` to the `/auth` subpath, closing the loop on agent's host-UX-contract (chatbus #~05:47, 2026-05-31): "Aktivieren = fertig. Kein Plugin baut je ein Token-Eingabefeld." Plugin-authors now wire outbound clients (`createAgentComplete` agent-socket-direct, image-tool reverse-calls) **without manual env-var-wiring** — Foundation auto-captures the per-plugin activation JWT at handshake-middleware time and resolves it for outbound requests. Other Foundation packages unchanged.

### Added — `/auth` subpath

- **`createHandshakeTokenStore(opts?)`** — captures the inbound `Authorization: Bearer …` at the `/plugin-bridge/v1/handshake` middleware and exposes:
  - `current(): Promise<string>` — fresh per-call (transparent token-rotation). Throws `Error('no_handshake_yet')` before first capture.
  - `lastUpdated(): Date | null` — diagnostics + staleness-detection.
  - Test-fixtures: `opts.initialToken` + `opts.initialTime` (seeds the store for vitest).
- **`createReverseCallClient({ hostEndpoint, tokenStore, sourcePlugin?, requestId?, fetch?, enforcePrefixGuard? })`** — typed wrapper for `POST /host-bridge/v1/execute-tool` reverse-calls. Kapselt the two wire-fußangeln that bit early adopters:
  - **Body-key discipline:** sends `{ tool, args }` — NOT `{ tool, arguments }` (the OpenAI-shaped name agent flagged in #4399).
  - **Metadata-vs-value extraction:** `executeImageTool()` typed wrapper reads `metadata.image_base64` (the actual PNG bytes), NOT `value` (which is a base64-FREE human-readable description).
  - Client-side prefix-guard: fails fast with `forbidden_prefix` if `toolName` doesn't match `REVERSE_CALL_TOOL_PREFIXES`. Bypass with `enforcePrefixGuard: false`.
- **`REVERSE_CALL_TOOL_PREFIXES`** const — canonical allowlist per agent #~05:47 (Q3):
  ```ts
  ;['projects.', 'contacts.', 'calendar.', 'notes.', 'attachments.', 'image.']
  ```
  (`agent.complete` is NOT here — it routes via dedicated `/agent/complete` endpoint, see `createAgentComplete` with `transport: 'agent-socket-direct'`.)
- **`ReverseCallError`** typed class with `.code` discriminator. Foundation-emitted codes: `no_handshake_yet`, `transport_failure`, `invalid_response`, `http_error`, `forbidden_prefix`. Host-emitted codes per agent #~05:47 (Q1): `permission_denied`, `not_found`, `validation_failed`, `execution_error`, `timeout` — surfaced verbatim, no `retryable`/`retryHint` field (host shape is just `{code, message}`).
- **Type exports:** `HandshakeTokenStore`, `HandshakeTokenStoreImpl`, `CreateHandshakeTokenStoreOptions`, `ReverseCallClient`, `CreateReverseCallClientOptions`, `ExecuteToolResponse`, `ExecuteToolErrorBody`, `ImageToolResult`, `ReverseCallToolPrefix`.

### Added — `BridgeAppOptions.handshakeTokenStore?` (server.ts)

New opt-in field on `createBridgeApp()` config. When provided, Foundation hooks a capture middleware **before** the existing `authMiddleware` on `/plugin-bridge/v1/handshake` — extracts the Bearer and writes to the store. Capture runs even when JWT-validation later fails (diagnostics value via `lastUpdated()`). Omitting the field preserves v0.7.0 behaviour byte-for-byte (zero impact, opt-in only).

```ts
import { createBridgeApp } from '@nexus-mindgarden/plugin-bridge-foundation'
import {
  createHandshakeTokenStore,
  createReverseCallClient,
} from '@nexus-mindgarden/plugin-bridge-foundation/auth'
import { createAgentComplete } from '@nexus-mindgarden/plugin-bridge-foundation/agent-complete'

const tokenStore = createHandshakeTokenStore()

const app = createBridgeApp({
  manifest,
  registry,
  toolHandlers,
  handshakeTokenStore: tokenStore, // NEW v0.7.1 — capture Bearer at /handshake
})

// Then wire outbound clients against the SAME store:
const agentComplete = createAgentComplete({
  bridgeEndpoint: 'http://127.0.0.1:3400/agent/complete',
  transport: 'agent-socket-direct',
  tokenResolver: () => tokenStore.current(), // no env-var, no static token
})

const reverseCall = createReverseCallClient({
  hostEndpoint: 'http://127.0.0.1:3400',
  tokenStore,
})

// Image-tools — typed wrapper handles metadata.image_base64 extraction:
const img = await reverseCall.executeImageTool('image.remove_background', {
  image_base64: srcB64,
  mime: 'image/png',
})
// img.image_base64 = PNG bytes, img.mime, img.width, img.height, etc.
```

### Backward compatibility

- All v0.7.0 call-sites continue working unchanged. New fields/exports are purely additive.
- `BridgeAppOptions.handshakeTokenStore` is optional — omitting it preserves v0.7.0 behaviour byte-for-byte.
- `createAgentComplete()` API surface is identical (static `sessionToken` continues to work; `tokenResolver` from v0.7.0 is unchanged).
- All 215 v0.7.0 tests pass without modification (verified: 215/215 grün before changes, 258/258 grün after additions).

### Tests

- `test/handshake-token-store.test.ts` — 17 new tests covering standalone behaviour (initial-state, capture, rotation, non-string-guard, empty-guard, test-fixture-seeding) + 9 integration tests against `createBridgeApp` wiring (handshake-capture, lowercase-header, non-Bearer-rejection, multi-handshake-update, non-handshake-endpoints-ignored, missing-Authorization, capture-before-auth-validation, back-compat-omit).
- `test/reverse-call-client.test.ts` — 26 new tests covering const-shape (6 prefixes, no agent.), basic wire (URL, args-key, Bearer, X-Source-Plugin, X-Request-Id), prefix-guard (forbidden_prefix throw, all 6 prefixes accept, enforcePrefixGuard:false bypass), token-store integration (no_handshake_yet, rotation transparency), envelope handling (ok:true passthrough, ok:false envelope-pass-through-no-throw, transport_failure, invalid_response on non-JSON, invalid_response on missing ok), executeImageTool typed wrapper (metadata.image_base64 extraction not value, seed+backend threading, missing-metadata.image_base64 throws invalid_response, host ok:false surfaces with original code, default mime=image/png), ReverseCallError class shape.
- Total: 258/258 grün (was 215 in v0.7.0 → +43 v0.7.1 additions).

### Cross-Repo Provenance

- **chatbus msg #~05:19 2026-05-31 agent** — confirmed token = per-plugin activation JWT from register-tenants (no new mint), Foundation cache via tokenResolver formalizes
- **chatbus msg #~05:47 2026-05-31 agent** — host-UX-contract: "Aktivieren = fertig. Kein Plugin baut je ein Token-Eingabefeld." Plus answers to plug-tmpl Q1-Q3 (error-shape `{code, message}` no retryable, X-Source-Plugin advisory-only, REVERSE_CALL_TOOL_PREFIXES exact 6 prefixes)
- **chatbus msg #4399 agent** — wire correction: image-tools (b) route via reverse-call NOT /agent/complete; body.args NOT body.arguments; read metadata.image_base64 NOT value
- **chatbus msg #~07:05 2026-05-31 mind-canva** — keystone-prio request: v0.7.1 = "MCs sovereign env-free Assistant + bg-removal block" → first consumer, will E2E-test against live myMind post-publish
- **chatbus msg #4401 plug-tmpl** — design proposal for createHandshakeTokenStore + createReverseCallClient, asked Q1-Q3 (answered in #~05:47 above)

### Documentation

- `docs/CROSS-PLUGIN-MCP-CALL-COOKBOOK.md` §8.5.2 updated: capture-at-handshake interim pattern marked as **v0.6.x interim**; v0.7.1 helper-snippet promoted to canonical (Cookbook §8 update).
- `docs/PLUGIN-PROVIDER-GUIDE.md` §11.2b.1 updated: image-tool reverse-call now uses `createReverseCallClient.executeImageTool()` instead of manual fetch.

## [0.7.0] — 2026-05-31

**Per-package minor: `@nexus-mindgarden/plugin-bridge-foundation@0.7.0`** — adds `transport` mode + `tokenResolver` to `createAgentComplete()` to support the cluster-canonical Path-B (standalone agent-socket-direct + per-plugin handshake-token) per agent's `feat/host-tool-routing` triple-landing on 2026-05-31 (§2.6 `image.remove_background`, §2.7 `agent.complete` (a) embedded + (b) standalone HTTP). Full back-compat with v0.6.x — existing call-sites continue producing identical wire-output. Other Foundation packages remain at `0.6.x` (lockstep relaxed for per-package minors).

### Added

- **`CreateAgentCompleteOptions.transport?: 'v8-bridge' | 'agent-socket-direct'`** (v0.7.0+) — backward-compatible additive parameter, defaults to `'v8-bridge'` preserving v0.6.x behaviour.
  - **`'v8-bridge'`** (default): legacy V8/v8-fam reverse-call envelope — POSTs `{tool: 'agent.complete', arguments: req}` to `${bridgeEndpoint}/call-tool`. Used for Path-A (V8/TeamMind static-token integration via `/mcp/v1/call-tool`).
  - **`'agent-socket-direct'`** (NEW v0.7.0): direct Theseus agent-socket call — POSTs raw `AgentCompleteRequest` body to `${bridgeEndpoint}` (no envelope, no URL-mutation beyond trailing-slash-strip). Used for Path-B (standalone bridge-plugin → `127.0.0.1:3400/agent/complete` with per-plugin handshake-token). Wire-spec per agent's chatbus contract msg 2026-05-31, FROZEN `@theseus/agent-complete-schema` v0.15.0 (response shape unchanged across both transports).
- **`CreateAgentCompleteOptions.tokenResolver?: () => string | Promise<string>`** (v0.7.0+) — alternative to static `sessionToken`. Resolver is called **fresh per-request**, not cached at create-time — enables per-plugin handshake-tokens with TTL/refresh semantics (e.g. M17 accept-response tokens, register-tenants activation JWTs). Both sync (`() => string`) and async (`() => Promise<string>`) shapes supported.
- **`AgentCompleteTransport` type-export** — string-literal-union `'v8-bridge' | 'agent-socket-direct'` for consumer-side type-annotations.

### Auth-options invariant (v0.7.0+)

`CreateAgentCompleteOptions` now requires **exactly one** of `sessionToken` (static) or `tokenResolver` (per-request) to be set. Both unset OR both set → throws `AgentCompleteError('invalid_request')` **at create-time** (loud-fail vs runtime-fail). Previous v0.6.x callers that passed `sessionToken: 'x'` continue to work unchanged.

### Backward compatibility

- The 2-option form `{ bridgeEndpoint, sessionToken }` continues to produce **identical wire-output** to v0.6.x — same URL, same envelope, same Bearer-header.
- All 20 existing `agent-complete.test.ts` tests pass without modification (verified: 200/200 grün before changes, 215/215 grün after additions).
- `transport: 'v8-bridge'` is the default; omitting it preserves v0.6.x behaviour byte-for-byte.

### Tests

- `test/agent-complete.test.ts` — 15 new tests covering:
  - Auth-options invariant (neither/both set throws at create-time, Drift #103 `invalid_request` code)
  - `tokenResolver` sync + async returns, fresh-per-request invocation (not cached), empty-string rejection, non-string rejection, sync-throw + promise-reject → `transport_failure`
  - `transport='v8-bridge'` default-behavior preserved
  - `transport='agent-socket-direct'` URL handling (no `/call-tool` append), raw body (no envelope), token-resolver-integration (canonical Path-B), trailing-slash-strip, header forwarding (X-Request-Id, x-caller-id)
- Total: 215/215 grün (was 200 in v0.6.1 → +15 v0.7.0 additions)

### Cross-Repo Provenance

- **chatbus msg ~05:05 2026-05-31** — agent's §2.6 + §2.7 (a)+(b) triple-landing broadcast: image.remove_background LIVE, agent.complete embedded LIVE (callMcp), agent.complete standalone HTTP LIVE (per-plugin JWT + V8-static back-compat)
- **chatbus msg #4385** — agent's initial (a)/(b)/(c) RFC for canonical-`agent.complete`-paths
- **chatbus msg #4386 mind-canva** — Path-B canonical requirement (bridge-context, per-plugin token)
- **chatbus msg #4387 apex2d** — Path-(c) requirement (both embedded callMcp + bridge HTTP)
- **chatbus msg #4389 plug-tmpl** — Foundation-side commitment to `tokenResolver` API
- **chatbus msg ~05:01 oracle** — granite-floor.event.v1.3 FROZEN (parallel spec-side land)
- **chatbus msg #4393 plug-tmpl** — workplan-commitment Track-1 to Track-4

### Wire-Spec — agreement with agent's host-side

- Token = the **existing per-plugin JWT bridge-token** from register-tenants/activation-handshake (no new token-type). `tokenResolver` is the Foundation-side wrapper that hands the current value to each request.
- `/agent/complete` host-side accepts **either** per-plugin Bearer **or** legacy V8/TeamMind static-token (additive, back-compat — V8 paths unchanged).
- Wire-spec `@theseus/agent-complete-schema` v0.15.0 **unchanged** — only transport-layer dispatch evolves.

### Documentation

- **TODO**: `docs/PLUGIN-PROVIDER-GUIDE.md` §11 update (`(a) embedded` vs `(b) standalone` decision-tree, three-auth-mode-table). Tracked as Task #22, blocked on this v0.7.0 publish.
- **TODO**: `docs/MIGRATION-COOKBOOK.md` §3.4 update (replace static `process.env.AGENT_SOCKET_TOKEN` with per-plugin `tokenResolver` example). Tracked as Task #22, blocked on this v0.7.0 publish.
- **TODO**: `docs/CROSS-PLUGIN-MCP-CALL-COOKBOOK.md` §6 NEW "Host-Shared Tools" section (3 tools: `image.generate`, `image.remove_background`, `agent.complete`). Tracked as Task #17, lands together with v0.7.0.

## [granite-test/0.0.6] — 2026-05-31

**Per-package patch: `@nexus-mindgarden/granite-test@0.0.6`** — aligns to Oracle's `granite-floor.event.v1.3` FROZEN spec (chatbus contracts thread 2026-05-31 ~05:01). Adds `target_kind` (FIRST closed-enum additive field) + `target_host` for host-shared callMcp tools (`image.generate`, `image.remove_background`, `agent.complete` per agent's `feat/host-tool-routing` triple-landing 2026-05-31). Other Foundation packages unchanged (independent per-package release cadence).

### Added

- **`GraniteFloorEventSchema.target_kind?: 'plugin-tool' | 'host-tool'`** (optional, defaults to plugin-tool semantics when omitted). First CLOSED-enum additive field in v1.x — precedent for future amends (vs `domain_kind` / `fail_sub_category` which are open-on-receive strings).
- **`GraniteFloorEventSchema.target_host?: string`** (optional, required when `target_kind === 'host-tool'`). Canonical values: `'theseus'`, `'v8'`, `'v8-fam'`, `'markview'` (extensible).
- **Collapsed-refine: `target_host present ⇔ target_kind === 'host-tool'`** — bidirectional invariant. host-tool event MUST specify target_host; plugin-tool (or omitted) MUST NOT carry target_host. Mirrors oracle's chatbus-side `granite_floor.py` validator-block exactly.
- **`GraniteToolTest.target_kind?` + `target_host?`** plugin-author-facing fields — `defineGraniteToolTest()` threads them through. Plugin-authors declare host-shared-tool coverage via:
  ```ts
  defineGraniteToolTest({
    tool: 'image.generate',
    target_kind: 'host-tool',
    target_host: 'theseus',
    persona: 'user',
    cases: [...],
  })
  ```

### Validation refines

10 refines now (was 9 in v1.2.2):

- v1.0 outcome ⇔ fail_category
- v1.1 wild-mode replay-bundle PII-guard
- v1.2 anti-cheating Test-2/4 (applied_repairs required for repair-success)
- v1.2.1 plural-singular consistency
- **v1.3 target_host ⇔ target_kind=host-tool** (NEW)

### Backward compatibility

- v1.1.x + v1.2.x emitters that omit `target_kind` + `target_host` continue to validate unchanged (aggregator treats omitted-target_kind as plugin-tool semantics, consistent with oracle's chatbus-side validator).
- Existing tests: 61/61 grün before changes → 73/73 grün after (+12 v1.3 tests).
- defineGraniteToolTest API unchanged for plugin-tool declarations (no migration needed for existing configs).

### Tests

- `test/skeleton.test.ts` — 12 new v1.3 tests:
  - Back-compat (omit target_kind, explicit plugin-tool without target_host)
  - Happy-path (target_kind=host-tool + target_host=theseus)
  - Rejections (host-tool missing target_host, host-tool empty target_host, plugin-tool + target_host, target_host without target_kind, invalid enum value)
  - Orthogonal coexistence (target_kind + domain_kind, target_kind + L3-repair fields)
  - `defineGraniteToolTest` threading (host-tool + plugin-tool defaults)
- Total: 73/73 grün (was 61 in v0.0.5 → +12 v0.0.6 additions)

### Spec-Source

- **Oracle chatbus msg ~05:01 2026-05-31** — granite-floor.event.v1.3 spec FROZEN, shipped end-to-end this session: `docs/granite-floor-spec.md` updated, `chatbus/granite_floor.py` SPEC_VERSION='v1.3' + TARGET_KINDS exported + 10 v1.3 tests, 96 floor / 257 total grün.
- **plug-tmpl chatbus msg #4390** — proposal for additive v1.3 shape (target_kind + target_host + 2 refines).
- **agent chatbus msg ~05:05 2026-05-31** — §2.7 (a)+(b) triple-landing makes host-shared-tools real, motivating v1.3 discriminator.
- **mind-canva chatbus msg #4351** — §2.5 image-sidecar-wire FROZEN, RFC-§7 2-Achsen-Grading-Rubrik (binary structural-pass + human-review-quality) directly informs target_kind='host-tool' aggregation.

### Aggregator-side follow-on

Per oracle: read-side dedup-by-`(target_host, tool)` is a follow-on `/api/granite-floor/host-tools` rollup endpoint — non-blocking for spec freeze, ships once first host-tool events arrive in the wild. Current `tools_summary` continues grouping by `(repo, tool, persona, mode)` — host-tool events naturally appear there with `repo=<emitter>` (correct attribution-by-emitter view, complementary to the by-host view).

## [0.6.1] — 2026-05-22

**Per-package patch: `@nexus-mindgarden/plugin-bridge-foundation@0.6.1`** — adds `actorClass` + `timeoutMs` additive options to `callMcp()` (full feature-parity with agent's mymind-side spec in msg #607/#619). Plus Provider-Guide §11 cross-link to Mind-Canva's `CROSS-PLUGIN-INTEGRATION.md` cookbook (consumer-perspective companion-doc). Other Foundation packages remain at `0.6.0` (lockstep relaxed for per-package patches).

### Added

- **`callMcp()` 4th-argument `options?: CallMcpOptions`** (v0.6.1+) — backward-compatible additive parameter. Both new fields are optional:
  - **`actorClass?: 'user' | 'kiara'`** — propagated as `actor_class` in the `plugin:mcp-call` request-detail. When omitted, the host applies its default-actor-class policy (confirmed via agent msg #619 mymind-side parser). Use `'kiara'` for autonomous-agent-initiated calls (e.g. background tasks); `'user'` for explicit user-action mirroring.
  - **`timeoutMs?: number`** — per-call timeout in milliseconds. Defaults to `CALL_MCP_DEFAULT_TIMEOUT_MS` (30000ms). On elapse rejects with `CallMcpError('timeout')` carrying a diagnostic message including the qualified tool-name and request_id. `timeoutMs: 0` opts out of the timeout (long-running stream pattern).
- **`createCallMcpDispatcher()` accepts optional 3rd `options` argument** matching `callMcp()`'s 4th argument. 2-arg form remains supported (backward-compat).
- **`PluginMcpActorClass` type-export** — string-literal-union `'user' | 'kiara'` for consumer-side type-annotations.
- **`CALL_MCP_DEFAULT_TIMEOUT_MS` exported const** = `30_000`. Exposed so consumers can reference it for parity with their own defaults.
- **`PluginMcpCallDetail.actor_class?: PluginMcpActorClass` field** — added to wire-shape type (optional; omitted from emit when `options.actorClass` is undefined, matching host-side spread-omit pattern from msg #619).

### Backward compatibility

The 3-arg form `callMcp(mount, qualifiedName, args)` continues to produce **identical wire-output** to `callMcp(mount, qualifiedName, args, {})`. v0.6.0 consumers do not need to migrate; v0.6.1 adoption is opt-in per call-site.

### Tests

- `test/runtime-callmcp.test.ts` — 12 new tests covering `actorClass` propagation (default-omit / `'user'` / `'kiara'` / curried-dispatcher), `timeoutMs` behavior (default constant, rejection on timeout, success-path no spurious timeout, opt-out via `0`, default-path), and explicit backward-compat (3-arg form ≡ 4-arg form with empty options)
- Total: 200/200 grün (was 188 in v0.6.0 → +12 v0.6.1 additions)

### Wire-Spec — agreement with agent's mymind-side (msg #619)

- `actor_class` is **optional** in request-detail (host parser accepts `'user'`, `'kiara'`, or omitted → default-actor-class policy)
- `timeoutMs` is **Foundation-side concern** (confirmed correct location by agent — host-IPC layer's own timeouts are infrastructure-level)
- `CallMcpError` with `.code` field retained (agent msg #619: "dein design ist besser"); `string-concat-error` pattern from initial spec-draft (`new Error('${code}: ${message}')`) NOT adopted

### Documentation

- **`docs/PLUGIN-PROVIDER-GUIDE.md` §11 cross-link to Mind-Canva's `CROSS-PLUGIN-INTEGRATION.md`** — added "See also" callout linking the consumer-perspective companion-cookbook. Mind-Canva approved the cross-link in msg #618 (thread `contracts`). Both docs are orthogonal: this Provider-Guide is provider-perspective, Mind-Canva's is consumer→consumer wire-perspective; they co-exist as paired cluster-docs.

### Cross-Repo Provenance

- **agent msg #607** — Original wire-contract design (CustomEvent shape + `actor_class` field + `timeoutMs` rationale)
- **agent msg #614** — Spec-snippet with `actorClass`/`timeoutMs` additive options (Foundation-side suggested impl)
- **agent msg #619** — Confirmed: `actor_class` is host-side optional (not strict-required), `timeoutMs` is Foundation-side correct location, `CallMcpError.code` design endorsed
- **mind-canva msg #618** — Approved Provider-Guide §11 cross-link to their cookbook
- **wiz-mind msg #614** — Original 2-consumer-trigger driving v0.6.0; v0.6.1 ships feature-parity without disrupting their in-flight migration

## [0.6.0] — 2026-05-22

**Minor bump — lockstep across all Foundation packages.** Adds `/runtime` subpath with `callMcp()` browser-side helper for plugin custom-element bundles. Two-consumer-trigger met (wiz-mind + mind-canva ready Day-1 per msg #614). Wire-contract designed by agent (Luma, msg #607), voted in by wiz-mind (msg #614), shipped Foundation-side same-day for joint-smoke parallelism with mymind-side commit.

### Added

- **`@nexus-mindgarden/plugin-bridge-foundation/runtime` subpath** — browser-side helpers for plugin UI bundles (Svelte custom-elements, lit-elements, vanilla custom-elements) running inside a host-app shell.

  **`callMcp(mount, qualifiedName, args): Promise<T>`** — canonical request/response pattern replacing ad-hoc per-plugin CustomEvent-naming. Dispatches `plugin:mcp-call` with request_id + qualified_name + arguments (bubbles + composed, crosses shadow-DOM boundaries). Host-app catches the event, validates namespace against pluginId (cross-plugin-attack-guard), routes via existing IPC to the plugin-bridge, then dispatches `plugin:mcp-response` with the matching request_id. Promise resolves on `{ ok: true, result }` or rejects with `CallMcpError` on `{ ok: false, code, message? }` (Drift #103 canonical error-shape).

  **`createCallMcpDispatcher(mount): CallMcpDispatcher`** — curried form for components that issue multiple MCP-calls (avoids re-passing mount).

  **`CallMcpError`** — typed error with `code` field. Maps to Drift #103 canonical error-codes (`tool_not_found`, `insufficient_scope`, etc.) plus `crypto_unavailable` for non-secure-context runtimes.

  **Event-name constants** — `PLUGIN_MCP_CALL_EVENT` + `PLUGIN_MCP_RESPONSE_EVENT` exported for host-app implementers.

  Wire-shape:
  - Request detail: `{ request_id: string; qualified_name: string; arguments: unknown }`
  - Response detail (discriminated by `ok`):
    - Success: `{ request_id: string; ok: true; result: T }`
    - Error: `{ request_id: string; ok: false; code: string; message?: string }`

- **Cross-plugin-attack guard contract.** Host-app implementers MUST validate that the qualified-name's namespace matches the dispatching plugin's pluginId before routing to the bridge. This prevents a malicious plugin from calling another plugin's tools via the shared `plugin:mcp-call` channel. The Foundation does not enforce this guard (it's a host-app responsibility) but documents it as a wire-contract invariant.

### Tests

- `test/runtime-callmcp.test.ts` — 11 new tests covering happy-path resolution, error-path rejection with code propagation, request_id matching (mismatched ignored, concurrent calls each resolve independently), CustomEvent options (bubbles + composed), listener cleanup (no leak after resolve or reject), curried dispatcher, and `crypto_unavailable` guard
- Total: 188/188 grün (was 177 in v0.5.0 → +11 runtime-callmcp)

### Lockstep version bumps

All Foundation packages re-versioned from `0.5.0` → `0.6.0`:

| Package                                       | 0.5.0 → 0.6.0                    |
| --------------------------------------------- | -------------------------------- |
| `@nexus-mindgarden/plugin-bridge-foundation`  | 0.5.0 → 0.6.0 (adds `/runtime`)  |
| `@nexus-mindgarden/plugin-storage-foundation` | 0.5.0 → 0.6.0 (no source change) |
| `@nexus-mindgarden/plugin-svelte-foundation`  | 0.5.0 → 0.6.0 (no source change) |
| `@nexus-mindgarden/plugin-mcp-foundation`     | 0.5.0 → 0.6.0 (no source change) |
| `@nexus-mindgarden/create-plugin`             | 0.5.0 → 0.6.0 (no source change) |

### Cross-Repo Provenance

- **agent (Luma) msg #607** — Original wire-contract design (CustomEvent shape + bubble/composed flags + request_id correlation pattern)
- **wiz-mind msg #614** — Foundation-feature-request with consumer-vote (wiz-mind 5+ calls in play-bundle + character-bundle; mind-canva 3+ calls per CROSS-PLUGIN-INTEGRATION cookbook). Two-consumer-trigger met same-message.
- **mind-canva msg #599** — CROSS-PLUGIN-INTEGRATION cookbook published with 3 demo-recipes (ET-Mind Schaltschrank-Layout, EA-Plug Rechnungs-Briefkopf, V8-Fam Family-Calendar-Poster) — each needs `layout.create` / `export.pdf` / `brand_kit.get` calls from custom-element bundles

### Deferred (planned for v0.6.1 or v0.7.0)

- **`BridgeAuthContext.bearerToken` raw-token-passthrough** (plug-elec msg #602 feature-request) — Pattern-1 graduation blocker for plugins with reverse-call surfaces. Needs careful security-design (raw-token-leak-to-handler-logs is a risk) so deferred for v0.6.1 with opt-in flag.
- **Per-host `expected_issuer`/`expected_audience` enforcement in `verifyBridgeToken`** (markview msg #549 + plug-elec msg #602) — Requires `HostKeyRecord` spec-extension. Multi-issuer bridges currently solve this via Pattern-2 Helper-Lib custom JWT-verifier. Bigger spec-change, deferred to v0.7.0.
- **§13 Provider-Guide candidate: "Same-key check: PEM-string-compare not fingerprint-compare"** (plug-elec msg #602) — would extend §13 with a Foundation-canonical PEM-equality pattern.

### Roadmap signal

**v0.6.x patches:** Bug fixes + minor additive features (e.g. `bearerToken` opt-in if delivered with security-review).

**v0.7.0 candidate:** Per-host issuer/audience HostKeyRecord-extension (markview/plug-elec multi-issuer bridges).

## [0.5.0] — 2026-05-21

**Minor bump — lockstep across all Foundation packages.** Adds `/persona` subpath as SHAPE-ONLY contract for cross-plugin persona-anchoring (Wiz-Mind's M17 SOUL/DIARY/MEMORY-pattern). Per wiz-mind msg #573 vote 3c: lock the contract early, ship runtime helper in v0.6.0 when ≥2 consumers signal explicit runtime need. Plus Provider-Guide §13 "Pre-Coding to Surface Contract-Drift" — codified dry-run-spec-validation discipline.

### Added

- **`@nexus-mindgarden/plugin-bridge-foundation/persona` subpath (SHAPE-ONLY)** — canonical `PersonaAnchorInput` schema + type + v0.6.0-runtime-contract types. **No runtime helper in v0.5.0.** Consumers `import type { PersonaAnchorInput }` for compile-time-check against their own prompt-builders; Foundation-types become de-facto canonical through usage instead of fiat.

  Re-exported surface:
  - **Sub-shapes:** `PersonaSoulSchema/PersonaSoul`, `PersonaDiaryEntrySchema/PersonaDiaryEntry`, `PersonaDiarySchema/PersonaDiary`, `PersonaMemorySchema/PersonaMemory`
  - **Enums:** `PersonaLocaleSchema/PersonaLocale` (`'de' | 'en'`), `PersonaRelationshipDispositionSchema/PersonaRelationshipDisposition` (`'trust' | 'neutral' | 'distrust' | 'hostile' | 'dead'`)
  - **Canonical input:** `PersonaAnchorInputSchema/PersonaAnchorInput`
  - **v0.6.0+ runtime-contract types:** `PersonaPromptBuildResult`, `BuildPersonaPromptFn`, `PersonaAnchoredAgentOptions`, `PersonaAnchoredAgent`

  Wiz-mind shape-extensions integrated (msg #570):
  - `locale: 'de' | 'en'` — required, narrator-persona is language-dependent (Granite-Floor §3.5 finding)
  - `setting_anchor: string` — required, prevents Granite-class drift to contemporary-fiction baseline
  - `npc_voice_style?: string` — optional Phase-7 NPC-dialogue voice-anchor
  - `relationship_disposition?: 'trust' | 'neutral' | 'distrust' | 'hostile' | 'dead'` — optional NPC-state-aware tone-mutation
  - `npc_id?: string` — optional metadata for multi-NPC parallel-instances pattern (one anchor per NPC, NOT a `Record<NpcId, ...>`-map)

- **`docs/PLUGIN-PROVIDER-GUIDE.md` §13 (new) — "Pre-Coding to Surface Contract-Drift"** — codified discipline for using consumer-adapters as compile-time fuzzers of cross-plugin wire-specs. Distilled from a real anecdote where a Phase-7-prep plugin's `LiveAdapter` against an in-flight TS-client surfaced two contract-bugs (arg-naming drift + silent-arg-stripping) before live-deploy. Includes when-applies / when-doesn't checklist + mitigations against wasted-effort + cross-link to §12 reversible-workarounds.

### Lockstep version bumps

All Foundation packages re-versioned from `0.4.x` → `0.5.0`:

| Package                                       | 0.4.x → 0.5.0                    |
| --------------------------------------------- | -------------------------------- |
| `@nexus-mindgarden/plugin-bridge-foundation`  | 0.4.1 → 0.5.0 (adds `/persona`)  |
| `@nexus-mindgarden/plugin-storage-foundation` | 0.4.0 → 0.5.0 (no source change) |
| `@nexus-mindgarden/plugin-svelte-foundation`  | 0.4.0 → 0.5.0 (no source change) |
| `@nexus-mindgarden/plugin-mcp-foundation`     | 0.4.0 → 0.5.0 (no source change) |
| `@nexus-mindgarden/create-plugin`             | 0.4.0 → 0.5.0 (no source change) |

Per v0.4.1 CHANGELOG: lockstep is relaxed for per-package patches, retained for minor/major bumps. v0.5.0 is a minor bump → lockstep.

### Tests

- `test/persona-shapes.test.ts` — 22 new tests covering all sub-schemas + canonical input + locale-validation + disposition-validation (incl. dead-NPC use-case) + multi-NPC parallel-instances pattern + v0.6.0-runtime-contract types (compile-shape only, no runtime asserted)
- Total: 177/177 grün (was 155 in v0.4.1 → +22 persona-shapes)

### Roadmap

**v0.6.0 candidate:** `createPersonaAnchoredAgent()` runtime helper under the same `/persona` subpath (additive expansion). Ships when ≥2 consumers signal explicit runtime need. Default-anchoring-logic + `buildPrompt`-override-callback already shape-locked in v0.5.0 — implementation is non-breaking.

**v0.5.0 carry-overs from v0.4.x roadmap:**

- Extend `HostKeyRecord` with per-host `expectedIssuer`/`expectedAudience` for multi-issuer-bridges (markview msg #549) — NOT in v0.5.0, deferred until concrete consumer-need lands

### Cross-Repo Provenance

- **wiz-mind msg #573** — Vote 3c (shape-only contract in v0.5.0) + permission for anonymized Pre-Coding anecdote in §13
- **wiz-mind msg #570** — Original 4 shape-extensions + override-callback-pattern + multi-NPC parallel-instances design
- **wiz-mind msg #570 close** — Live-adapter-caught-2-drifts-in-plug-db-contract anecdote (anonymized as "Phase-7-prep plugin" + "in-flight TS-client" in §13)

## [0.4.1] — 2026-05-21

**Per-package patch: `@nexus-mindgarden/plugin-bridge-foundation@0.4.1`** — adds slim `/shapes` subpath for drift-immunity types without runtime-cost. Other Foundation packages remain at `0.4.0` (lockstep relaxed for per-package patches; lockstep retained for minor/major bumps).

### Added

- **`@nexus-mindgarden/plugin-bridge-foundation/shapes` subpath** — wire-shape-only re-exports (zod-schemas + inferred-types + canonical-constants). Designed for two adoption-patterns surfaced by v0.4.0 consumer-feedback:
  1. **In-Repo-Mirror consumers** (zero supply-chain-Surface): Replace hand-rolled shape-mirrors with `import type { HostRecordStatus } from '@nexus-mindgarden/plugin-bridge-foundation/shapes'`. Drift-immunity without pulling hono/jose/storage-runtimes. The shape-only `import type` syntax + TS-elision means zero bundled bytes for type-only consumers.

  2. **Helper-Lib consumers** (selective Foundation-adoption): Pair with main subpath's runtime-helpers (e.g. `buildHostRecordStatus()` from `/auth`) without pulling `createBridgeApp` or full server-runtime.

  Re-exported surface (intentionally narrow):
  - `PluginManifestSchema` + `PluginManifest` + manifest sub-schemas
  - `HostRecordStatusSchema` + `HostRecordStatus` + drift-#206 constants (`PLUGIN_REGISTRATION_SCHEMA_VERSION`, `BASELINE_OPTIONAL_REGISTER_FIELDS`)
  - All endpoint request/response wire-shapes (handshake, register-host, health, execute-tool, render-ui, invoke-hook)
  - `BridgeTokenClaims` (JWT-wire-shape between Host and Bridge)

  Architecture-fence (NOT re-exported, by design):
  - `HostKeyRecord` / `HostKeyStatus` — internal-storage shapes (v0.5.0 spec-extension candidate for per-host `expectedIssuer`/`expectedAudience` for multi-issuer-bridge support)
  - `extractPublicKeyPem()` — runtime helper, lives in main subpath
  - `BridgeAuthContext` / handler-types — server-runtime
  - `createBridgeApp` etc. — runtime building-blocks

### Tests

- `test/shapes-subpath.test.ts` — 17 new tests covering canonical-constants, drift-#206 schema validation, all endpoint wire-shapes, architecture-fence (negative tests verify runtime-internals are NOT re-exported)
- Total: 155/155 grün (was 138 in v0.4.0 → +17 shapes-subpath)

### Motivation (Cross-Repo Provenance)

- **kanban msg #543** — Reported in-repo-mirror pattern (56-LoC `host-record-status.ts`, zero-dep). Legitimate engineering trade-off but drift-fragile if Foundation-spec evolves. `/shapes` gives kanban-style consumers drift-immunity via `import type` without forcing full-Foundation adoption.
- **markview msg #549** — Adopted Foundation@^0.4.0 as Helper-Lib (Pfad B), `buildHostRecordStatus()` live. `/shapes` makes the helper-lib pattern cleaner: types-only from `/shapes`, runtime-helpers from `/auth`, no full-server-runtime needed.

### Roadmap signal

- **v0.5.0 candidate (markview msg #549):** Extend `HostKeyRecord` with per-host `expectedIssuer`/`expectedAudience` fields to support multi-issuer-bridge architectures (e.g. one bridge serving V8 + FamilyMind + Theseus with distinct JWT-verifier-configs). Currently parked in `HostKeyRecord` (NOT in `/shapes` surface) so this spec-extension stays consumer-coordinated.

### Documentation

- **`docs/MIGRATION-COOKBOOK.md`** (new) — consolidated three-pattern adoption-playbook (Full-Replace / Helper-Lib / In-Repo-Mirror) with decision-matrix, step-by-step recipes, drift-discipline guidance per pattern, and reversal-path documentation. Distilled from three real-world v0.4.0+ adoption events; consumer-names anonymized pending naming-approval.
- **`docs/PLUGIN-PROVIDER-GUIDE.md` §12** (new) — "Writing Reversible Workarounds" — codified discipline for shipping workarounds with same-commit reversal-docs. Three-artifact pattern (workaround / `WHY`-doc / `REVERSAL-PATH` section), anatomy-template, anti-pattern checklist, when-NOT-to-apply guidance. Distilled from the real-world `docs/VENDOR-FOUNDATION.md` reversal-success-story (consumer anonymized).
- `README.md` — new "Migration & Adoption" section linking the Cookbook + Provider-Guide + Host-Integration-Guide.

## [0.4.0] — 2026-05-21

🎉 **npm-publish landed — Foundation as canonical npm-packages under `@nexus-mindgarden` scope.**

Closes the v0.3.0 → v0.3.3 anti-pattern bridge. github-URL+`&path:` subspec is now legacy; canonical consumer-pattern is `pnpm add @nexus-mindgarden/plugin-bridge-foundation@^0.4.0`.

### Breaking Changes (consumer-side)

- **Scope rename** `@nexus/*` → `@nexus-mindgarden/*` in ALL package names + imports:
  - `@nexus-mindgarden/plugin-bridge-foundation`
  - `@nexus-mindgarden/plugin-storage-foundation`
  - `@nexus-mindgarden/plugin-svelte-foundation`
  - `@nexus-mindgarden/plugin-mcp-foundation`
  - `@nexus-mindgarden/create-plugin`

- **Consumer dependency-syntax change**:

  ```diff
  - "@nexus/plugin-bridge-foundation": "github:MrDewitt88/plugin-template#v0.3.3&path:/packages/plugin-bridge-foundation"
  + "@nexus-mindgarden/plugin-bridge-foundation": "^0.4.0"
  ```

- **All imports must update**:
  ```diff
  - import { createBridgeApp } from '@nexus/plugin-bridge-foundation'
  + import { createBridgeApp } from '@nexus-mindgarden/plugin-bridge-foundation'
  ```

### Added

- **npm-org `@nexus-mindgarden`** (https://www.npmjs.com/org/nexus-mindgarden) — all 5 packages public-MIT.
- **`.github/workflows/publish.yml`** — Tag-trigger (`v*`) → builds + typechecks + tests + `pnpm -r publish` mit `--access=public` + `--provenance` (npm OIDC). Required GitHub-Secret: `NPM_TOKEN` (automation-type, bypasses 2FA for CI).
- **`publishConfig: { access: "public" }`** in alle 5 publishable packages.
- **`prepublishOnly: "tsc -p tsconfig.json"`** per-package — guarantees fresh-build on publish.
- **`repository.directory`** field — npm renders package as monorepo-subpath correctly.
- **`homepage` + `bugs` + `keywords`** populated für npm-discovery.
- **All Foundation packages aligned to `0.4.0`** (lockstep versioning, simpler migration).

### Removed

- **`dist/` zurück in `.gitignore`** — npm-publish ships dist/ in tarball. No more committed build-output.
- **Anti-pattern bridge ended.** v0.3.0-v0.3.3 mit committed-dist was pragmatic-bridge; npm-publish ist canonical-target erreicht.

### Migration für Konsumenten

```bash
# 1. Update package.json deps
sed -i '' 's|@nexus/plugin-|@nexus-mindgarden/plugin-|g' package.json packages/*/package.json
sed -i '' 's|github:MrDewitt88/plugin-template#v0\.3\.[0-9]&path:/packages/|@nexus-mindgarden/|g' package.json packages/*/package.json

# Manuell: ersetze die "@nexus-mindgarden/plugin-X-foundation": "@nexus-mindgarden/plugin-X-foundation"
# Doppelung mit echtem semver-pin:
#   "@nexus-mindgarden/plugin-bridge-foundation": "^0.4.0"

# 2. Update imports
find packages -name "*.ts" | xargs sed -i '' 's|@nexus/plugin-|@nexus-mindgarden/plugin-|g'

# 3. Re-install + test
pnpm install
pnpm test
```

Mind-Canva + Wiz-Mind sind primary first-movers. ETA migration ~30min pro Plugin.

### Reference Migration — Mind-Canva (battle-tested)

**First-mover validation:** mind-canva-CC migrated cleanly in **22min** (vs 30min-estimate ✓) — commit [`641f5c5`](https://github.com/MrDewitt88/Mind-Canva/commit/641f5c5) on `main`, 2026-05-21. The sed-script in the migration-section above is **battle-tested** by this run.

| Metric           | Wert                                                                                    |
| ---------------- | --------------------------------------------------------------------------------------- |
| Aufwand          | 22min                                                                                   |
| Files touched    | 30 (source + 2 `package.json` + `pnpm-workspace.yaml` + 7 docs)                         |
| Source-Renames   | `@nexus/plugin-` → `@nexus-mindgarden/plugin-` via sed                                  |
| Workspace-Konfig | `vendor/plugin-template/packages/*` entfernt aus `pnpm-workspace.yaml`                  |
| Vendored-Tree    | `vendor/` komplett gelöscht (~50 files)                                                 |
| Workarounds gone | `scripts/setup-foundation.sh` + `setup:foundation` script + `docs/VENDOR-FOUNDATION.md` |
| `pnpm install`   | 2.1s                                                                                    |
| Tests            | 162/162 grün                                                                            |
| UI build         | 95.1 KB gz (unchanged)                                                                  |
| Drift-discipline | maintained (identical foundation-code, just via npm)                                    |

**Verified import-resolution** out of `@nexus-mindgarden/plugin-bridge-foundation` + `/observability` subpath: `createBridgeApp`, `HostKeyRegistry`, `JsonFileHostKeyRepo`, `loadManifest`, `Logger`, `MetricsRegistry`. Bridge boot identical to vendored-version (`bridge_listening` + `storage_opened` clean).

**Pattern-Learning — Foresight-Payoff:** Mind-Canva's previously-shipped `docs/VENDOR-FOUNDATION.md` had explicitly documented the **reversal-path** for vendor → npm. When v0.4.0 landed, that documentation flowed 1:1 into action. This is the canonical example for "write workarounds with the reversal-pattern in mind" — see Provider-Guide for the pattern-essay.

### Cross-Repo Provenance

- **wiz-mind DM #508** — Path-A error report (v0.3.0 broken)
- **plug-elec DM #509** — Independent reproduce + Option-A (npm-publish) vote
- **User D1-D4 decisions** — Org-name `@nexus-mindgarden`, public-access, lockstep, all 5 packages
- **mind-canva msg #534** — First-mover migration success report (22min, 162/162 green)

### Roadmap

v0.4.x patches (bug fixes), v0.5.0 wenn nächste feature-iteration. v0.4.0 ist Foundation-distribution-stable.

## [0.3.3] — 2026-05-21

Third hotfix in 4 hours. wiz-mind (msg #508) + plug-elec (msg #509) independently reproduced that v0.3.2 still didn't work for consumers. **Real root-cause finally diagnosed + fixed.**

### The Real Problem (both install-paths broken before v0.3.3)

**Path A: `pnpm add github:...#v0.3.2`** (no subspec):

- pnpm aliases `@nexus/plugin-bridge-foundation` → ROOT `@nexus/plugin-template` package
- Root has no `main`/`exports` (`"private": true`) → "Failed to resolve entry"

**Path B: `pnpm add github:...#v0.3.2&path:/packages/plugin-bridge-foundation`** (subspec):

- pnpm installs sub-package isolated
- BUT prepare-hook only runs at ROOT install, not at sub-package install
- `dist/` doesn't exist in installed package → ERR_MODULE_NOT_FOUND

v0.3.1's prepare-hook only helped Path A — but Path A is broken for a different reason.

### Fix (Option B — Pre-Built dist/ Committed)

Per plug-elec msg #509 recommendation + wiz-mind msg #508 fallback:

- **Removed `dist/` from `.gitignore`** — Foundation packages ship pre-built dist/ in git
- **Force-built all packages** + committed `packages/*/dist/` (~218 files)
- **All Foundation packages aligned to `0.3.3`** (were drifted: bridge 0.3.1, svelte 0.3.2, storage/mcp 0.2.0)

Consumer install via `&path:` subspec now finds `dist/` immediately:

```bash
pnpm add 'github:MrDewitt88/plugin-template#v0.3.3&path:/packages/plugin-bridge-foundation'
```

### Anti-Pattern Acknowledgement

Committing build-output to git is anti-pattern. We're doing it as a **bridge to npm-publish** (v0.4.0 roadmap, per Option A consensus). Trade-offs:

- ✅ Consumers can install via github immediately
- ✅ Foundation surface stable enough to commit
- ⚠️ Diffs include dist/ — git-blame/code-review noise
- ⚠️ Manual `pnpm -r build` discipline before tagging (until v0.4.0 CI automates)

### v0.4.0 Roadmap (npm-publish)

Per wiz-mind #508 + plug-elec #509 consensus:

1. Setup `@nexus` npm-org
2. CI workflow on tag: `pnpm -r build && pnpm -r publish`
3. Re-introduce `dist/` to `.gitignore`
4. Consumers migrate from `github:...` to `@nexus/plugin-bridge-foundation@0.4.x`

### Lessons-Learned (cumulative v0.3.0-0.3.3)

- **Always test consumer-side install via fresh github-clone before tagging** — should be CI gate
- **gitignore patterns at workspace-root affect sub-package source** — per-package `.gitignore` safer
- **prepare-hook only runs at root install** — not sub-package isolated install
- **Version alignment matters** — sub-packages drifted from 0.2.0 → 0.3.x silently

### Cross-Repo Provenance

- **wiz-mind** DM #508 — Path-A error + `link:` workaround
- **plug-elec** DM #509 — Independent reproduce + Path B failure analysis + 3 fix options with vote
- Both vote Option A (npm-publish) as long-term, Option B (committed dist) as immediate bridge

## [0.3.2] — 2026-05-21

Critical fix release — second wiz-mind report DM #487. v0.3.1 prepare-hook unblocked 3 of 4 packages, but plugin-svelte-foundation still failed because **source files were missing from git tracking**.

### Fixed

**`.gitignore` `build/` pattern accidentally excluded `packages/plugin-svelte-foundation/src/build/`**

Root cause: `.gitignore` line 3 had bare `build/` pattern, which matched any directory named `build/` at any depth. `src/build/` in plugin-svelte-foundation is a **legitimate source-folder** containing `esbuild-config.ts` + `index.ts` for build-pipeline-helpers exposed at `@nexus/plugin-svelte-foundation/build` subpath. These files were untracked since v0.0.1 — locally everything compiled because the files existed on disk, but consumer-clones via `pnpm add github:...` got tarballs without these files.

Fix:

- Removed `build/` rule from `.gitignore` (was overzealous — no package outputs to `build/` directory; everything uses `dist/`)
- Force-added `packages/plugin-svelte-foundation/src/build/{index.ts,esbuild-config.ts}` to git
- plugin-svelte-foundation bumped to `v0.3.2` (matches monorepo version, was stuck at `0.2.0` since v0.1.0 release)

### Lessons-Learned

- **Always test consumer-side install via fresh github-clone before tagging.** Local builds mask gitignore-excluded source files.
- **Per-package `.gitignore` > root-level shotgun-patterns** for monorepos. v0.3.x kept the global pattern minimal.

### Tests

- Foundation tests unchanged (268/268 grün)
- Consumer-side smoke test (future): scaffold a temp-repo + `pnpm add github:...#tag` + verify resolve

### Cross-Repo Provenance

- **wiz-mind** DM #487 — TS2307 build error report with root-cause analysis + repro-steps + variant (c) workaround already adopted

## [0.3.1] — 2026-05-21

Hotfix release. Two blockers reported within hours of v0.3.0 ship — consumer-side build + cross-repo wire-drift. Both addressed.

### Fixed

**1. Consumer-side build broken on `pnpm add github:...#v0.3.0`** (wiz-mind DM #486)

Root cause: GitHub tags don't ship pre-built `dist/`, and root package.json had no `prepare`-hook to trigger build post-install. Consumers got `Failed to resolve entry for package "@nexus/plugin-bridge-foundation"`.

Fix: `prepare: "pnpm -r build"` added to root package.json. When pnpm clones the repo for `github:...` install, it now auto-builds dist/ in every workspace-package. Also added `build: "pnpm -r build"` script for explicit invocation.

**2. Cross-Repo `register-host` field-name drift** (V8 msg #483 + markview msg #485)

Two wire-format-camps existed parallel:

- Theseus/MarkView-canonical: `public_key`
- plug-tmpl-Foundation-canonical: `public_key_pem`

`RegisterHostRequestSchema` now accepts BOTH fields (prefer `public_key_pem` when both present — deskriptiver Name + matches Foundation-canonical-target + markview msg #485 long-term-vote). Server.ts uses new `extractPublicKeyPem(req)` helper. Backward+forward-compat with V8's dual-emit pattern (commit `7f1badc`) and markview's reader-side fix (commit `12f5724`).

### Added

- **`extractPublicKeyPem(req)` helper** exported from `@nexus/plugin-bridge-foundation` — drift-resolution: prefer pem, fall back to legacy. Throws if both missing (should never happen — Zod-schema enforces via `.refine()`).
- **11 neue Tests** in `test/dual-pubkey.test.ts` covering: Schema accepts both fields, schema rejects neither, helper-preference, dual-emit roundtrip via `app.request`.

### Tests

- bridge-foundation: 128 → 139 (+11 dual-pubkey tests)
- Total workspace: 257 → **268 grün**

### Migration Notes

- **Existing consumers** (wiz-mind, mind-canva, etc.) — re-install via `pnpm add github:MrDewitt88/plugin-template#v0.3.1`. The `prepare`-hook now builds dist/ on install. Fresh installs no longer hit the "resolve entry" error.
- **No breaking changes** vs v0.3.0 — additive only (`public_key` field added as accepted-alternative; existing `public_key_pem`-callers unaffected).

### Cross-Repo Provenance

- **wiz-mind** DM #486 — consumer-side build break reported, suggested fix (a) prepare-hook
- **V8** msg #483 — drift report, V8 dual-emit landed commit `7f1badc`
- **markview** msg #485 — reader-side fix commit `12f5724`, long-term vote for `public_key_pem`-canonical
- **oracle** (kanban-cc) msg #484 — kanban-bridge wire-extension uses Foundation pattern in-repo (Foundation v0.3.x as reference, not hard-dep)

## [0.3.0] — 2026-05-21

`agent.complete` Foundation-Helper für Plugin-Authors. Closes the cross-repo contract from chatbus thread="contracts" 2026-05-21 (msg #443-449, GO from oracle/mind-canva + v8-corp + v8-fam).

### Source-Story

User-Argument (2026-05-21):

> _"wenn jedes Plugin extra zugriff für LM Studio benötigt, hab ich jetzt schon 11 Verbindungen obwohl eine ausreichen würde und zwar über den Chat von Theseus-Agent"_

Agent (Luma) proposed `agent.complete` als canonical Plugin-to-LLM Tool — 1 client am LM Studio statt N racing connections. Theseus shipped `v0.15.0-agent-complete-endpoint` (commit `51921ff`) mit `@theseus/agent-complete-schema` (Theseus monorepo, npm-publish pending). V8 + v8-fam implementieren `/mcp/v1/call-tool` Reverse-Call zu Theseus `POST /agent/complete` per Design-Y.

### Added

- **`@nexus/plugin-bridge-foundation/agent-complete` subpath** mit:
  - **`createAgentComplete({bridgeEndpoint, sessionToken, callerId?, requestId?})`** — typed wrapper around `fetch(bridgeEndpoint + '/mcp/v1/call-tool')` mit `{tool: 'agent.complete', arguments: validated}`. Zod-validation auf Request + Response.
  - **`agentCompleteText(client, req)`** — convenience helper, throws on error-envelope für callers die nur den text wollen.
  - **`AgentCompleteError`** typed Error-Class mit codes (invalid_request / http_error / invalid_response / transport_failure).
  - **Schemas dupliziert als stop-gap** bis `@theseus/agent-complete-schema` npm-published wird (AgentCompleteRequestSchema, AgentCompleteResponseSchema, ResponseFormatSchema, CacheRetentionSchema, ChatMessageSchema, ToolCallSchema, UsageSchema)
  - 20 neue Tests

- **`docs/PLUGIN-PROVIDER-GUIDE.md` §11 (NEU)** — `agent.complete` als Pflicht-Pattern dokumentiert mit 10 sub-sections (Anti-Pattern direct-HTTP, Foundation-Helper-Usage, Capability-Request, Granite-Floor-Compat, Cache-Retention, Dev-Preview-Anti-Pattern, Error-Envelope, X-Request-Id-Tracing, Migration-Reihenfolge, Schema-Source-of-Truth).

### Tests

- bridge-foundation: 108 → **128** (+20 agent-complete tests)
- Total workspace: **257 grün** (128 + 30 + 33 + 31 + 35)

### Cross-Repo Provenance

- **agent** msg #443 — original contract proposal (LM-Studio-inflight-limit argument)
- **oracle/mind-canva** msg #444 — GO + 3 follow-ups (A streaming, B responseFormat, C cache-retention)
- **v8-corp** msg #445 — GO + Design-Y Reverse-Call-Endpoint sketch
- **v8-fam** msg #446 — GO + mirror-adoption commitment
- **agent** msg #447 — answers to A/B/C
- **agent** msg #449 — Theseus tag `v0.15.0-agent-complete-endpoint` shipped
- **v8-fam** msg #448 — Schema-Hosting Option (b) Shared-Package wins

### Migration Notes for Plugin-Authors

Wenn ihr direct-HTTP zu LM Studio macht (plug-elec / plug-db / markview / ea-plug / kanban):

1. Add `pnpm add github:MrDewitt88/plugin-template#v0.3.0`
2. Replace `OpenAIProvider`-direct-HTTP with `createAgentComplete({...})`
3. Request `agent.llm:invoke` capability bei M17 guest-registration
4. Re-run Granite-Pilot pre-merge (Caller's responsibility, unchanged)

Mind-Canva first-mover committed to 24-48h migration once V8 Reverse-Call live (msg #444).

### Schema-Stop-Gap Note

Foundation v0.3.0 dupliziert die Schemas faithful zu Theseus' msg #449 spec. Wenn Theseus `@theseus/agent-complete-schema` npm-published wird, kommt Foundation v0.3.x bump auf peer-dep — Type-re-exports bleiben backward-kompatibel.

## [0.2.3] — 2026-05-18

Defensive guard against buggy hosts. Source: plug-elec DM #350 + C.1 cross-repo-debug-thread (msg #332-#357). v8-corp landed the canonical V8-Side supply-or-skip fix (`9494bf7`), Foundation now adds belt-and-suspenders for cross-host robustness.

### Added

- **`reregister_loop_detected: boolean | undefined` in `HostRecordStatus`** — optional field, only present (=true) when Foundation detects a host re-registering in a no-op loop. Plugin-handler can decide ob 429 zurück oder nur warn-log.
- **`HostKeyRegistry.detectReregisterLoop(hostId, missing_optional_fields)`** — pure check method (no side-effects), returns true if same `{host_id, missing-fields-fingerprint}`-tuple appeared ≥`reregisterLoopThreshold` (default 3) times in `reregisterLoopWindowMs` (default 5min).
- **In-memory tracking** in `HostKeyRegistry` — Map<host_id, RingBuffer<{timestamp, missingFingerprint}>>, capped at 10 entries per host. Auto-updated on every `register()` call. Set `reregisterLoopThreshold: 0` to disable.
- **`buildHostRecordStatus({ loopDetected })`** — helper accepts optional flag, includes field only when true.
- **register-host endpoint + handshake endpoint** automatically populate `reregister_loop_detected` via `registry.detectReregisterLoop()`.
- **12 neue Tests** für loop-detection (first-register, under-threshold, at-threshold, window-expired, fingerprint-changes, per-host-isolation, disable, configurable, RingBuffer-cap, buildHostRecordStatus integration)

### Tests

- bridge-foundation: 96 → 108 (+12)
- Total workspace: 225 → **237 grün**

### Cross-Repo Provenance

- plug-elec DM #350 — Pfad-B opt-in request, offered to be consumer + live-test against V8 bug
- v8-corp `9494bf7` — canonical V8-Side supply-or-skip fix (primary)
- C.1 cross-repo-CLOSED end-to-end with Drift #206 production-validated (msg #345, #357)
- Foundation defensive guard = cross-host-robustness (ET-Mind runs in 6+ hosts)

### Usage

```ts
const registry = new HostKeyRegistry(repo, {
  optionalRegisterFields: ['host_version', 'relay_url'],
  // Defaults: 3 same-tuple re-registers in 5min trigger flag
  reregisterLoopThreshold: 3,
  reregisterLoopWindowMs: 5 * 60 * 1000,
})

// In a tool-handler or middleware:
if (handshakeResponse.host_record_status.reregister_loop_detected) {
  // Optionally return 429 to the buggy host, or just warn-log
  logger.warn('host re-registering in loop', { host_id, missing })
}
```

## [0.2.2] — 2026-05-18

Patch release closing follow-ups aus v0.2.1 cross-repo-ack-DMs + adding distributed-tracing primitive.

### Added

- **`X-Request-Id` middleware in `createBridgeApp`** — distributed-tracing primitive. Foundation generates UUIDv4 wenn no incoming header (case-insensitive `X-Request-Id` / `x-request-id`), echoes back in response, propagiert über `c.get('request_id')` in handlers + access-log. CORS `allowHeaders` + `exposeHeaders` enthalten `X-Request-Id`. Source-Pattern: plug-db's X-Request-Id 3-Service-Tracing (chatbus #294). Cross-language consistency mit Python/FastAPI Bridges.
- **`request_id` field in access-log** — wenn `observability.logger` provided, jede HTTP-request-log-line includet `request_id`-field für log-correlation.
- **`BridgeEnv.Variables.request_id`** — Hono-typed access via `c.get('request_id')` für plugin-handler code.
- **6 neue Tests** in `test/request-id.test.ts` (generate, propagate, case-insensitive, access-log inclusion, uniqueness, CORS headers exposed)

### Provider-Guide §5.5 (NEU) — render-ui Wire-Spec canonical

- Request-body shape (`route_path`/`tenant_id`/`user_id`/`context` + Authorization Bearer header, KEIN `bridge_token` im body) — aligned mit V8-Side canonical (DM #335, [`docs/PLUGIN-BRIDGE-PROTOCOL.md`](https://github.com/MrDewitt88/TeamMindV8/blob/main/docs/PLUGIN-BRIDGE-PROTOCOL.md))
- Response shape (`{html, scripts, styles}` mit relative-URL-resolution gegen `service_endpoint`)
- Reference-Implementations-Tabelle: V8 Frontend-Render (`apps/host/src/routes/(app)/plugins/[plugin_id]/[...path]/+page.svelte`), V8 Bridge-Client (`packages/plugins/src/server/bridge-client.ts:401-426`), MarkView Producer, ET-Mind Producer (post-M3), EA-Mind Producer
- Drift-Status: V8 ↔ Theseus keine bekannten Wire-Mismatches (msg #335), Pfad-C-Collab `collab`-Block bleibt v0.3.0+ Backlog

### Tests

- bridge-foundation: 90 → 96 (+6 request-id tests)
- Total workspace: 219 → **225 grün**

### Reference

- v8-corp DM #335 — render-ui canonical-spec
- plug-db msg #294 — X-Request-Id 3-Service-Tracing Pattern
- v8-corp/plug-elec C.1 debug-thread (msg #332-#340) — silent-fail diagnostic motivation

## [0.2.1] — 2026-05-17

Follow-up patch closing three cross-repo asks from v0.2.0 ack-DMs.

### Added

- **`SqliteHostKeyRepo`** in `@nexus/plugin-bridge-foundation/auth` — SQLite-backed `HostKeyRepo` für embedded persistent state. Source-Pattern: markview Pfad-C-Collab Migration v5 (msg #302). Drop-in für bestehende Schemas — `CREATE TABLE IF NOT EXISTS` ist no-op auf existing tables, Foundation touched nur die definierten Spalten (`host_id`, `public_key_pem`, `status`, `fingerprint`, `registered_at`, `approved_at`). Plugin-spezifische Extra-Spalten (z.B. markview's `last_used_at`, `relay_url`) bleiben auf der Tabelle unangetastet. Configurable `tableName` (default `'plugin_host_keys'`, markview overridet auf `'host_keys'`). Structural typing via `SqliteHostKeyRepoDatabase`-Interface — kein direct `better-sqlite3`-import → keine Force-Dep für Konsumenten die nur InMemory/JsonFile nutzen.
- **IPv6 loopback `[::1]` in Drift #203 enforcement** (msg #303 plug-elec) — `validateManifest()` flagged jetzt alle drei loopback-Varianten: `localhost`, `127.0.0.1` (canonical), `[::1]`. Cross-Repo-Pattern aligned mit ET-Mind packages/etmind-bridge/src/manifest-loader.ts.
- **Provider-Guide §10.3 erweitert** mit SQLite-backed-Repo Beispiel + drop-in compat-Hinweis.
- **Provider-Guide §10.5 (NEU) "Wann brauche ich Foundation überhaupt?"** — Heuristik runtime-discovery (Foundation) vs build-time-resolve (Library-Counter-Example). Design-Mind als Counter-Example mit Verweis auf brand-skin templates + THEMING.md.

### Tests

- bridge-foundation: 77 → 90 (+13 — 10 new SqliteHostKeyRepo + 3 new IPv6/[::1] drift-203)
- Total workspace: 206 → **219 grün**

### Reference

- markview DM #302 — v5-schema audit pointers
- plug-elec DM #303 — `[::1]` Cross-Repo-Konsistenz GO
- plug-design DM #301 — Counter-Example pin auf `v0.1.0`-tag

## [0.2.0] — 2026-05-17

Seven-gap closure release. Full upgrade-guide für CCs: [`docs/UPGRADE-v0.2.0.md`](docs/UPGRADE-v0.2.0.md).

Cross-Repo-Provenance: alle 7 Lücken stammen aus heutigem chatbus-Traffic — duplicate-work zwischen plug-elec, plug-db, oracle/plug-ea, markview die jetzt Foundation-Level abgedeckt sind. Keine breaking changes vs v0.1.x — alles additive.

### Added

- **Observability primitives** in neuem subpath `@nexus/plugin-bridge-foundation/observability`:
  - `Logger` — dependency-free JSON-Lines structured logger, 4 levels (debug/info/warn/error), bound-context via `.child()`, env-override BRIDGE_LOG_FORMAT=text, warn/error → stderr
  - `Counter` / `Gauge` / `MetricsRegistry` — dependency-free Prometheus exposition-format 0.0.4
  - Source-Pattern: plug-elec etmind-bridge/src/{logger,metrics}.ts (msg #240) + plug-db OBS1/OBS2 (msg #221)
- **`BridgeAppOptions.observability`** — opt-in wiring:
  - HTTP-request counter `plugin_bridge_http_requests_total{method,path,status}`
  - Uptime gauge `plugin_bridge_uptime_seconds`
  - Registry-size gauge `plugin_bridge_host_registry_size`
  - `/metrics` endpoint (unauth, top-level, content-type `text/plain; version=0.0.4`)
  - Per-request access-logs via Logger
- **`staticUiHandler` + `BridgeAppOptions.staticUi`** (`/static/ui/*`) — path-traversal-safe file-serving mit content-type detection (.js/.css/.svg/etc.) + immutable cache-control + canonical Drift #103 404-shape. Source-pattern: oracle Q5 in render-ui-Thread (msg #259)
- **Drift #203 enforcement in `loadManifest()` + `validateManifest()`** — `service_endpoint: http://localhost:*` flagged in 'warn' mode (default), or 'strict' (throws `ManifestError('drift_203')`), or 'off' (legacy migration path). `ManifestValidationOptions` + `Drift203Mode` types exported.
- **`StorageError` + `toCanonicalError()`** in `@nexus/plugin-storage-foundation` — Drift #103-compliant error class für storage-throwables. `migrate()` rollback-blocked now throws `StorageError` instead of plain `Error`.
- **`relay_url` in `BASELINE_OPTIONAL_REGISTER_FIELDS`** — Pfad-C-Collab (markview) + reverse-call (plug-elec) jetzt baseline. `RegisterHostRequestSchema` accepts optional `relay_url: z.string().url().optional()`. `host_record_status` tracks it in `missing_optional_fields[]`.
- **Test-Utilities** in neuem subpath `@nexus/plugin-bridge-foundation/testing`:
  - `buildTestRegistry()` — one-shot Ed25519-keypair + HostKeyRegistry mit pre-approved bootstrap-host
  - `mintTestBridgeToken()` — JWT-signer für custom-claims
- **Subpath-exports erweitert**: `./observability` + `./testing` in `package.json`
- **Top-level re-exports erweitert**: `staticUiHandler`, `BridgeObservabilityOptions`, `StaticUiHandlerOptions`

### Changed

- `InvokeHookResponseSchema.error` now includes optional `details?: unknown` field — Drift #103 parity mit `ExecuteToolResponseSchema`. invoke-hook handler propagates `e.details` from thrown errors. execute-tool handler same.
- `tsconfig.json` für `plugin-bridge-foundation`: `lib` erweitert auf `["ES2022", "DOM"]` (needed for jose `KeyLike` types in testing-utilities)

### Confirmed (audit pass)

- Drift #103 error-shape durchgängig in allen Bridge-Endpoints
- Drift #200 bare tool-namespace documented in Provider-Guide §4.2
- Drift #12 idempotent register-host preserves status

### Tests

- bridge-foundation: 43 → 77 (+34 — Observability 11, static-ui 6, drift-203 6, testing-utils 4, server-observability 7)
- storage-foundation: 22 → 31 (+9 — errors module)
- Total workspace: 151 → **206 grün**

### Reference

[`docs/UPGRADE-v0.2.0.md`](docs/UPGRADE-v0.2.0.md) — comprehensive upgrade guide for affected CCs (plug-elec, oracle/plug-ea, markview) mit migration-snippets.

## [0.1.1] — 2026-05-17

Persistence-gap closure. Foundation v0.1.0 was in-memory-only — Plugin-Provider verloren registrierte Hosts beim Restart. plug-db's REL4 (chatbus #271) zeigte den Need; diese Patch-Release schließt das.

### Added

- **`JsonFileHostKeyRepo`** in `@nexus/plugin-bridge-foundation/auth` — atomic JSON-file `HostKeyRepo`-Implementation für Production-Plugin-Provider
  - Atomic-Write via `.tmp` + `rename()` (cross-platform safe, POSIX + Windows ≥ NTFS)
  - Lazy-load on first access; explicit `await repo.load()` für deterministic startup
  - Auto-creates parent directories
  - Serialized writes via internal Promise-queue (single-process safe)
  - Schema-versioned on-disk-format (`schema_version: 1`) für künftige Migration-Paths
  - 12 neue Tests (atomic-rename leaves no .tmp, ENOENT legitimate, concurrent upserts, schema-mismatch reject, Drift #12 idempotency through reload)
- **`JsonFileHostKeyRepoOptions`** type-export

### Reference

Pattern adopted from plug-db's `services/bridge/app/auth/host-registry.py` (REL4, msg #271) — same atomic-write guarantee, same `_yoyo_migration`-Concept. Cross-language consistency für Plugin-Provider die zwischen TS- und Python-Bridges wechseln.

### Usage

```ts
import { HostKeyRegistry, JsonFileHostKeyRepo } from '@nexus/plugin-bridge-foundation'

const repo = new JsonFileHostKeyRepo({ path: './data/host-keys.json' })
const registry = new HostKeyRegistry(repo, { autoAccept: false })
// File created on first upsert(); survives process restarts.
```

## [0.1.0] — 2026-05-17

First publicly-consumable release. Foundation-Packages production-ready für Plugin-Provider die gegen TeamMind/Nexus Plugin-Bridge-Protocol implementieren.

### Added

- **`@nexus/plugin-bridge-foundation` — Drift #206 host_record_status block**
  - Symmetric, always-present in `register-host` und `handshake` responses
  - Tracks `is_first_register` in `HostKeyRegistry.register()` (return-shape change: `{record, isFirstRegister}`)
  - Configurable `optionalRegisterFields` via `RegistryOptions` (default: `['host_version']`)
  - Public helper `buildHostRecordStatus()` für custom-Endpoint-Erweiterungen
  - Constant `PLUGIN_REGISTRATION_SCHEMA_VERSION = 1` für Schema-Drift-Detection
  - 12 neue Tests (host-keys.test.ts: 18 total now)
- **`docs/PLUGIN-PROVIDER-GUIDE.md` §4 expansion**
  - §4.1 manifest reference verwendet `http://127.0.0.1:<port>` (Drift #203) statt `localhost`
  - §4.2 explicit Drift #200 callout — MCP-Tool-Namen sind im Manifest IMMER bare `<module>.<verb>`, NIE `<plugin-id>.`-prefixed
  - **§4.5 (NEU) host_record_status documentation** — Drift #206 Pattern + Foundation-Default + Cross-Repo-Source
- **`docs/templates/CLAUDE-SETTINGS-LOCAL-TEMPLATE.md` (NEU)**
  - Skeleton-Vorlage für Plugin-Provider-Repos
  - Dokumentiert die Auto-Classifier-Override-Convention etabliert 2026-05-17 im mindgarden-Ökosystem (plug-design + plug-elec + plug-db + v8-corp + oracle/plug-ea Adoption)
  - Stack-Erweiterungen für Python (uv) + Docker-Compose + Postgres-Migrations
- **`.claude/settings.local.json.suggested` (NEU)**
  - plug-tmpl's eigener Skeleton — pnpm/git/gh allow-list, keine destructive ops
- **`RegisterHostRequestSchema` + `RegisterHostResponseSchema`** in `@nexus/plugin-bridge-foundation/types`
  - Zod-validation für register-host Body (vorher hand-rolled)
  - Optional `host_version`-Field als baseline für Drift #206

### Changed

- **BREAKING** `HostKeyRegistry.register()` return shape: `HostKeyRecord` → `{ record: HostKeyRecord, isFirstRegister: boolean }`. Caller müssen destrukturieren.
- **BREAKING** `handshakeHandler(manifest)` signature → `handshakeHandler(manifest, registry)`. Registry ist nötig für `host_record_status`-Berechnung.
- `register-host` endpoint validiert Body jetzt via Zod (`RegisterHostRequestSchema`) statt hand-rolled type-guards. Error-Messages enthalten Field-Pfade.

### Confirmed (already baked-in, audit pass)

- **Drift #103** canonical error-response-shape `{error:{code,message,details?}}` durchgängig in allen 400/401/404/500-Pfaden (handshake, register-host, execute-tool, render-ui, invoke-hook, auth-middleware)
- **Drift #12** idempotent register-host preserves status für same-key
- **Drift #8** CORS preflight via `hono/cors` middleware

### Cross-Repo-Provenance

- Drift #200 (bare tool-namespace) — etabliert in plug-elec ET-Mind, adoptiert von oracle/plug-ea, V8 synthesisiert Prefix
- Drift #203 (`127.0.0.1` vs `localhost`) — etabliert in plug-elec nach V8 Drift #16/#22 CSP-Mismatch-Investigation
- Drift #206 (host_record_status) — etabliert in plug-elec (`etmind-bridge/src/auth/host-registry.ts:48-68`), adoptiert von oracle/plug-ea (`eamind-bridge/src/host-registry.ts:73-93`), Theseus + V8 align'd
- Auto-Classifier-Override-Convention — etabliert 2026-05-17 in chatbus #213 (plug-design) + #216 (plug-elec) + #219 (plug-db), 5+ Repo-Adoption am selben Tag

## [0.0.1] — 2026-05-04

Initial L1 Foundation-Skeleton — pnpm-workspace + tsconfig + vitest + prettier + LICENSE + README + 4 Foundation-Package-READMEs als L2-Seed.
