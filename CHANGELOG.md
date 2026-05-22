# Changelog

All notable changes to `@nexus-mindgarden/plugin-template` and its foundation packages are documented here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

| Package | 0.5.0 → 0.6.0 |
|---|---|
| `@nexus-mindgarden/plugin-bridge-foundation` | 0.5.0 → 0.6.0 (adds `/runtime`) |
| `@nexus-mindgarden/plugin-storage-foundation` | 0.5.0 → 0.6.0 (no source change) |
| `@nexus-mindgarden/plugin-svelte-foundation` | 0.5.0 → 0.6.0 (no source change) |
| `@nexus-mindgarden/plugin-mcp-foundation` | 0.5.0 → 0.6.0 (no source change) |
| `@nexus-mindgarden/create-plugin` | 0.5.0 → 0.6.0 (no source change) |

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

| Package | 0.4.x → 0.5.0 |
|---|---|
| `@nexus-mindgarden/plugin-bridge-foundation` | 0.4.1 → 0.5.0 (adds `/persona`) |
| `@nexus-mindgarden/plugin-storage-foundation` | 0.4.0 → 0.5.0 (no source change) |
| `@nexus-mindgarden/plugin-svelte-foundation` | 0.4.0 → 0.5.0 (no source change) |
| `@nexus-mindgarden/plugin-mcp-foundation` | 0.4.0 → 0.5.0 (no source change) |
| `@nexus-mindgarden/create-plugin` | 0.4.0 → 0.5.0 (no source change) |

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

| Metric | Wert |
|---|---|
| Aufwand | 22min |
| Files touched | 30 (source + 2 `package.json` + `pnpm-workspace.yaml` + 7 docs) |
| Source-Renames | `@nexus/plugin-` → `@nexus-mindgarden/plugin-` via sed |
| Workspace-Konfig | `vendor/plugin-template/packages/*` entfernt aus `pnpm-workspace.yaml` |
| Vendored-Tree | `vendor/` komplett gelöscht (~50 files) |
| Workarounds gone | `scripts/setup-foundation.sh` + `setup:foundation` script + `docs/VENDOR-FOUNDATION.md` |
| `pnpm install` | 2.1s |
| Tests | 162/162 grün |
| UI build | 95.1 KB gz (unchanged) |
| Drift-discipline | maintained (identical foundation-code, just via npm) |

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
