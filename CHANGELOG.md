# Changelog

All notable changes to `@nexus/plugin-template` and its foundation packages are documented here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
