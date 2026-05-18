# Plugin-Provider-Guide

> Für Plugin-Provider die ein neues Plugin gegen TeamMind/Nexus Plugin-Bridge-Protocol bauen. Ende-zu-Ende von clone bis cross-repo-live-smoke.

**Audience:** Engineering-Teams oder solo-Devs die Plugin-Provider werden wollen. Plus AI-CC-Workforce (siehe `CLAUDE-TEMPLATE.md`).

---

## 1. Voraussetzungen

- Node.js 20+ + pnpm 10+ (siehe `package.json` engines)
- Git + GitHub-Account
- Optional: TypeScript 5.6+ kennen (Foundation ist strict-TS)

---

## 2. Quick-Start (manueller Setup)

> L7 `@nexus/create-plugin` CLI macht das Bootstrap automatic. Bis das landed: manueller Pfad.

```sh
# 1. Clone Plugin-Template
git clone https://github.com/MrDewitt88/plugin-template.git my-plugin
cd my-plugin
rm -rf .git
git init -b main

# 2. Customize root package.json
# - name: "my-plugin"
# - description, license, repository

# 3. Install dependencies
pnpm install

# 4. Workspace-wide Tests grün?
pnpm -r test

# 5. Erstelle dein erstes Package
mkdir -p packages/my-plugin-bridge/src
# (siehe Layer-3-Walkthrough unten)
```

---

## 3. Component-Stack-Decision

**Welche Foundation-Packages brauche ich?**

| Foundation | Brauche ich es wenn... |
|---|---|
| `@nexus/plugin-bridge-foundation` | **Pflicht** — Plugin hat HTTP-Endpoint für Host-Communication |
| `@nexus/plugin-storage-foundation` | Plugin persistiert Daten (SQLite-backed) |
| `@nexus/plugin-svelte-foundation` | Plugin hat UI-Components die in Hosts gemounted werden |
| `@nexus/plugin-mcp-foundation` | Plugin exposiert MCP-Tools (fast jeder Plugin) |

**Zero-UI-Plugin** (z.B. nur Hooks für `notes.versioning.on_save`): bridge + mcp reicht.

**Full-Featured-Plugin** (z.B. KANBAN): alle vier.

---

## 4. Plugin-Manifest-Authoring

Manifest ist Wire-Vertrag — Hosts laden + validieren beim Activate.

### 4.1 Minimal-Manifest

```yaml
id: my-plugin
name:
  de: Mein Plugin
  en: My Plugin
description:
  de: Mein erstes Plugin
  en: My first plugin
version: 0.1.0
distribution:
  type: external-service
  # Drift #203 — IMMER 127.0.0.1, NIE localhost. Browser-CSP behandelt beide
  # als unterschiedliche Origins; Hosts allowlisten nur 127.0.0.1:*.
  service_endpoint: http://127.0.0.1:3600
compatibility:
  apps: [teammind, theseus]
  min_app_version: 0.5.0
provides:
  routes: []
  mcp_tools: []
  module_extensions: []
  scopes_required: []
```

### 4.2 Mit MCP-Tools (Extended Form)

```yaml
provides:
  mcp_tools:
    # Drift #200 — Tool-Namen sind im Manifest IMMER bare `<module>.<verb>`.
    # NIEMALS `<plugin-id>.<module>.<verb>` (kein `my-plugin.documents.list`).
    # Der Host synthesiziert den `<plugin-id>.`-Prefix automatisch beim
    # Registrieren ins Kiara-MCP-Surface. Manuelles Prefixing erzeugt
    # Doppel-Prefix (`my-plugin.my-plugin.documents.list`) — bricht Tool-Lookup.

    # Phase-1 string-form (backward-compat):
    - documents.list

    # Phase-3 Extended Form — empfohlen für neue Tools:
    - name: documents.create
      description: |
        Create a new document with title and content. Returns the
        created document with its UUID.
      input_schema:
        type: object
        required: [title]
        properties:
          title: { type: string, minLength: 1 }
          content: { type: string }
      output_schema:
        type: object
        required: [id, title]
        properties:
          id: { type: string, format: uuid }
          title: { type: string }
      scopes_required: [mcp.write.documents]
  scopes_required:
    - mcp.read.documents     # plugin-wide floor
```

### 4.3 Mit Module-Extensions (Plugin = Storage-Provider)

```yaml
provides:
  module_extensions:
    - module: notes
      capability: versioning
      hook_endpoints:
        on_save: /hooks/notes/on-save
    - module: memory
      capability: versioning
      hook_endpoints:
        on_save: /hooks/memory/on-save
```

Host (V8/Theseus) fired `notes.versioning.on_save` an dein Plugin wenn User notes saved.

### 4.4 Mit UI

```yaml
provides:
  routes:
    - path: /my-view
      component_type: web-component
      service_endpoint: /ui/my-component
ui:
  sidebar_entry:
    icon: fileText
    label_key: plugin_my_plugin_sidebar
    sort_order: 100
```

`label_key` ist Phase-1 unused — Hosts nutzen `manifest.name` für display. Phase-2 könnten Hosts den key gegen ihre i18n-resolution lookupen.

### 4.5 host_record_status — Drift #206 Schema-Drift-Signaling

Plugin-Bridge-Protocol erweitert `register-host`-Body additiv (z.B. neue optional fields wie `host_version`, `relay_url`, `host_metadata`). Hosts die pre-Field-Addition registriert haben bleiben sonst dauerhaft stale.

**Lösung:** Plugin-Bridge returnt einen symmetric `host_record_status`-Block — in `register-host`-Response UND in `handshake`-Response, IMMER present (auch first-register, auch wenn Record current ist).

```json
{
  "host_id": "teammind",
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

**Host-Logic:**
- Wenn `reregister_recommended=true` → Host ruft `register-host` erneut auf mit den fehlenden Feldern (idempotent durch Drift #12).
- Wenn `missing_optional_fields` leer und `schema_version` matched → Host ist current.
- `is_first_register` lässt Host wissen ob das die Bootstrap-Registrierung war (vs idempotenter Replay).

**Foundation-Default:** `@nexus/plugin-bridge-foundation` v0.1.0+ baked das automatisch ein. Baseline-Optional-Fields = `['host_version']`. Plugin-Provider erweitern via:

```ts
const registry = new HostKeyRegistry(repo, {
  optionalRegisterFields: ['host_version', 'relay_url', 'host_metadata'],
})
```

**Cross-Repo-Source:** Pattern etabliert von plug-elec (`etmind-bridge`), adoptiert von oracle/plug-ea (`eamind-bridge`) + V8 + Theseus. Foundation v0.1.0 baked das Standard-Pattern für alle künftigen Plugin-Provider.

---

## 5. Layer-3-Walkthrough — erste Bridge

```ts
// packages/my-plugin-bridge/src/server.ts
import {
  createBridgeApp,
  HostKeyRegistry,
  InMemoryHostKeyRepo,
  loadManifest,
  type ToolHandler,
} from '@nexus/plugin-bridge-foundation'
import { serve } from '@hono/node-server'
import { resolve } from 'node:path'

const manifest = await loadManifest(resolve('./manifest.yaml'))

const registry = new HostKeyRegistry(new InMemoryHostKeyRepo(), {
  autoAccept: process.env.NODE_ENV === 'development',
})

// Bootstrap V8s public-key wenn vorhanden
if (process.env.V8_PUBLIC_KEY_PEM) {
  await registry.register({
    host_id: 'teammind',
    public_key_pem: process.env.V8_PUBLIC_KEY_PEM,
  })
  await registry.approve('teammind')
}

const documentsList: ToolHandler = async (args, ctx) => {
  // ctx.hostId, ctx.tenantId, ctx.userId, ctx.scopes, ctx.actorClass
  return { documents: [], total: 0 }
}

const documentsCreate: ToolHandler = async (args, ctx) => {
  const { title } = args as { title?: string }
  if (!title) throw { code: 'invalid_args', message: 'title required' }
  // ... persist via @nexus/plugin-storage-foundation ...
  return { id: 'new-uuid', title }
}

const app = createBridgeApp({
  manifest,
  registry,
  toolHandlers: {
    'documents.list': documentsList,
    'documents.create': documentsCreate,
  },
})

serve({ fetch: app.fetch, port: 3600 })
console.log('Plugin-Bridge live on :3600')
```

---

## 5.5 render-ui Wire-Spec (canonical aus V8-Side, Reference-Implementations)

`POST /plugin-bridge/v1/render-ui` ist der Endpoint über den Hosts (V8/Theseus/MarkView/etc.) Plugin-UI per Route-Pfad anfordern. Foundation `RenderUiRequestSchema` + `RenderUiResponseSchema` matchen canonical wire-shape aus V8 ([`docs/PLUGIN-BRIDGE-PROTOCOL.md`](https://github.com/MrDewitt88/TeamMindV8/blob/main/docs/PLUGIN-BRIDGE-PROTOCOL.md) §POST /plugin-bridge/v1/render-ui).

### 5.5.1 Request-Body

```json
{
  "route_path": "/dokumente/edit/abc-123",
  "tenant_id": "<uuid>",
  "user_id": "<uuid>",
  "context": { "<arbitrary>": "<json>" }
}
```

- **`route_path`** muss mit `/` starten (Zod-validated in Foundation)
- **`bridge_token`** ist NICHT im Body — kommt im `Authorization: Bearer <jwt>` Header (Ed25519 V8-signed, JWT-claims tragen plugin_id/tenant_id/user_id/scopes)
- **`theme` / `locale`** sind aktuell NICHT canonical im Request. Wenn Plugin theme-aware rendert: aus `context` lesen oder via Custom-Element-Attribut (Drift #7 long-form)
- **`X-Request-Id`** Header (optional) — Foundation v0.2.2+ propagiert + echoed automatisch in Response. Distributed-Tracing-Primitive.

### 5.5.2 Response-Shape

```json
{
  "html": "<plugin-myplugin-foo></plugin-myplugin-foo>",
  "scripts": ["/static/ui/bundle-abc.js"],
  "styles": ["/static/ui/styles-abc.css"]
}
```

Relative Script/Style-URLs werden Host-Side gegen `service_endpoint` aufgelöst (V8 PR 26 — `/static/ui/bundle.js` → `http://127.0.0.1:3600/static/ui/bundle.js`).

### 5.5.3 Reference-Implementations

| Side | Role | File |
|---|---|---|
| **V8 Frontend-Render** | catch-all mounts plugin route + lazy-load ESM scripts | `apps/host/src/routes/(app)/plugins/[plugin_id]/[...path]/+page.svelte` |
| **V8 Bridge-Client (server-side caller)** | `bridgeRenderUi` | `packages/plugins/src/server/bridge-client.ts:401-426` |
| **MarkView Producer** | `routeBundles`-Pattern | `apps/markview-plugin/src/server/render-ui.ts` |
| **ET-Mind Producer** | 5 Custom-Elements aus M3 (post-`23d8408`) | `packages/etmind-bridge/src/server.ts` |
| **EA-Mind Producer** | 3 Custom-Elements `<plugin-eamind-{overview,kunden,angebot}>` | `@eamind/bridge/src/server.ts` |

**Foundation-implementation:** wenn du `createBridgeApp({renderUi: handler})` passt + dein `handler` returnt `{html, scripts, styles}`, ist die Wire-Shape automatisch canonical. Plus `staticUiHandler` (v0.2.0+) für die `scripts:`-URLs path-traversal-safe.

### 5.5.4 Drift-Catalog (Cross-Repo Status)

- **V8 ↔ Theseus render-ui**: keine bekannten Wire-Mismatches (msg #335)
- **Drift #103** canonical error-shape `{error:{code,message,details?}}` für 4xx/5xx gilt
- **Pfad-C-Collab `collab`-Block** (markview Pattern): wenn Host mit `relay_url` registriert, render-ui darf optional `collab`-Block emittieren (`relay_url + channel_id + snapshot_endpoint`). Aktuell crosstask-BACKLOG bei V8, Foundation noch nicht baked-in (geplant für v0.3.0+ wenn V8 canonical adoptiert)

---

## 6. Layer-4-Walkthrough — UI-Component (Svelte 5)

```svelte
<!-- packages/my-plugin-svelte/src/components/MyView.svelte -->
<script lang="ts">
  import {
    bridgeAttrPropsMapping,
    dispatchAskKiara,
    trimToMaxBytes,
    type BridgeAttrs,
  } from '@nexus/plugin-svelte-foundation'

  // Drift #7 mitigation: long-form props mit explicit attribute-mapping
  let { bridgeToken, bridgeEndpoint, hostId, tenantId, userId, theme,
        documentId } = $props()

  let host: HTMLElement
  let content = $state('')

  async function loadDocument() {
    const r = await fetch(`${bridgeEndpoint}/plugin-bridge/v1/execute-tool`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${bridgeToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tool_name: 'documents.list',
        arguments: { id: documentId },
        actor_class: 'user',
        tenant_id: tenantId,
        user_id: userId,
      }),
    })
    const result = await r.json()
    if (result.ok) content = result.result.content
  }

  function askKiara() {
    const trimmed = trimToMaxBytes(content)
    dispatchAskKiara(host, {
      context: 'document-detail',
      document_id: documentId,
      full_content: trimmed.text,
      full_content_truncated: trimmed.truncated,
      capabilities: ['markdown'],
    })
  }

  $effect(() => { void loadDocument() })
</script>

<svelte:options
  customElement={{
    tag: 'plugin-my-plugin-view',
    shadow: 'open',
    props: {
      ...bridgeAttrPropsMapping(),
      documentId: { attribute: 'document-id' },
    },
  }}
/>

<div bind:this={host}>
  <button onclick={askKiara}>Frag Kiara</button>
  <pre>{content}</pre>
</div>

<style>
  /* Theme-Tokens via @nexus/plugin-svelte-foundation/theme generated */
  /* see packages/my-plugin-svelte/build.mjs */
</style>
```

### 6.1 Build-Pipeline

```ts
// packages/my-plugin-svelte/build.mjs
import esbuild from 'esbuild'
import sveltePlugin from 'esbuild-svelte'
import {
  buildThemeCss,
  pluginBundleConfig,
  nodeBuiltinsStubPlugin,
} from '@nexus/plugin-svelte-foundation/build'

const themeBlock = buildThemeCss('mp')  // mp = my-plugin prefix

await esbuild.build({
  ...pluginBundleConfig({
    componentTag: 'plugin-my-plugin-view',
    entry: 'src/components/MyView.svelte',
    outdir: 'dist/ui',
  }),
  plugins: [sveltePlugin({ /* svelte options */ }), nodeBuiltinsStubPlugin()],
})
```

---

## 7. Cross-Repo-Coordination

Plugin-Provider arbeitet typischerweise mit 1-3 Hosts (V8 + Theseus + FamilyMind). Coordination passiert via:

### 7.1 shared.md (Cross-CC Notes)

Plugin-Provider-CC reads shared notes von V8/Theseus/MarkView/etc. Pattern:

```sh
# Pfad
cat "$HOME/Library/Application Support/TeamMindTerminal/shared.md"
```

Entries werden chronologisch appended. Cross-Repo-Drifts werden hier bemerkt + gefixt.

### 7.2 Kanban-CLI (Cross-Repo Tasks)

```sh
export TM_KANBAN_ACTOR="my-plugin-cc"

# Was wartet auf mich?
kanban list --assignee=$TM_KANBAN_ACTOR --status=todo

# Cross-Repo-Anforderung an V8:
kanban create "Manifest-Refresh-Endpoint" --repo=TeamMindV8 --assignee=teammindv8-cc --priority=2

# Status-Update:
kanban comment t_abc123 "Bridge-fix landed in commit X"
```

### 7.3 Drift-Handling

Wenn Cross-Repo-Drift discovered (z.B. wire-format-mismatch):
1. Document in plugin's `docs/CROSS-REPO-LESSONS.md` (range #100+)
2. Broadcast via shared.md mit cross-ref auf canonical V8 numbering
3. Bei wider-impact: V8-CC kanban-task für canonical-numbering re-sync

---

## 8. Plugin-Branding & Favicon

**Pflicht für alle Plugins.** Plugin-Service MUSS bei `GET /favicon.ico` auf seinem `distribution.service_endpoint` antworten:

| Anforderung | Wert |
|---|---|
| HTTP-Status | 200 |
| Content-Type | `image/x-icon`, `image/png`, oder `image/svg+xml` |
| Auth | **KEINE** — Host's `<img>`-Tag kann keinen Bearer-Header mitschicken |
| Dimensionen | ≥ 32×32, quadratisch |
| Cascade | Bevorzugt zusätzlich `/favicon.png` + `/apple-touch-icon.png` als Fallbacks (Web-Standard) |

### 8.1 Warum

Hosts (Theseus, V8, TeamMind, FamilyMind, künftige) zeigen das Asset in:
- **Sidebar-Launcher-Button** (≈20×20, border-radius 4px, `object-fit: contain`)
- **Plugin-Banner-Header** über dem gemounteten Plugin-UI (≈24×24)

Falls der Endpoint fehlt oder fehlschlägt (401/403/404/network-error/wrong-content-type/decode-error), fallen Hosts auf die Initiale des Plugin-Display-Names zurück (z.B. "M" für MarkView, "K" für Kanban). Das ist ein UX-Downgrade — **ship the favicon**.

### 8.2 Implementation-Hint

Plugin-Bridges die bereits `/static/<bundle>.js` über einen `staticHandler` servieren können denselben Pattern nutzen. Zwei Optionen:

```ts
// Option A: eigener Endpoint
app.get('/favicon.ico', (req, res) => {
  res.type('image/x-icon').sendFile(path.join(__dirname, 'assets/favicon.ico'))
})

// Option B: unter /static/favicon.ico (falls staticHandler-Root passt)
// keine Code-Änderung nötig, nur File ablegen
```

### 8.3 Verifikation

```sh
curl -sI http://<endpoint>/favicon.ico | head -1
# erwartet: HTTP/1.1 200  (oder HTTP/2 200)

curl -sI http://<endpoint>/favicon.ico | grep -i content-type
# erwartet: image/x-icon  |  image/png  |  image/svg+xml
```

Dann in Theseus: Plugin Disable+Enable → Sidebar + Banner sollten das echte Icon zeigen.

### 8.4 Cross-Repo-Source

Convention etabliert von Theseus-CC 2026-05-11 (shared.md 17632) nach User-Direktive. MarkView + Kanban + alle Plugin-Provider commit-pflicht ab nächstem Deploy. Plugin-Template-Skeleton-Default kommt mit (siehe `templates/<starter>/assets/favicon.ico`).

---

## 9. Pre-Drift-Checklist

Vor 1st-Release:

- [ ] All Foundation-Packages installed + workspace tests passing
- [ ] manifest.yaml validates (Foundation `loadManifest` parses ohne error)
- [ ] All MCP-Tools have input_schema + output_schema (Phase-3 Extended Form)
- [ ] All UI-Components long-form customElement mit explicit attribute-mapping (Drift #7)
- [ ] esbuild-bundle: external=[] + nodeBuiltinsStubPlugin (Drift #13/#20+#21)
- [ ] CSP-allowed-origins documented für deployment
- [ ] manifest_hash in /health-Response (Live-Re-Registration support)
- [ ] **`/favicon.ico` Endpoint serviert ≥ 32×32 PNG/ICO/SVG (siehe §8)**
- [ ] Cross-Repo-Live-Smoke gegen mindestens einen Production-Host
- [ ] CROSS-REPO-LESSONS.md mit plugin-internal Drifts (#100+ range)
- [ ] CLAUDE.md (siehe `CLAUDE-TEMPLATE.md`) für AI-CC-Workforce-coordination

---

## 10. Production-Deployment

### 10.1 Distribution

| Type | Wann |
|---|---|
| `external-service` | Plugin ist standalone-Server (Bridge auf eigenem port) |
| `embedded` | Phase-4 — Plugin wird in Host-Process geladen (kein eigener server) |

### 10.2 Service-Discovery

Plugin-Bridge in Production läuft auf dedicated host (z.B. `127.0.0.1:<port>` für desktop-app — siehe Drift #203 in §4.1 — oder cloud-service für SaaS).

Host-Side `service_endpoint` wird im Plugin-Manifest deklariert. Hosts lesen das beim Activate + speichern in `plugin_activations.service_endpoint`-row.

### 10.3 Multi-Host-Auth

Plugin sollte `autoAccept: false` setzen (privacy-by-default). Hosts ruft `register-host` mit Public-Key + landed pending. User approved via Plugin-Settings-UI.

**Persistent HostKeyRepo (Production)** — `InMemoryHostKeyRepo` aus `@nexus/plugin-bridge-foundation` ist nur für Dev/Tests. Production-Plugin-Provider wählen einen der zwei baked-in persistent Adapters:

**JSON-File** (v0.1.1+) — single-process Plugin-Bridges mit niedrigem Write-Volume. Atomic `.tmp` + rename. Keine Native-Dependency.

```ts
import { HostKeyRegistry, JsonFileHostKeyRepo } from '@nexus/plugin-bridge-foundation'

const repo = new JsonFileHostKeyRepo({ path: './data/host-keys.json' })
const registry = new HostKeyRegistry(repo, { autoAccept: false })
```

**SQLite** (v0.2.1+) — Plugin-Bridges mit existing SQLite-State (Electron-Apps, Desktop-Hosts mit `<userData>/...db`). Drop-in für bestehende Schemas via `CREATE TABLE IF NOT EXISTS`:

```ts
import Database from 'better-sqlite3'
import { HostKeyRegistry, SqliteHostKeyRepo } from '@nexus/plugin-bridge-foundation'

const db = new Database('./data/plugin-bridge.db')
const repo = new SqliteHostKeyRepo(db, { tableName: 'host_keys' })
repo.ensureSchema()  // idempotent, no-op auf bestehenden Tabellen mit matching Spalten
const registry = new HostKeyRegistry(repo)
```

Foundation-default Spaltenset: `host_id`, `public_key_pem`, `status`, `fingerprint`, `registered_at`, `approved_at`. Extra plugin-spezifische Spalten (z.B. `last_used_at`, `relay_url`) bleiben auf der Tabelle unangetastet — Foundation touched nur die definierten Spalten.

Für Multi-Process-Plugin (rare): Postgres- oder Redis-backed Repo via Custom `HostKeyRepo`-Implementation.

### 10.5 Wann brauche ich Foundation überhaupt?

Foundation lohnt sich wenn dein Plugin **runtime-discovery** braucht — Host listet Plugin-Components dynamisch, Bridge-Token-Auth-Flow, oder Cross-Frame-Rendering via `/render-ui`. Lohnt sich NICHT wenn dein Consumer-Pfad **build-time-resolve** ist (pnpm/npm-import + dep-tree-resolve, vendoring-friendly, kein server-side state).

**Reference-Implementations (Plugin-Provider mit Foundation):**

| Plugin | Stack | Foundation-Mode |
|---|---|---|
| **plug-elec (ET-Mind)** | TS + Hono Bridge | Hand-roll prior to v0.1.0; v0.2.1+ migrating to `createBridgeApp` (msg #302–304) |
| **oracle (plug-ea / EA-Mind)** | TS + Hono Bridge | v0.2.0 atomic-replace candidate (msg #265) |
| **markview** | TS + Electron-embedded Bridge | v0.2.1+ candidate für `SqliteHostKeyRepo` drop-in (msg #299, #302) |

**Counter-Example: Library-Only-Path-via-pnpm-sync:public**

Design-Mind ([MrDewitt88/Design-Mind](https://github.com/MrDewitt88/Design-Mind), v0.1.0 tag `0674bbe`) ist explizit **kein** Plugin-Provider — es ist eine UI-Component-Library die per `pnpm add github:MrDewitt88/design-mind-tokens#v0.1.0` + `design-mind-ui#v0.1.0` als build-time-resolve konsumiert wird. Konkrete Templates für Konsumenten:

- [`examples/familymind-brand/theme.css`](https://github.com/MrDewitt88/Design-Mind/tree/main/examples/familymind-brand) — FamilyMindV2 skin (teal + warm off-white)
- [`examples/teammind-corporate/theme.css`](https://github.com/MrDewitt88/Design-Mind/tree/main/examples/teammind-corporate) — slate + indigo
- [`examples/eamind-print/theme.css`](https://github.com/MrDewitt88/Design-Mind/tree/main/examples/eamind-print) — AAA-contrast paper-optimized

Plus [`docs/THEMING.md`](https://github.com/MrDewitt88/Design-Mind/blob/main/docs/THEMING.md#examples-gallery) mit WCAG-AA contrast-audit.

Design-Mind's Foundation-Adoption-Decision (msg #261): *"Plug-tmpl streicht uns aus Reference-Implementations-Liste — wir sind kein Plugin-Provider sondern Library-Consumer-Pattern. Mode-A deckt alle aktuellen Use-Cases ab."*

**Heuristik:**
- Eigener HTTP-Endpoint + Bridge-Token-Auth-Flow → **Foundation** (Plugin-Bridge-Pattern)
- npm/pnpm-Distribution + `--*` CSS-vars + Web-Components als Library-Atoms → **Counter-Example** (kein Foundation needed)

Beides ist legitim. Foundation ist Pflicht nur wenn dein Plugin am Plugin-Bridge-Protocol teilnimmt.

### 10.4 Versioning

`manifest.version` (semver). Plus `manifest_hash` in /health für Live-Re-Registration. Hosts cachen + diff-en — bei hash-change re-fetch + re-register-capabilities ohne Plugin-Down-Time.

---

## 11. References

- [`PLUGIN-BRIDGE-PROTOCOL.md`](https://github.com/MrDewitt88/TeamMindV8/blob/main/docs/PLUGIN-BRIDGE-PROTOCOL.md) — Wire-Spec + mcp_tools Extended Form
- [`PLUGIN-KIARA-INTEGRATION.md`](https://github.com/MrDewitt88/TeamMindV8/blob/main/docs/PLUGIN-KIARA-INTEGRATION.md) — Frag-Kiara
- [`PLUGIN-CSP-CONVENTIONS.md`](https://github.com/MrDewitt88/TeamMindV8/blob/main/docs/PLUGIN-CSP-CONVENTIONS.md) — CSP-Allowlist
- [`PLUGIN-CAPABILITIES.md`](https://github.com/MrDewitt88/TeamMindV8/blob/main/docs/PLUGIN-CAPABILITIES.md) — capabilities[] standard
- [`CROSS-REPO-LESSONS.md`](https://github.com/MrDewitt88/TeamMindV8/blob/main/docs/CROSS-REPO-LESSONS.md) — Drift-Catalog #1-#24
- `docs/templates/` (this repo) — Doc-Templates
- `HOST-INTEGRATION-GUIDE.md` (this repo) — gegenüberliegende Sicht für Plugin-Host-Integration
