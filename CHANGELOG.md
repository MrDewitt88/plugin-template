# Changelog

All notable changes to `@nexus/plugin-template` and its foundation packages are documented here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

> *"wenn jedes Plugin extra zugriff für LM Studio benötigt, hab ich jetzt schon 11 Verbindungen obwohl eine ausreichen würde und zwar über den Chat von Theseus-Agent"*

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
