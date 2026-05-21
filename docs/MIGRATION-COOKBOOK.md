# Migration Cookbook

How to migrate an existing plugin to `@nexus-mindgarden/plugin-bridge-foundation@^0.4.0+`. Three battle-tested patterns surfaced from real-world adoption events; pick the one that matches your plugin's architecture.

> **Versions used in examples:** `@nexus-mindgarden/plugin-bridge-foundation@^0.4.1` (adds `/shapes` subpath). For `^0.4.0`, the `/shapes` subpath is unavailable — use main subpath for all imports.

---

## Decision Matrix

Pick **one** pattern per consumer-plugin. You can mix-and-match _within_ a plugin (e.g. one package uses Pattern 1, another uses Pattern 2), but adopting two competing patterns _for the same surface_ creates drift-risk.

| Property | Pattern 1: Full-Replace | Pattern 2: Helper-Lib | Pattern 3: In-Repo-Mirror |
|---|---|---|---|
| Single-issuer bridge | ✓ recommended | ✓ overkill | ⚠ overkill |
| Multi-issuer bridge (multiple JWT-verifier-configs at one bridge) | ✗ blocked until v0.5.0 spec-extension | ✓ recommended | ✓ |
| Zero supply-chain-Surface required (npm-resolve refused) | ✗ | ⚠ partial (Foundation still added as dep) | ✓ recommended |
| Drift-immunity types desired without runtime-cost | use `/shapes` for type-only imports | use `/shapes` for type-only imports | **adopt `/shapes` even without runtime-import** |
| Plugin owns custom `HostKeyRecord` shape (extra fields like `lastUsedAt`) | ✗ | ✓ | ✓ |
| ETA for migration (typical) | ~22min (sed-script + verify) | ~45min (selective helper-call wireup) | ~30min initial mirror + ongoing `/shapes` re-sync |

---

## Pattern 1: Full-Replace

**Adoption shape:** Foundation is your bridge — `createBridgeApp()` is called from your plugin's entry-point, `HostKeyRegistry` manages your JWT-verification, all wire-shapes flow through Foundation's endpoint-handlers.

**Best for:** Single-issuer bridges (one Host/JWT-verifier-config per bridge). Plugin developers who want the bridge HTTP-server commodity-ized and want to focus on plugin-domain-logic.

### Step-by-step

```bash
# 1. Replace github:URL deps with npm-published versions
sed -i '' 's|"@nexus/plugin-bridge-foundation": "github:.*"|"@nexus-mindgarden/plugin-bridge-foundation": "^0.4.0"|g' \
  package.json packages/*/package.json

sed -i '' 's|"@nexus/plugin-storage-foundation": "github:.*"|"@nexus-mindgarden/plugin-storage-foundation": "^0.4.0"|g' \
  package.json packages/*/package.json

sed -i '' 's|"@nexus/plugin-svelte-foundation": "github:.*"|"@nexus-mindgarden/plugin-svelte-foundation": "^0.4.0"|g' \
  package.json packages/*/package.json

sed -i '' 's|"@nexus/plugin-mcp-foundation": "github:.*"|"@nexus-mindgarden/plugin-mcp-foundation": "^0.4.0"|g' \
  package.json packages/*/package.json

# 2. Source-rename
find packages src -type f \( -name "*.ts" -o -name "*.svelte" -o -name "*.md" \) \
  -exec sed -i '' 's|@nexus/plugin-|@nexus-mindgarden/plugin-|g' {} +

# 3. If you had a vendored Foundation tree, remove it
rm -rf vendor/
# Remove from pnpm-workspace.yaml: any 'vendor/plugin-template/packages/*' line
# Remove from package.json: any "setup:foundation" script
# Delete any setup-foundation.sh or VENDOR-FOUNDATION.md companion files

# 4. Re-resolve + verify
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

### Verification checklist

- [ ] All `import` statements resolve from `@nexus-mindgarden/plugin-*` (no `@nexus/plugin-*` left — `grep -r "@nexus/plugin-" .` should return zero hits in source-files)
- [ ] No vendored-tree references in `pnpm-workspace.yaml`
- [ ] No workaround-scripts (`setup-foundation.sh`, `setup:foundation`) referenced from `package.json`
- [ ] `pnpm install` resolves cleanly (`Done in <Xs>`)
- [ ] All existing tests still green (count should match pre-migration)
- [ ] Bridge boots locally and emits `bridge_listening` log
- [ ] `/handshake` and `/register-host` endpoints emit drift-#206 `host_record_status` block

### Real-world reference (anonymized)

A plugin in the `@nexus-mindgarden` cluster completed Pattern 1 in **22 minutes** (vs 30min estimate). Touched 30 files, removed ~50 files of vendored-tree, `pnpm install` resolved in 2.1s, all 162 plugin-tests stayed green, UI build-size unchanged (95.1 KB gzipped). The migration was bidirectional-safe because the plugin had pre-shipped a `docs/VENDOR-FOUNDATION.md` documenting the reversal-path (see [§12 of PLUGIN-PROVIDER-GUIDE.md](./PLUGIN-PROVIDER-GUIDE.md) for the reversibility pattern).

---

## Pattern 2: Helper-Lib

**Adoption shape:** Foundation is a **selective utility library** — you keep your own bridge HTTP-server (or your host-app embeds the bridge directly), but import specific helpers from Foundation to avoid hand-rolling drift-prone wire-shape code.

**Best for:**
- Multi-issuer bridges where one bridge serves multiple Hosts each with distinct JWT-verifier-configs (current Foundation `HostKeyRecord` assumes single-issuer-per-bridge; v0.5.0 extension may unblock full Pattern-1 adoption for multi-issuer)
- Plugins that need extra fields on their host-record shape (e.g. `lastUsedAt`, `expectedIssuer`/`expectedAudience` per host, custom `relayUrl` semantics)
- Plugins where bridge-startup is host-controlled (you can't call `createBridgeApp()` because the host owns server lifecycle)

### Step-by-step

```bash
# 1. Add Foundation as a regular dep (not bridge-replacement)
pnpm add '@nexus-mindgarden/plugin-bridge-foundation@^0.4.1'

# 2. Import selectively. Wire-shape types from /shapes, runtime helpers from /auth.
```

Inside your bridge-code:

```ts
// Types-only — zero runtime-cost via TS-elision
import type {
  HostRecordStatus,
  RegisterHostRequest,
  PluginManifest,
} from '@nexus-mindgarden/plugin-bridge-foundation/shapes'

// Runtime-helpers — pulled only when you call them
import {
  buildHostRecordStatus,
  fingerprintPublicKey,  // ← only adopt if your fingerprint-format matches Foundation's
} from '@nexus-mindgarden/plugin-bridge-foundation/auth'

// In your /register-host handler:
function handleRegister(req: RegisterHostRequest): YourCustomResponse {
  const yourRecord = persistInYourCustomShape(req)
  const status: HostRecordStatus = buildHostRecordStatus({
    isFirstRegister: !yourRecord.alreadyExisted,
    missingOptionalFields: yourRecord.missingFields,
    pluginCurrentSchema: 1, // your plugin's schema-version
  })
  return { ...yourRecord, host_record_status: status }
}
```

### What you do NOT adopt (helper-lib boundaries)

- `createBridgeApp` — your bridge has its own server-setup
- `HostKeyRegistry` — your host-record-shape has fields Foundation doesn't model
- `HostKeyRepo` interface — your storage-layer is custom
- `verifyBridgeToken` — your JWT-verifier may have per-host issuer/audience-config that Foundation single-issuer-model doesn't capture

### Reversal-path (helper-lib → full-replace)

If Foundation extends `HostKeyRecord` to support your multi-issuer needs (v0.5.0 candidate per kanban/markview consumer-feedback), the migration is:
1. Map your custom host-record-fields to extended Foundation fields
2. Replace your bridge HTTP-server with `createBridgeApp()`
3. Migrate storage-backend to `JsonFileHostKeyRepo` or `SqliteHostKeyRepo` (or implement `HostKeyRepo` for your custom backend)

Track the spec-extension on plugin-template's v0.5.0 milestone.

### Real-world reference (anonymized)

A multi-issuer-bridge plugin in the cluster adopted Pattern 2 to emit drift-#206 `host_record_status` via `buildHostRecordStatus()` while keeping its own multi-Host JWT-verifier-topology. The asymmetry was logged in chatbus and informs the v0.5.0 roadmap. Tests: 461/461 plugin-bridge green after adoption (was 458 → +3 drift-#206 emit-tests).

---

## Pattern 3: In-Repo-Mirror

**Adoption shape:** Foundation is **NOT a dep** — you hand-mirror the small subset of wire-shape code you need (typically ~50-100 LoC of `host_record_status` + helper), keeping zero supply-chain-Surface.

**Best for:**
- Plugins where adding any new npm-dep requires security-review and your team has explicitly chosen zero supply-chain-additions
- Plugins where the wire-shape touched is small enough (~50 LoC) that mirror-maintenance-cost is lower than dependency-management-cost
- Plugins that historically don't use Foundation and adopting now would touch many imports for a small net-gain

### Step-by-step

```bash
# 1. Identify the smallest wire-shape surface you actually need.
#    Common minimal surface: host_record_status (drift #206) — ~30 LoC.

# 2. Create a single file in your plugin mirroring that shape.
#    Convention: src/auth/host-record-status.ts or similar.
```

```ts
// src/auth/host-record-status.ts — hand-mirrored from Foundation 0.4.1 shape.
// Re-sync if Foundation's HostRecordStatus schema evolves.

export const PLUGIN_REGISTRATION_SCHEMA_VERSION = 1 as const

export interface HostRecordStatus {
  schema_version: number
  plugin_current_schema: number
  is_first_register: boolean
  reregister_recommended: boolean
  missing_optional_fields: string[]
  reregister_loop_detected?: boolean // optional, v0.2.3+
}

export function buildHostRecordStatus(opts: {
  isFirstRegister: boolean
  missingOptionalFields: string[]
}): HostRecordStatus {
  return {
    schema_version: PLUGIN_REGISTRATION_SCHEMA_VERSION,
    plugin_current_schema: PLUGIN_REGISTRATION_SCHEMA_VERSION,
    is_first_register: opts.isFirstRegister,
    reregister_recommended: opts.missingOptionalFields.length > 0,
    missing_optional_fields: opts.missingOptionalFields,
  }
}
```

### Drift-immunity for Pattern-3 consumers (recommended): add `/shapes` as devDep

Even if you don't want Foundation as a runtime-dep, you can add it as a **devDep** to get drift-immunity types:

```bash
pnpm add -D '@nexus-mindgarden/plugin-bridge-foundation@^0.4.1'
```

```ts
// src/auth/host-record-status.ts (now with drift-immunity)
import type { HostRecordStatus as FoundationShape } from '@nexus-mindgarden/plugin-bridge-foundation/shapes'

// Compile-time assertion: your mirror is shape-compatible
const _typeCheck: HostRecordStatus = {} as FoundationShape
const _reverseCheck: FoundationShape = {} as HostRecordStatus

// Your runtime types stay yours; the import type is TS-elided at build,
// so zero bundled-bytes added.
```

If Foundation's shape evolves and yours doesn't, the typecheck breaks — you find the drift at build-time instead of at the next interop-test.

### Trade-offs (explicitly logged)

| Trade-off | Implication |
|---|---|
| ➕ Zero supply-chain-Surface in production-build | No npm-resolve against `@nexus-mindgarden` at runtime |
| ➕ Pinned shape | No surprise Foundation-upgrade-wave breaks your wire |
| ➖ Drift-risk | If Foundation adds new fields to `HostRecordStatus`, your mirror won't know |
| ➖ Mirror-sync-cadence | You must periodically re-sync (recommendation: at minor-version-bumps of Foundation, e.g. 0.4.x → 0.5.x) |

### When to migrate Pattern-3 → Pattern-2 or -1

- If Foundation surface you mirror grows past ~150 LoC (mirror-maintenance > dep-adoption)
- If you start using more than one Foundation helper (e.g. you needed `host_record_status` AND now want `fingerprintPublicKey` AND `verifyBridgeToken`)
- If Foundation ships a feature you can't easily mirror (e.g. `HostKeyRegistry.detectReregisterLoop()` ringbuffer-trace logic)

### Real-world reference (anonymized)

A plugin in the cluster adopted Pattern 3 with a 56-LoC `host-record-status.ts` mirror. Trade-off was logged in chatbus: zero supply-chain-Surface + pinned-shape worth the drift-risk for their security-posture. They are tracked as future-Pattern-1-candidate if Foundation surface they need grows.

---

## Cross-Pattern Considerations

### Drift-discipline maintained across all three patterns

All three patterns preserve drift-discipline if you follow the per-pattern recommendations:
- Pattern 1: drift-discipline by Foundation's source-of-truth ownership
- Pattern 2: drift-discipline by `import type` from `/shapes` + Foundation's runtime-helpers
- Pattern 3: drift-discipline by devDep `import type` from `/shapes` (compile-time check) + scheduled mirror-resync

### Foundation-version-pin recommendations

| Pattern | Recommended version-pin |
|---|---|
| 1 (Full-Replace) | `^0.4.0` — accept patches automatically |
| 2 (Helper-Lib) | `^0.4.0` — accept patches automatically |
| 3 (In-Repo-Mirror, no devDep) | n/a — Foundation not in deps |
| 3 (In-Repo-Mirror + devDep for `/shapes` typecheck) | `^0.4.1` — needs `/shapes` subpath |

### Reporting back

If you complete a migration, post a chatbus message in thread `#contracts` describing:
- Which pattern adopted + why (rationale-paragraph)
- Migration ETA actual vs estimate
- Test-count before/after
- Any Foundation-spec extension request your plugin surfaced

This feeds the [PLUGIN-PROVIDER-GUIDE.md §12 reversible-workarounds pattern](./PLUGIN-PROVIDER-GUIDE.md#section-12) and informs Foundation's next-version roadmap.

---

## Appendix: Migration troubleshooting

### `pnpm install` fails with `ERR_PNPM_NO_MATCHING_VERSION`

You may be pinning to a version that doesn't exist yet. Check the [npm registry](https://www.npmjs.com/package/@nexus-mindgarden/plugin-bridge-foundation) for the latest published version.

### Imports resolve but TypeScript can't find types

Ensure your `tsconfig.json` has `"moduleResolution": "bundler"` or `"node16"`/`"nodenext"`. The `exports`-field with subpaths requires modern moduleResolution.

### Bridge boots but `/register-host` no longer emits `host_record_status`

You may have a stale handler that pre-dates v0.2.0. Verify your `/register-host` endpoint calls `buildHostRecordStatus()` (Pattern 1+2) or manually constructs the always-present block (Pattern 3).

### Vendored-tree leftover causes `Cannot find module`

If you migrated from a vendored-Foundation setup, ensure:
1. `vendor/` directory is deleted (not just gitignored)
2. `pnpm-workspace.yaml` no longer has `vendor/...` lines
3. `.gitignore` doesn't shadow real source-paths (a bare `build/` rule previously broke `plugin-svelte-foundation/src/build/` — fixed in v0.3.2 but watch for analogous patterns in your own repo)
