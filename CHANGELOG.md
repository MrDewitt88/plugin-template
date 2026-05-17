# Changelog

All notable changes to `@nexus/plugin-template` and its foundation packages are documented here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
