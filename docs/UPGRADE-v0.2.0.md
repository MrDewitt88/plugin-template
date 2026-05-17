# Upgrade Guide: plug-tmpl v0.1.x → v0.2.0

> Comprehensive upgrade guide für Plugin-Provider-CCs die `@nexus/plugin-bridge-foundation` (oder `@nexus/plugin-storage-foundation`) konsumieren. v0.2.0 schließt 7 Lücken die in v0.1.x als Hand-Roll pro Plugin gelandet wären.

**Status:** released 2026-05-17 · main commit pending · git tag `v0.2.0`
**Consumer-Pfad:** `pnpm add github:MrDewitt88/plugin-template#v0.2.0`
**Breaking-Changes:** keine (v0.1.x → v0.2.0 ist additive only).

---

## TL;DR — was ist neu

| # | Feature | Subpath | Adoption-Cost |
|---|---|---|---|
| 1 | **Observability primitives** (JSON-Lines logger + Prometheus `/metrics` + HTTP-request-middleware) | `@nexus/plugin-bridge-foundation/observability` | Opt-in via `BridgeAppOptions.observability` |
| 2 | **Static UI serving helper** (path-traversal-safe `/static/ui/*` mit immutable cache) | `@nexus/plugin-bridge-foundation` (root) | Opt-in via `BridgeAppOptions.staticUi` |
| 3 | **Drift #203 manifest-validation** — `validateManifest()` flagged `localhost:*` in `service_endpoint` (warn-default, strict-opt) | `@nexus/plugin-bridge-foundation/manifest` | Default-on (warn-mode). Strict via `{drift203: 'strict'}` |
| 4 | **Storage-Foundation `StorageError` + `toCanonicalError()`** — Drift #103 wire-shape für storage-errors | `@nexus/plugin-storage-foundation` | Drop-in `throw` replacement |
| 5 | **`relay_url` in BASELINE_OPTIONAL_REGISTER_FIELDS** — markview Pfad-C-Collab + plug-elec reverse-call | `@nexus/plugin-bridge-foundation` | Transparent — register-host accepts `relay_url?` |
| 6 | **Test-Utilities** (`buildTestRegistry()` + `mintTestBridgeToken()`) | `@nexus/plugin-bridge-foundation/testing` | Drop-in replacement for hand-rolled setup-helpers |
| 7 | **invoke-hook Drift #103 parity** — `details?` jetzt im error-shape, parity mit execute-tool | `@nexus/plugin-bridge-foundation` | Transparent für Konsumenten die schon `details` in tool-handlers wollten |

**Validation:** `pnpm -r typecheck` 5/5 clean · `pnpm -r test` **206/206 grün** (bridge 77 · svelte 30 · mcp 33 · storage 31 · create-plugin tool 35).

---

## Migration für betroffene Plugin-Provider

### plug-elec (ET-Mind) — hand-rolled logger.ts + metrics.ts

**Vorher** (`packages/etmind-bridge/src/{logger,metrics}.ts`, msg #240):
```ts
// own implementation, ~200 LoC
import { log } from './logger'
log.info('manifest loaded', { plugin_id, version })
```

**Nach v0.2.0:**
```ts
import { Logger, MetricsRegistry } from '@nexus/plugin-bridge-foundation/observability'

const logger = new Logger({ service: 'etmind-bridge' })
const metrics = new MetricsRegistry()

const app = createBridgeApp({
  manifest, registry, toolHandlers,
  observability: { logger, registry: metrics },
})
```

Foundation wired automatisch:
- HTTP-request counter `plugin_bridge_http_requests_total{method,path,status}`
- Uptime gauge `plugin_bridge_uptime_seconds`
- Registry-size gauge `plugin_bridge_host_registry_size`
- `/metrics` endpoint (unauth, top-level)
- Per-request access-logs via logger

Custom-Metrics zusätzlich registrierbar:
```ts
import { Counter } from '@nexus/plugin-bridge-foundation/observability'
const cableCalcs = metrics.register(
  new Counter('etmind_cable_calculations_total', 'Cable-calc invocations', ['result'])
)
cableCalcs.inc({ result: 'success' })
```

**Migration-Aufwand:** ~20min. Spart die 200 LoC + Wartung.

### plug-db (UnifiedDBV5) — Python, kein direct migration

plug-db ist FastAPI/Python — Foundation ist TS-only. Aber:
- Pattern-Cross-Reference: Foundation's logger.ts ↔ plug-db's structlog-Setup (cross-language consistency dokumentiert in CHANGELOG)
- Foundation's `StorageError.toCanonical()` ↔ plug-db's `_canonical_error()`-Pattern (gleicher Drift #103 contract)

**Action:** keine. Aber wenn plug-db später TS-Side-Subservice braucht, Foundation v0.2.0 ist der canonical Pfad.

### oracle (plug-ea) — atomic-replace recommendation

**Vorher** (`@eamind/bridge` hand-roll, msg #246, ~300 LoC):
```ts
// server.ts + manifest-loader.ts + host-registry.ts hand-rolled
```

**Nach v0.2.0:**
```ts
import {
  createBridgeApp,
  HostKeyRegistry,
  JsonFileHostKeyRepo,
  loadManifest,
} from '@nexus/plugin-bridge-foundation'
import { Logger, MetricsRegistry } from '@nexus/plugin-bridge-foundation/observability'

const manifest = await loadManifest('./manifest.yaml', { drift203: 'strict' })
const repo = new JsonFileHostKeyRepo({ path: './data/host-keys.json' })
const registry = new HostKeyRegistry(repo, {
  autoAccept: process.env.NODE_ENV === 'development',
  optionalRegisterFields: ['host_version', 'relay_url', 'host_metadata'],
})

const app = createBridgeApp({
  manifest,
  registry,
  toolHandlers: { 'customer.create': customerCreateHandler, /* ... */ },
  renderUi: async (routePath, ctx) => { /* ... */ },
  observability: {
    logger: new Logger({ service: 'eamind-bridge' }),
    registry: new MetricsRegistry(),
  },
  staticUi: { staticDir: './dist/ui' },
})
```

**Migration-Aufwand:** ~1h. Drift #103, #200, #203, #206 + Persistence + Observability + Static-UI alle auf einen Schlag.

### markview — Pfad-C-Collab `relay_url` propagation

Markview's `relay_url` (msg #237) ist jetzt im baseline. Wenn euer Host-Side bridge `relay_url` schon in register-host body sendet, ist nichts zu tun — `host_record_status` wird das jetzt korrekt als provided erkennen.

**Wenn ihr Foundation adoptiert** (msg #281 vor Backlog):
```ts
import {
  createBridgeApp,
  HostKeyRegistry,
  JsonFileHostKeyRepo,
} from '@nexus/plugin-bridge-foundation'

const registry = new HostKeyRegistry(new JsonFileHostKeyRepo({ path: '...' }), {
  optionalRegisterFields: ['host_version', 'relay_url', 'channel_id'], // erweiterbar
})
```

### plug-design (Design-Mind) — Library-only, nicht betroffen

Mode-A Library, kein Plugin-Bridge. Drift-Conventions nicht relevant (DM #264).

### v8-corp, v8-fam, kanban, kiara, agent — keine Plugin-Bridge

Nicht betroffen. v8-corp/v8-fam sind Host-Side; sie sehen Foundation-Wire-Shapes als Konsument, müssen aber keinen Foundation-Code adoptieren.

---

## Detailed API-Surface

### `@nexus/plugin-bridge-foundation/observability`

```ts
// Logger — JSON-Lines structured, 4 levels
const log = new Logger({
  service: 'my-plugin-bridge',
  level: 'info',           // optional, default 'info'
  format: 'json',          // optional, default 'json' (override via env BRIDGE_LOG_FORMAT=text)
  context: { region: 'eu' }, // bound context, merged in every call
})
log.info('msg', { key: 'value' })
log.warn('warn-to-stderr', { error_code: 'X' })
log.error('error-to-stderr')

// child logger with bound context
const requestLog = log.child({ request_id: 'r-1' })
requestLog.info('processing') // includes request_id

// MetricsRegistry — Prometheus exposition-format 0.0.4
const registry = new MetricsRegistry()
const counter = registry.register(
  new Counter('http_requests_total', 'help text', ['method', 'status'])
)
counter.inc({ method: 'GET', status: '200' })

const gauge = registry.register(
  new Gauge('uptime_seconds', 'help', [], () => process.uptime())
)

registry.collect() // → Prometheus text-exposition
```

### `@nexus/plugin-bridge-foundation` — staticUiHandler

```ts
import { createBridgeApp } from '@nexus/plugin-bridge-foundation'

const app = createBridgeApp({
  manifest, registry, toolHandlers,
  staticUi: {
    staticDir: './dist/ui',         // absolute or cwd-relative
    urlPrefix: '/static/ui',         // optional, default '/static/ui'
    cacheControl: 'public, max-age=31536000, immutable', // optional default
  },
})
```

**Path-Traversal-safety:** alle requested paths werden against `staticDir` canonicalized; `..`-Segmente die out-of-root entkommen würden → 403.

**Content-Types:** `.js`/`.mjs`/`.css`/`.html`/`.svg`/`.ico`/`.png`/`.jpg`/`.gif`/`.webp`/`.json`/`.map`/`.woff(2)?`/`.ttf`/`.otf` → spezifischer content-type. Sonst `application/octet-stream`.

### `@nexus/plugin-bridge-foundation/manifest` — Drift #203 enforcement

```ts
import { loadManifest } from '@nexus/plugin-bridge-foundation/manifest'

// default: warn-mode — emits stderr warning, accepts manifest
const manifest = await loadManifest('./manifest.yaml')

// strict mode — throws ManifestError code='drift_203'
const manifest = await loadManifest('./manifest.yaml', { drift203: 'strict' })

// off mode — bypass check (e.g. for legacy manifests during migration)
const manifest = await loadManifest('./manifest.yaml', { drift203: 'off' })

// override warn-sink (for tests)
const warnings: string[] = []
const manifest = validateManifest(yaml, { warn: (m) => warnings.push(m) })
```

### `@nexus/plugin-storage-foundation` — StorageError

```ts
import { StorageError, toCanonicalError } from '@nexus/plugin-storage-foundation'

// In your tool-handler:
const documentsCreate: ToolHandler = async (args, ctx) => {
  const existing = await db.get(args.id)
  if (existing) {
    throw new StorageError('conflict', 'document id already exists', { id: args.id })
  }
  // ...
}

// Foundation's execute-tool handler propagates the canonical shape automatically
// because StorageError has {code, message, details?} structure.

// Or wrap arbitrary throwables for explicit canonicalization:
try {
  await db.exec(...)
} catch (err) {
  const canonical = toCanonicalError(err) // {code, message, details?}
  throw canonical
}
```

### `@nexus/plugin-bridge-foundation/testing` — Test-Utilities

```ts
import { buildTestRegistry, mintTestBridgeToken } from '@nexus/plugin-bridge-foundation/testing'

// One-shot setup für E2E-Tests
const { registry, mintToken } = await buildTestRegistry({ hostId: 'teammind' })

const token = await mintToken({
  pluginId: 'my-plugin',
  tenantId: '00000000-0000-0000-0000-000000000001',
  userId: '00000000-0000-0000-0000-000000000002',
  scopes: ['mcp.read.documents'],
})

const res = await app.request('/plugin-bridge/v1/handshake', {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
  body: JSON.stringify({ plugin_id: 'my-plugin', host_id: 'teammind', ... }),
})

// For custom claims (custom iss, jti, expiry):
import { mintTestBridgeToken } from '@nexus/plugin-bridge-foundation/testing'
const { privateKey, registry } = await buildTestRegistry()
const customToken = await mintTestBridgeToken(privateKey, {
  pluginId: 'p1',
  hostId: 'teammind',
  tenantId: '...', userId: '...',
  iss: 'custom-issuer',
  jti: 'fixed-jti-for-deterministic-test',
  expiresIn: '5m',
})
```

### `relay_url` baseline (v0.2.0)

```ts
// register-host now accepts relay_url as optional WSS/WS URL
POST /plugin-bridge/v1/register-host
{
  "host_id": "markview",
  "public_key_pem": "...",
  "host_version": "0.1.3",
  "relay_url": "ws://127.0.0.1:3300/relay"   // ← NEW
}

// Response includes host_record_status with relay_url tracked in missing_optional_fields:
{
  "host_id": "markview",
  "status": "active",
  "fingerprint": "...",
  "registered_at": "...",
  "host_record_status": {
    "schema_version": 1,
    "plugin_current_schema": 1,
    "is_first_register": true,
    "reregister_recommended": false,
    "missing_optional_fields": []
  }
}
```

Wenn ein Host `relay_url` NICHT sendet, landed das in `missing_optional_fields: ["relay_url"]` und `reregister_recommended: true` — Host triggert re-register mit dem Feld.

### invoke-hook Drift #103 parity (v0.2.0)

`InvokeHookResponse.error.details?` ist jetzt im Schema (war vorher nur in execute-tool). Plugin-Provider können `details` in thrown errors mitgeben:

```ts
const hookHandler: HookHandler = async (payload, ctx) => {
  if (!validate(payload)) {
    throw {
      code: 'validation_failed',
      message: 'payload schema mismatch',
      details: { field: 'document_id', expected: 'uuid' }, // ← jetzt unterstützt
    }
  }
  // ...
}
```

---

## CHANGELOG-Reference

Vollständige Release-Notes: [`CHANGELOG.md`](../CHANGELOG.md) §[0.2.0].

## Cross-Repo Provenance

Die 7 Lücken kamen aus heutigem chatbus-Cross-Repo-Traffic:

| Gap | Source | Reference |
|---|---|---|
| #1 Observability | plug-elec OBS1/OBS2 + plug-db OBS1/OBS2 | msg #221, #240 |
| #2 Static UI | oracle Q5 render-ui-Thread | msg #259 |
| #3 Drift #203 | plug-elec Drift-Katalog | msg #216 |
| #4 Storage Drift #103 | plug-design DM #261 §3 | msg #261 |
| #5 relay_url | markview Pfad-C-Collab + plug-elec reverse_call_url | msg #237, #242 |
| #6 Test-Utilities | hand-rolled in jeder Foundation-Test-Suite + oracle eamind-bridge tests | msg #246 |
| #7 invoke-hook parity | Audit-Befund während v0.2.0 hardening | self |

Alle 7 sind etablierte Cross-Repo-Patterns die bereits in 2+ Plugin-Bridges implementiert wurden. v0.2.0 hebt sie auf Foundation-Level.

## Fragen / Bugs / Edge-Cases

Ping `plug-tmpl` direkt via chatbus DM. v0.2.1 für hotfixes innerhalb 1-2h möglich.
