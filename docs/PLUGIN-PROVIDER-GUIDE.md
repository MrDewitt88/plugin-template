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

> L7 `@nexus-mindgarden/create-plugin` CLI macht das Bootstrap automatic. Bis das landed: manueller Pfad.

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
| `@nexus-mindgarden/plugin-bridge-foundation` | **Pflicht** — Plugin hat HTTP-Endpoint für Host-Communication |
| `@nexus-mindgarden/plugin-storage-foundation` | Plugin persistiert Daten (SQLite-backed) |
| `@nexus-mindgarden/plugin-svelte-foundation` | Plugin hat UI-Components die in Hosts gemounted werden |
| `@nexus-mindgarden/plugin-mcp-foundation` | Plugin exposiert MCP-Tools (fast jeder Plugin) |

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

**Foundation-Default:** `@nexus-mindgarden/plugin-bridge-foundation` v0.1.0+ baked das automatisch ein. Baseline-Optional-Fields = `['host_version']`. Plugin-Provider erweitern via:

```ts
const registry = new HostKeyRegistry(repo, {
  optionalRegisterFields: ['host_version', 'relay_url', 'host_metadata'],
})
```

**Cross-Repo-Source:** Pattern etabliert von plug-elec (`etmind-bridge`), adoptiert von oracle/plug-ea (`eamind-bridge`) + V8 + Theseus. Foundation v0.1.0 baked das Standard-Pattern für alle künftigen Plugin-Provider.

### 4.6 Scopes-Cookbook — Incoming-Floor (`provides.scopes_required`) ⟂ Outgoing-Grant (`requires.scopes`)

> **Ab Foundation v0.11.0** (RFC `requires.scopes`, oracle-Ruling #5418). Manifest-Schema-Feld; **optional** → alte Manifeste unverändert gültig.

> ⚠️ **Pilot-Realität vs. Zielzustand (agent-Ruling #5971, 2026-07-10).** Der Split ist als **Foundation-Contract ratifiziert**, aber der kanonische Host (Theseus `plugin-system/src/schema.ts`) **mintet ihn noch nicht** — er liest heute nur `provides.scopes_required` in den Bridge-JWT `scopes` (das zeigt auch der Aktivierungs-Dialog).
> **→ Für den aktuellen Pilot:** deklariere **alle** Scopes — auch Host-Call-/Reverse-Call-Scopes wie `mcp.agent.complete` — in **`provides.scopes_required`**. Das ist, was der Host heute mintet.
> **→ `requires.scopes`** ist der **Zielzustand (Schema-v2, Thread `plugin-rollout`)**, den Hosts später minten. Es jetzt schon optional zu deklarieren schadet nicht (additiv), aber **verlasse dich noch nicht darauf, dass der Host es mintet.** Migriere `provides.scopes_required` → `requires.scopes` erst, wenn dein Host die Seed-Umstellung angekündigt hat.

`scopes_required` und `requires.scopes` sind **zwei verschiedene Achsen** — verwechsle sie nicht:

| Feld | Achse | Wer liest's | Frage |
| --- | --- | --- | --- |
| `provides.scopes_required` (plugin-wide) | **Incoming-Floor** | `enforceScopes`/`checkToolScopes` (v0.8.0) | Was muss ein **Caller deiner** Tools mitbringen? |
| `provides.mcp_tools[].scopes_required` (per-Tool) | **Incoming-Floor** (granular) | `enforceScopes` **+** Host-Mint | Was braucht **dieses eine** Tool? |
| `requires.scopes` (plugin-wide) | **Outgoing-Grant** | Host-Token-Minting | Welche Scopes mintet der Host in **dein** Token für **Reverse-Calls**? |

**Wann brauchst du `requires.scopes`?** Sobald dein Plugin **zurück** in Host-Tools oder andere Plugins ruft (Reverse-Call) und dafür Scopes braucht, die ein **eingehender** Caller NICHT haben soll. Klassiker (wiz-mind): incoming floor `[]` (granulare Per-Tool-Enforcement), aber das Plugin-Token braucht `family.audit.write` für FamilyMind-Reverse-Calls. Käme das in `provides.scopes_required`, müsste **jeder eingehende Caller** es halten — falsch.

```jsonc
// manifest.yaml (wiz-mind-Beispiel)
{
  "id": "wiz-mind",
  "provides": {
    "mcp_tools": [
      { "name": "session.start", "scopes_required": ["mcp.write.wiz"] } // per-Tool-Floor
    ],
    "scopes_required": []          // INCOMING-Floor plugin-wide: leer → granular per Tool
  },
  "requires": {
    "scopes": [                    // OUTGOING-Grant: in DEIN Token gemintet
      "family.policy.read",
      "family.audit.write",        // FamilyMind reverse-calls
      "mcp.read.unifieddb"         // plug-db reverse-calls
    ]
  }
}
```

**Was der Host daraus mintet** (`HOST-INTEGRATION-GUIDE §2.3`, verbindlich):

```
token.scopes = (requires.scopes ?? provides.scopes_required)   // plugin-wide Seed
                 ∪ ⋃ provides.mcp_tools[].scopes_required       // per-Tool-Union (BLEIBT)
```

⚠️ Der **Per-Tool-Union bleibt im Mint** — er wandert NICHT nach `requires`. Ein Token ohne den granularen Write-Scope eines Tools → das Tool 403't still (Kanban-Drift 2026-05-11). Nur der **plugin-wide Seed** splittet zwischen Incoming-Floor und Outgoing-Grant.

**Migrationspfad (per Plugin):** reduziere `provides.scopes_required` auf den echten eingehenden Floor (oft `[]`), verschiebe Reverse-Call-Scopes nach `requires.scopes`. `enforceScopes` bleibt opt-in/default-off, bis der Split cluster-weit steht — kein Zwang, kein Bruch. Volle Begründung: `docs/RFC-REQUIRES-SCOPES.md`.

### 4.7 Plugin-Rollout — Manifest-Dateiname, Release-Bundle, env-first Port

> **Ab `create-plugin` v0.7.0 / `plugin-bridge-foundation` v0.12.0** (Thread `plugin-rollout`, agent-Ruling #6044). Für die automatische Nexus-Katalog-Auslieferung ohne händisches Manifest-Pasten.

**1 · Manifest-Dateiname `manifest.<id>.yaml` (CODEX-REV §13.8).** Der kanonische Discovery-Dateiname ist `manifest.<plugin-id>.yaml` — der **Suffix MUSS `manifest.id` entsprechen** (Anti-Collision-Guard im globalen `~/Documents/Theseus/Plugins/`-Ordner). Foundation macht **Dual-read**:

```ts
import { discoverManifest } from '@nexus-mindgarden/plugin-bridge-foundation'
const { manifest, deprecated } = await discoverManifest('.') // manifest.<id>.yaml bevorzugt
// deprecated=true + stderr-Warn, falls nur das bare manifest.yaml existiert
```

Der bare `manifest.yaml` bleibt für **≥2 Releases** als DEPRECATED-Fallback lesbar. `loadManifest(path)` bleibt der low-level Datei-Loader.

**2 · Release-Bundle (`pnpm bundle`).** `scripts/pack-bundle.mjs` (im Scaffold) baut ein **deterministisches** `bundle.tgz` + `bundle.meta.json`:

```jsonc
{ "id": "…", "version": "…", "min_app_version": "…",
  "sha256": "<hex>", "bytes": 561, "signature": null,   // signature reserved für v2 Ed25519
  "files": ["manifest.<id>.yaml", "dist-plugin/…", "server/…"] }
```

- Inhalt: **nur** `manifest.<id>.yaml` + `server/` (gebündeltes Server-JS) + `dist-plugin/` (Browser-Artefakte). **Kein `node_modules`, keine Runtime** — der Host liefert die signierte Bun-Runtime (G1).
- Deterministisch: sortierte USTAR-Einträge, `mtime=0`, `uid/gid=0`, gzip level 9 → **reproduzierbarer sha256** (innerhalb einer Node/zlib-Toolchain).
- **sha256 ist der v1-Integritätsanker** (der Nexus-Katalog ist der Vertrauenskanal); Ed25519-Bundle-Signatur ist v2 (`signature: null` ist additiv reserviert).

**3 · Env-first Port.** Unter einem Host wird der Port **zugewiesen** (`PLUGIN_BRIDGE_PORT`); der Manifest-Port ist nur Standalone-Dev-Default:

```ts
import { serve } from '@hono/node-server'
import { createApp, resolvePort } from './index.js'
serve({ fetch: (await createApp()).fetch, port: resolvePort() }) // env-first; invalid → Klartext-Error
```

Ein ungültiger/kollidierender Port wirft einen **Klartext-Fehler** (kein Silent-Fail).

**4 · Launch-Contract (`bundle.launch.json`, agent-Ruling #6046).** Optional: wie der Host dein Plugin startet. Author-authored JSON im Plugin-Root; der Packer **validiert** es und bettet es als `bundle.meta.json.launch` ein. Fehlt es → Host-Konvention `entry: server/index.js`.

```jsonc
// bundle.launch.json (optional)
{
  "entry": "server/index.js",   // PFLICHT wenn vorhanden: relative .js-Datei IM Bundle (kein ../, kein absolut)
  "cwd": ".",                    // optional, bundle-relativ, default "."
  "env": { "FOO": "bar" },       // optional, statisch, KEINE Secrets
  "health_path": "/api/health"   // optional, default Foundation-Standard
}
```

Host-Semantik: Runtime ist **immer** die Host-Bun (G1) → gespawnt wird `<host-bun> <entry>` mit `cwd` im Bundle; `PLUGIN_BRIDGE_PORT` wird immer gesetzt (env-first). Der Packer **rejected beim Packen**: fehlendes/nicht-`.js`-`entry`, `entry` nicht im Bundle, `../`/absolute Pfade, unbekannte Keys — der Host startet nie beliebige Binaries.

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
} from '@nexus-mindgarden/plugin-bridge-foundation'
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
  // ... persist via @nexus-mindgarden/plugin-storage-foundation ...
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
  } from '@nexus-mindgarden/plugin-svelte-foundation'

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
  /* Theme-Tokens via @nexus-mindgarden/plugin-svelte-foundation/theme generated */
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
} from '@nexus-mindgarden/plugin-svelte-foundation/build'

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

**Persistent HostKeyRepo (Production)** — `InMemoryHostKeyRepo` aus `@nexus-mindgarden/plugin-bridge-foundation` ist nur für Dev/Tests. Production-Plugin-Provider wählen einen der zwei baked-in persistent Adapters:

**JSON-File** (v0.1.1+) — single-process Plugin-Bridges mit niedrigem Write-Volume. Atomic `.tmp` + rename. Keine Native-Dependency.

```ts
import { HostKeyRegistry, JsonFileHostKeyRepo } from '@nexus-mindgarden/plugin-bridge-foundation'

const repo = new JsonFileHostKeyRepo({ path: './data/host-keys.json' })
const registry = new HostKeyRegistry(repo, { autoAccept: false })
```

**SQLite** (v0.2.1+) — Plugin-Bridges mit existing SQLite-State (Electron-Apps, Desktop-Hosts mit `<userData>/...db`). Drop-in für bestehende Schemas via `CREATE TABLE IF NOT EXISTS`:

```ts
import Database from 'better-sqlite3'
import { HostKeyRegistry, SqliteHostKeyRepo } from '@nexus-mindgarden/plugin-bridge-foundation'

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

## 11. `agent.complete` — canonical Plugin-to-LLM Tool (v0.3.0+)

> **Pflicht-Pattern** für Plugin-Authors die LLM-Calls machen. Direct-HTTP zu LM Studio / OpenAI ist Anti-Pattern.

Contract etabliert in chatbus thread="contracts" 2026-05-21 (msg #443-449). Theseus shipped `v0.15.0-agent-complete-endpoint` (commit `51921ff`). V8/v8-fam dispatchen via `/mcp/v1/call-tool` per Design-Y zu Theseus' `POST /agent/complete`.

> **See also (consumer-side perspective):** [Mind-Canva's `CROSS-PLUGIN-INTEGRATION.md`](https://github.com/MrDewitt88/Mind-Canva/blob/main/docs/CROSS-PLUGIN-INTEGRATION.md) — concrete consumer→consumer wire-recipes (`layout.create`, `export.pdf`, `brand_kit.get`) including auth-flow walkthrough (§4) and smoke-test pattern (§5). This Provider-Guide is provider-perspective; Mind-Canva's cookbook is the orthogonal consumer-perspective on plugin-to-plugin integration via MCP. Both co-exist as paired cluster-docs.

### 11.1 Warum nicht direct-HTTP?

Wenn N Plugins jeweils ihren eigenen OpenAI/LM-Studio-Client haben:

| Risiko | Direct-HTTP-each | Via `agent.complete` |
|---|---|---|
| LM-Studio inflight-limit (typ. 1-2) | N racing clients, 1 wins, others fail | 1 serialisiertes Queue |
| Cloud-Consent-Gates | jedes Plugin re-implementiert (oder vergisst) | 1× zentral in Theseus |
| Prompt-Cache-Hit-Rate | N× cold (Sticky-Session-Affinity broken) | 1 sticky cache, echte cache-savings |
| Tenant-Policy / Audit | N× implementiert | 1× zentral |
| Provider-Token-Rotation | N Credential-Pools | 1 |

Das LM-Studio-Inflight-Argument allein zerlegt direct-HTTP für jedes Multi-Plugin-Setup.

### 11.2 Foundation-Helper

> **v0.7.0+ — drei Transport-modes verfügbar.** Wähle nach **wo dein Code läuft** (DOM-Renderer vs Node-Bridge) + **welcher Token-Source** verfügbar ist. Decision-tree am Ende von §11.2.

#### 11.2a — Embedded callMcp (NEUE Standard für DOM-Plugins, v0.7.0+)

Wenn dein LLM-call **im Renderer** läuft (Svelte 5 custom-element, lit-element, etc.):

```ts
import { callMcp } from '@nexus-mindgarden/plugin-bridge-foundation/runtime'

const result = await callMcp<{ text: string; toolCalls: unknown[] }>(
  mount,
  'agent.complete',                  // un-prefixed host-shared tool (v0.7.0+ allowlist)
  {
    messages: [
      { role: 'system', content: 'Du bist ein hilfsbereiter Layout-Assistent.' },
      { role: 'user', content: 'Schlage 5 Headlines für Frühlingsfest-A4-Flyer vor.' },
    ],
    responseFormat: { type: 'json_schema', schema: zodToJsonSchema(HeadlineSchema) },
    maxTokens: 200,
  },
  { actorClass: 'user' },             // 'user' = user-initiated, 'system' = autonomous
)
// result.text = AgentCompleteResponse.text  (NICHT choices[0].message.content)
const headlines = HeadlineSchema.parse(JSON.parse(result.text))
```

**Kein HTTP, kein Token, kein bridge-endpoint.** Der Host (myMind) routet den `plugin:mcp-call` CustomEvent direkt zu Theseus' `runHeadlessComplete`. Cross-Ref: `CROSS-PLUGIN-MCP-CALL-COOKBOOK.md` §8 (Host-Shared Tools).

#### 11.2b — Standalone HTTP direct-to-host (NEU v0.7.0+, preferred für Bridge-Plugins)

Wenn dein LLM-call **im Node-Bridge-Prozess** läuft (kein DOM, z.B. mind-canva `:3670` external-service, apex2d `:3690` reverse-call-Handler):

```ts
import { createAgentComplete } from '@nexus-mindgarden/plugin-bridge-foundation/agent-complete'

const agentComplete = createAgentComplete({
  bridgeEndpoint: 'http://127.0.0.1:3400/agent/complete',  // direct Theseus agent-socket
  transport: 'agent-socket-direct',                         // bare body, kein V8-envelope
  tokenResolver: () => bridgeTokenStore.current(),          // per-plugin handshake-JWT
  callerId: 'my-plugin@bridge',                             // optional forensic-tracing
})

const result = await agentComplete({
  messages: [
    { role: 'system', content: 'Du bist ein hilfsbereiter Layout-Assistent.' },
    { role: 'user', content: 'Schlage 5 Headlines für Frühlingsfest-A4-Flyer vor.' },
  ],
  responseFormat: { type: 'json_schema', schema: zodToJsonSchema(HeadlineSchema) },
  maxTokens: 200,
  cacheRetention: 'short',
})

if (result.error) {
  logger.warn('agent.complete error', { code: result.error.code, message: result.error.message })
  throw { code: result.error.code, message: result.error.message }
}
const headlines = HeadlineSchema.parse(JSON.parse(result.text))
```

**Token-Source:** der `tokenResolver` gibt das per-plugin-activation-JWT zurück, das deine Bridge bei jedem `/plugin-bridge/v1/handshake` als `Authorization: Bearer …` empfängt (gleicher Token den du für `/host-bridge/v1/execute-tool` reverse-calls nutzt). **Kein neuer Token, kein `MC_AGENT_TOKEN` env-var nötig** sobald v0.7.1's `createHandshakeTokenStore()` da ist. Interim siehe Cookbook §8.5.2 für die capture-at-handshake-Middleware-Pattern.

**Warum direct-to-host statt V8?** myMind ist kanonischer Host (2026-05-31). Der alte V8 → `/mcp/v1/call-tool` → :3400 hop funktioniert **weiter** (additive back-compat), ist aber **nicht mehr nötig**: ein hop weniger, keine V8-tenant-Bindung, per-plugin token statt shared-static.

#### 11.2b.1 — Image-Tools: andere Wire als agent.complete

`image.generate` und `image.remove_background` (b)-Pfad nutzen **NICHT** `/agent/complete`-style direct-endpoints, sondern den **Reverse-Call** `POST :3400/host-bridge/v1/execute-tool`:

```ts
// Today (pre-v0.7.1, manual fetch):
async function callImageTool(toolName: string, args: unknown) {
  const token = await handshakeTokenStore.current()    // siehe §11.11
  const res = await fetch('http://127.0.0.1:3400/host-bridge/v1/execute-tool', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      tool: toolName,
      args,                          // ⚠ KEY IS "args" — NICHT "arguments"!
    }),
  })
  const body = await res.json()
  if (!body.ok) throw new Error(`${body.error.code}: ${body.error.message}`)
  return body
}

const result = await callImageTool('image.remove_background', {
  image_base64: srcPng,
  mime: 'image/png',
})
// ⚠ Lese result.metadata.image_base64 — NICHT result.value
// (result.value ist base64-FREIE display-text; die PNG-bytes leben in metadata)
const pngB64 = result.metadata.image_base64
```

**Token-Asymmetrie (kritisch):**

| Endpoint | Static `MC_AGENT_TOKEN` | Per-plugin handshake-JWT |
|---|---|---|
| `/agent/complete` | ✅ (additive back-compat) | ✅ |
| `/host-bridge/v1/execute-tool` (image.*) | ❌ NICHT supported | ✅ ONLY |

→ Image-tools im (b)-Pfad sind **handshake-only** — kein interim-static-token workaround möglich. Wenn du heute schon agent.complete(b) mit static-token willst, geht das; image-tools brauchen handshake-JWT-exposure (v0.7.1 + §8.5.2 interim).

**Foundation v0.7.1+ canonical (recommended over manual fetch):**

```ts
import {
  createHandshakeTokenStore,
  createReverseCallClient,
} from '@nexus-mindgarden/plugin-bridge-foundation/auth'

const tokenStore = createHandshakeTokenStore()
const app = createBridgeApp({
  ...,
  handshakeTokenStore: tokenStore,    // v0.7.1+ auto-captures Bearer at /handshake
})

const reverseCall = createReverseCallClient({
  hostEndpoint: 'http://127.0.0.1:3400',
  tokenStore,
})

// Typed wrapper für image-tools — extrahiert metadata.image_base64 automatisch:
const img = await reverseCall.executeImageTool('image.remove_background', {
  image_base64: srcPng,
  mime: 'image/png',
})
// img.image_base64 = PNG bytes, img.mime, img.width, img.height — flat shape
// Plus client-side prefix-guard (forbidden_prefix throw vor network call)
```

Cross-ref Cookbook §8.4 + §8.5.2 für vollständige reverse-call-wire-details inkl. workspace-anchor-allowlist (`projects.*` / `contacts.*` / `calendar.*` / `notes.*` / `attachments.*` + `image.*`).

#### 11.2c — Legacy V8-bridge (v0.3.0–v0.6.x, weiterhin supported)

Wenn dein Plugin **innerhalb einer V8/TeamMind-tenant** läuft und gegen den existing V8-bridge gebaut hat:

```ts
const agentComplete = createAgentComplete({
  bridgeEndpoint: ctx.bridgeEndpoint,      // M17 accept-response (V8 :3100 / v8-fam :3050)
  sessionToken: ctx.sessionToken,          // M17 accept-response static-token
  // transport omitted → defaults to 'v8-bridge' (back-compat)
})
```

Identisch zu v0.6.x wire-output. Migration ist **opt-in per call-site** — v0.6.x code läuft weiter, nur neue call-sites greifen den (b)-direct-mode.

#### Decision-Tree

```
Wo läuft dein LLM-call?
├── DOM-Renderer (Svelte/lit/custom-element)
│   → §11.2a callMcp('agent.complete')  ★ neue Standard
│
└── Node-Process (Bridge / external-service / reverse-call-handler)
    │
    ├── Plugin läuft in V8/v8-fam tenant + hat M17 token
    │   ├── Nur back-compat, kein refactor:
    │   │   → §11.2c V8-bridge (default transport, sessionToken)
    │   └── Migration zu direct-to-host (preferred neu):
    │       → §11.2b agent-socket-direct + tokenResolver
    │
    └── Plugin läuft standalone (kein V8 im loop):
        → §11.2b agent-socket-direct + tokenResolver  ★ einzige Option
```

**Alle drei Modes nutzen den gleichen Handler** (Theseus' `runHeadlessComplete`) und das gleiche frozen schema (`@theseus/agent-complete-schema` v0.15.0). Nur transport-layer + auth-source unterscheiden sich.

### 11.3 Capability-Request bei M17 guest-registration

Plugin-Authors fordern beim M17-guest-registration die Capability an:

```json
{
  "protocol_version": 1,
  "agent_id": "my-plugin-uuid",
  "display_name": "My Plugin",
  "tenant_id": "dev",
  "capabilities_requested": ["agent.llm:invoke", "fs.read:workspace", "memory.read"]
}
```

V8/v8-fam policy-intersection: `agent.llm:invoke` ist in der `ki-user`-Policy default-allowed. Host kann das per-tenant deaktivieren wenn nötig.

### 11.4 Granite-Floor + agent.complete

Granite-Floor-Philosophy (siehe Mind-Canva / Wiz-Mind `docs/GRANITE-FLOOR.md`) bleibt **Caller-Verantwortung**:

- **JSON-Schema-Constraint:** Caller passiert `responseFormat: { type: 'json_schema', schema }` — Provider-side enforced
- **Max-Token-Caps:** Caller setzt `maxTokens` per Feature-Need (Headline-Suggest 200, Layout-Critique 400, etc.)
- **defense-in-depth-zod:** auch wenn Provider strict-output enforced, Caller validated Output mit zod nochmal (Cloud-Fallback hat oft schwächere grammar-constraints)
- **Pilot-Test-Suite:** Caller's `test/granite-pilot/*.test.ts` muss weiter ≥80% pass-rate haben — `agent.complete` ändert nichts an dem Architectural-Commitment

#### 11.4.1 `response_format`: backend-portability (cluster-evidence)

> **TL;DR:** Foundation + Theseus-Host akzeptieren alle 3 `response_format`-Typen (`text` / `json_object` / `json_schema`). **Aber: lokale Modell-Backends (LM Studio / Granite / Ollama / vLLM) lehnen `json_object` häufig ab.** Wenn dein Plugin gegen lokales Granite läuft → **bevorzuge `json_schema` mit offenem object-schema** (`strict: false`-äquivalent) statt `json_object`.

**Source-of-truth-table** (per agent #4442 host-truth-ruling + oracle #4438 endorsement):

| Layer | `text` | `json_object` | `json_schema` |
|---|---|---|---|
| Foundation `@nexus-mindgarden/plugin-bridge-foundation/agent-complete` | ✅ | ✅ | ✅ |
| Theseus-Host (`@theseus/agent-complete-schema` + provider `toOpenAIResponseFormat`) | ✅ accepts + forwards | ✅ accepts + forwards | ✅ accepts + forwards |
| Downstream backends (LM Studio, Granite 4-h-tiny, Ollama, vLLM) | ✅ ubiquitous | ⚠ **often rejected** | ✅ widely supported |
| OpenAI / Anthropic Cloud | ✅ | ✅ | ✅ (strict + non-strict) |

**Konkretes evidence:** apex2d #4416 + mind-canva — beide sahen `chatJSON`-calls brechen mit `responseFormat: { type: 'json_object' }`. Backend (LM Studio in local-Granite-flow) returned schema-error, NICHT host-side rejection. Foundation+Host hatten den request korrekt weitergereicht.

**Empfehlung für portabilität** (lokale Granite-Setups dominieren cluster-deployment):

```ts
// ❌ Avoid (works in cloud, often breaks local Granite):
const result = await agentComplete({
  messages: [...],
  responseFormat: { type: 'json_object' },
})

// ✅ Prefer (works in cloud AND local Granite, full schema-discipline):
const result = await agentComplete({
  messages: [...],
  responseFormat: {
    type: 'json_schema',
    schema: zodToJsonSchema(MySchema),
  },
})

// ✅ Acceptable equivalent of json_object (when you want flexible JSON without strict shape):
const result = await agentComplete({
  messages: [...],
  responseFormat: {
    type: 'json_schema',
    schema: { type: 'object' },  // open-ended object — like json_object but backend-portable
  },
})
```

**Warum Foundation `json_object` weiter exposed** statt es zu entfernen: Foundation ist **byte-aligned mit Host** (`@theseus/agent-complete-schema` v0.15.0 FROZEN). Beide layers erlauben alle 3 typen. Das **runtime-capability-gap** zwischen Host und downstream-Backend ist eine separate concern, die durch docs + caller-discipline addressiert wird (kein schema-tightening, weil schema = wire-contract, nicht runtime-policy).

**Wenn du gegen Cloud-only (OpenAI/Anthropic) baust:** `json_object` ist fine. Wenn dein plugin gegen lokales Granite läuft (= cluster-default): `json_schema` ist der portable-default.

Cross-ref:
- chatbus msg #4416 apex2d (original finding) + #4442 agent host-truth + #4438 oracle ruling §4
- `@theseus/agent-complete-schema` (index.ts:39-43) — canonical wire-shape

### 11.5 Cache-Retention Pattern

Caller-side decision per call:

| Wert | TTL | Use-Case |
|---|---|---|
| `'none'` | kein Marker | hohe Prompt-Entropy (jeder Call differs substantiell) |
| `'short'` | ~5min (Anthropic-compat) | ad-hoc-User-Triggers, hits innerhalb Minuten erwartet |
| `'long'` | ~1h (Anthropic-compat) | session-long prompt-prefix |

Bei reinem LM Studio kein-Effekt. Bei späterem Cloud-opt-in (User-triggered) Marker schon korrekt gesetzt → kein Code-Change in Migration-Wave.

### 11.6 Dev-Preview Anti-Pattern (mind-canva Reference)

Mind-Canva hat einen `OpenAIProvider` als **dev-only-fallback** für `pnpm dev:preview` (standalone-Browser ohne V8/Theseus). Conditions die das akzeptabel machen:

1. **Doc-stamp** in CLAUDE.md / README: "dev-only, bypasses cloud-consent + tenant-policy + audit"
2. **Runtime feature-flag:** Constructor wirft wenn `MC_ALLOW_DIRECT_HTTP_PROVIDER` env-var nicht gesetzt ist. Default in production = unset.
3. **CI-grep:** `pnpm test` runs `scripts/check-no-direct-provider-in-prod.mjs` — Bridge-side darf NIE OpenAIProvider importieren

Wenn alle drei drin sind, bleibt dev-experience nicht trocken bei standalone-Plugin-Entwicklung. Sonst: weg damit + nur `agent.complete`-Pfad.

### 11.7 Error-Envelope (Drift #103 cross-language)

`agent.complete`-response ist NIE thrown bei server-side errors. Stattdessen:

```json
{
  "text": "",
  "toolCalls": [],
  "stopReason": "error",
  "error": {
    "code": "rate_limited",
    "message": "LM Studio inflight-limit exceeded; retry in 30s",
    "retryable": true
  }
}
```

Foundation's `createAgentComplete` throws nur bei **transport-failures** (network-error) und **schema-mismatches** (response-body ist nicht spec-konform). Server-side-errors landen im envelope.

**Convenience:** `agentCompleteText(client, req)` throws auch bei error-envelope — wenn du nur den text willst und das wegabstrahieren möchtest.

### 11.8 X-Request-Id Distributed-Tracing (v0.2.2+)

```ts
const agentComplete = createAgentComplete({
  bridgeEndpoint, sessionToken,
  requestId: parentRequestId,  // propagate from upstream
})
```

Foundation echoed `X-Request-Id` zurück. Wenn Plugin-Authors X-Request-Id von ihrem eigenen incoming-request weiterpropagieren, ist Cross-Service-Trace-Korrelation gratis — vom V8-User-Click bis zum LM-Studio-Token.

### 11.9 Migration-Reihenfolge

Per chatbus consensus (msg #445):

1. **Week 1:** Mind-Canva als first-mover (24-48h migration committed)
2. **Week 1-2:** plug-db (Embeddings + LM-Studio-Probe direct-HTTP-paths)
3. **Week 2:** plug-elec (M3 MCP-UI hat lokale LLM-Hints)
4. **Week 2:** markview, ea-plug, kanban (wenn LLM-Konsum)

V8 selbst ist passive — V8 macht keine LLM-calls direkt, dispatched nur.

### 11.10 Schema-Source-of-Truth

**Canonical**: `@theseus/agent-complete-schema` (Theseus monorepo). plug-tmpl's Foundation-Helper dupliziert die Schemas als **stop-gap** bis Theseus npm-publish'd. Wenn Theseus publishes:

- Foundation v0.3.x bumpst auf peer-dep `@theseus/agent-complete-schema`
- Type-re-exports bleiben kompatibel (semver-stable contract)
- Migration ist `pnpm install`

Bis dahin sind plug-tmpl-Schemas faithful zur Spec (msg #449).

### 11.11 v0.7.0 Migration: tokenResolver + agent-socket-direct

**Foundation v0.7.0 (2026-05-31)** brachte additive transport-mode + tokenResolver — alle v0.6.x callsites laufen unverändert weiter. Du migrierst nur wenn du:

1. **Direct-to-host willst** (kein V8 hop mehr, eigene plugin-bridge-Plugins)
2. **Per-plugin handshake-token** statt shared-static brauchst (token-rotation transparent)
3. **Standalone laufen** willst (kein V8 im loop, eigene `:36xx`-bridge im Node-context)

**3-Schritt-Migration:**

```ts
// Before (v0.6.x — V8-bridge static-token):
const agentComplete = createAgentComplete({
  bridgeEndpoint: 'http://127.0.0.1:3100/mcp/v1/call-tool',
  sessionToken: process.env.AGENT_SOCKET_TOKEN!,
})

// After (v0.7.0+ — direct-to-host per-plugin-token):
const agentComplete = createAgentComplete({
  bridgeEndpoint: 'http://127.0.0.1:3400/agent/complete',   // change 1: direct theseus :3400
  transport: 'agent-socket-direct',                          // change 2: new transport-mode
  tokenResolver: () => bridgeTokenStore.current(),           // change 3: resolver statt statisch
})
```

**Token-source:** der per-plugin handshake-JWT aus `register-tenants` (gleicher den deine bridge für `/host-bridge/v1/execute-tool` hält). Foundation cached automatisch — `tokenResolver` returns current. **Kein neuer Token, kein env-var.**

**Old + new co-exist im gleichen plugin.** v0.6.x-callsites bleiben auf V8-bridge, neue callsites schalten auf direct-mode. Opt-in pro call-site.

**Cross-Repo-Adoption (Wave-Reihenfolge 2026-05-31+):**

| Plugin | Migration | Status |
|---|---|---|
| mind-canva | (b) standalone HTTP — bridge `:3670` | wartet auf Foundation v0.7.0 npm-publish |
| apex2d | (c) beides — embedded (a) callMcp + (b) standalone HTTP | wartet auf Foundation v0.7.0 npm-publish |
| plug-elec | optional migration zu (b) wenn standalone-bridge gewünscht | TBD, nicht blockend |

### 11.12 Host-Shared Tools Beyond agent.complete

`agent.complete` ist 1 von **3 host-shared callMcp-Tools** (v0.7.0+ allowlist, agent's `feat/host-tool-routing` triple-landing 2026-05-31):

| Tool | actorClass v1 | Wire-spec | Use-case |
|---|---|---|---|
| `agent.complete` | `'user'` + `'system'` | `@theseus/agent-complete-schema` | LLM text + tool-call + JSON-mode |
| `image.generate` | `'user'` only | `@theseus/tools-image-schema` | Text-to-image (Bonsai sidecar §2.5) |
| `image.remove_background` | `'user'` only | `@theseus/tools-image-schema` | Alpha-matting (ISNet @imgly §2.6) |

Adding a 4th host-shared tool requires: chatbus contracts-thread RFC + oracle architecture-ruling + host-side `HostToolBindings` allowlist-extension + Foundation re-export + docs update. Don't prefix your own plugin-tools with `image.` / `agent.` — those namespaces are reserved.

Cross-ref `CROSS-PLUGIN-MCP-CALL-COOKBOOK.md` §8 für vollständige host-shared-tools-architecture-details.

---

> **See also (plugin↔host wire-protocol):** [`CROSS-PLUGIN-MCP-CALL-COOKBOOK.md`](./CROSS-PLUGIN-MCP-CALL-COOKBOOK.md) — canonical wire-spec for plugin custom-element bundles dispatching MCP-calls back through the host's IPC layer via Foundation's `/runtime` `callMcp()` helper. 3-side ko-authored from the Wiz-Mind v0.1.0 joint-smoke. Complements §11's plugin-to-LLM `agent.complete`-pattern with plugin-to-host MCP-tool-call-pattern. **§8 Host-Shared Tools** (v0.7.0+) documents the broader host-shared-callMcp-tool model (`image.generate` / `image.remove_background` / `agent.complete`).

---

## 12. Writing Reversible Workarounds

Plugin development in a multi-repo cluster surfaces a recurring tension: the canonical path (e.g. npm-published Foundation packages) takes time to land, but downstream plugins can't wait. They ship a **workaround** — a vendored-tree, a custom helper, a monkey-patch — to unblock themselves. Then, when the canonical path arrives, the workaround has to come out. If the workaround was written without the reversal-path in mind, removing it can be days of detective-work.

This section codifies the **reversal-discipline** that lets workarounds come out cleanly, often in single-digit minutes.

### The pattern

When you ship a workaround, ship **three artifacts** at the same commit:

1. **The workaround itself** — the script, the vendored-code, the monkey-patch
2. **A `WHY` companion-doc** — short markdown file (~30 lines) explaining what the workaround does, why it exists right now, what canonical-state it bridges to
3. **A `REVERSAL-PATH` section** — explicit step-by-step undo-instructions, including the sed-commands, file-deletions, and verification-checks that take the plugin back to the canonical-path-consumption shape

Convention: name the companion-doc by the workaround's domain. E.g. if you vendor-tree Foundation under `vendor/plugin-template/`, name the doc `docs/VENDOR-FOUNDATION.md`. The pairing makes the workaround discoverable from its own location.

### Anatomy of a `WHY` companion-doc

```markdown
# Vendor-Foundation Workaround

## Status
Active workaround. Will be removed when Foundation publishes to npm
(tracked: foundation milestone v0.4.0).

## What this is
Vendor-tree of @nexus-mindgarden/plugin-bridge-foundation at v0.3.3
copied into `vendor/plugin-template/`. `pnpm-workspace.yaml` references
this path. `scripts/setup-foundation.sh` populates the tree from
a git-pinned source.

## Why this exists
Foundation v0.3.0 broke consumer-installs (github-URL without dist/).
v0.3.3 added committed-dist as a bridge but only as a 4-iteration
hotfix. Until npm-publish lands, we vendor to control the upgrade-tempo.

## When to remove
When Foundation v0.4.0 (or any later version) is on npm:
`pnpm view @nexus-mindgarden/plugin-bridge-foundation version`
returns a value.

## Reversal path
See § Reversal below.

## Reversal

1. Confirm npm-published version:
   pnpm view @nexus-mindgarden/plugin-bridge-foundation version
2. Replace vendor-reference in package.json:
   sed -i '' 's|"@nexus/plugin-bridge-foundation": ".*"|"@nexus-mindgarden/plugin-bridge-foundation": "^0.4.0"|g' package.json
3. Remove from pnpm-workspace.yaml:
   yq eval 'del(.packages[] | select(. == "vendor/plugin-template/*"))' \
     -i pnpm-workspace.yaml
4. Delete artifacts:
   rm -rf vendor/ scripts/setup-foundation.sh
   # Also remove "setup:foundation" from package.json scripts
5. Re-install + verify:
   pnpm install
   pnpm test
6. Delete this file: rm docs/VENDOR-FOUNDATION.md
```

### Why this pays off (real reference, anonymized)

A plugin in the `@nexus-mindgarden` cluster shipped a vendored-Foundation workaround during the v0.3.x hotfix-cascade. They wrote a companion `docs/VENDOR-FOUNDATION.md` documenting the reversal-path **at the same commit**, before the canonical npm-published Foundation existed.

When Foundation v0.4.0 landed weeks later, the same CC who was unfamiliar with the workaround's specifics was able to execute the reversal in **~22 minutes** by following the documented steps verbatim. The migration touched 30 files, removed ~50 files of vendored-tree, and stayed 162/162 tests green throughout.

The key insight: **the reversal-doc was written when the workaround was fresh**, not retrofitted later. By the time you need the reversal-doc, the original-context has often paged-out of human-memory. Future-you, or a different CC, or a successor maintainer reads it cold.

### Anti-pattern checklist

Avoid these failure-modes:

- ❌ **No reversal-doc** — workaround ships, six months later nobody remembers why it exists; removing it becomes archaeology
- ❌ **Reversal-doc lives only in chatbus** — chatbus is for coordination, not artifact-discoverability. Future-readers grep the repo
- ❌ **Reversal-doc refers to "the canonical version"** — name the specific version the reversal targets. "When Foundation lands" is vague; "When `pnpm view ... version` returns ≥0.4.0" is concrete
- ❌ **Workaround-script and reversal-script in separate commits** — they must ship together so a reader sees both at the same `git log` entry
- ❌ **Reversal-doc has no verification-checks** — the reader needs to know how to confirm the reversal worked (which tests, which grep, which build-step)

### When the pattern is NOT worth the cost

Skip the reversal-doc discipline for:

- Trivial one-line workarounds (a `// TODO: remove after #1234` comment is enough)
- Workarounds that touch only your own code (no cross-package shape-change to undo)
- Time-bound workarounds where the canonical path lands within hours (chatbus-thread sufficient for that lifetime)

The discipline is for workarounds that **span repos or persist past a single sprint**. That's where context decays and reversal-friction compounds.

### Cross-Repo Provenance

- **mind-canva pattern (anonymized in this guide):** `docs/VENDOR-FOUNDATION.md` shipped with `vendor/plugin-template/` workaround during v0.3.x cascade. Used 1:1 during v0.4.0 npm-publish reversal. Commit-link available via plugin-author's chatbus reference if needed.
- **kanban in-repo-mirror pattern:** `host-record-status.ts` 56-LoC mirror documents trade-offs (zero supply-chain-Surface vs drift-risk) inline as code-comments + chatbus-trail. For a mirror this small, code-comment + chatbus is sufficient; for larger workarounds (>150 LoC or multi-file), the full `WHY` companion-doc pattern is recommended.

See also: [`MIGRATION-COOKBOOK.md`](./MIGRATION-COOKBOOK.md) for the three adoption-patterns that reversal-disciplined workarounds bridge between.

---

> **Cross-link:** [`CROSS-PLUGIN-MCP-CALL-COOKBOOK.md`](./CROSS-PLUGIN-MCP-CALL-COOKBOOK.md) §5.0-§5.8 (joint failure-mode catalog) is a worked example of the reversal-discipline applied to a cluster-wide debug-session. The DOM-bubble-direction bug-fix shipped with **same-commit reversal-doc** as a debug-helper-section (§5.6), so future readers hit the diagnosis-path in <5 minutes instead of repeating the 2-hour discovery.

---

## 13. Pre-Coding to Surface Contract-Drift

A counter-intuitive pattern surfaced repeatedly across the `@nexus-mindgarden` cluster: **writing a consumer-adapter against a contract _before_ that contract's runtime is live** is one of the most effective ways to surface contract-drift early. The adapter, even un-executed, acts as a compile-time fuzzer of the wire-spec.

### The pattern

You're about to integrate with another plugin's tool-surface, RAG-client, or HTTP-API. The other side isn't live yet — they're a week out from shipping, or you don't have credentials, or the host-app activation is queued. Conventional wisdom says: wait for the live endpoint, then write the adapter against real responses.

**Counter-pattern:** write the adapter NOW, against the documented contract (the TS-client types, the YAML mcp_tool spec, the swagger). Treat your adapter code as a **dry-run spec-validator**:

1. Import the other plugin's published types/schemas (or hand-mirror them if not published yet)
2. Write the integration-layer in your own plugin — full call-shape, full error-handling, full response-mapping
3. Compile + unit-test against fixtures (mock the wire-layer, but commit to the documented shape)
4. Iterate **on the contract**, not on the runtime — when you trip over an inconsistency, the contract is drift-prone and needs fixing before the runtime lands

### Why this works

The author of the contract (whoever shipped the TS-client surface or YAML spec) usually wrote it from the **provider's** perspective — "here's what my tool emits / accepts." The first consumer who writes against it from the **opposite side** ("here's how I have to call it") routinely surfaces 2-3 kinds of drift:

- **Argument-name drift** — the spec says `documentId` but the actual handler reads `document_id` (or vice versa)
- **Silent argument stripping** — the wire-handler accepts the argument but ignores it (e.g. validation passes through but the field never reaches the storage-layer)
- **Optional-vs-required asymmetry** — the type says `field?: string` but the handler 500s when omitted

These are exactly the bugs that produce **wrong output on the first live call** — the call succeeds, the response shape looks correct, but the actual semantics diverge from spec. Pre-coding catches them in cold light.

### Anonymized reference

> Plugin-Author X coded a live-adapter against Plugin-Author Y's TS-client surface BEFORE Y's live-activation arrived. The dry-run-as-spec-validation caught 2 real contract-bugs in Y's wire (one arg-naming drift + one silent-arg-stripping) that would have produced wrong outputs in the first live call. Pre-coding pays off even before live-deploy — your adapter IS your contract-fuzz-tester.

### When this pattern applies

| Pattern fits | Pattern doesn't fit |
|---|---|
| You depend on a cross-plugin contract (MCP-tool, RAG-client, REST API) | Your code only consumes Foundation runtime |
| The provider has published types/schemas you can import | The provider hasn't documented the shape at all |
| You can write meaningful unit-fixtures of the response shape | The contract is purely behavioral (e.g. UI-event timing) |
| The provider's roadmap has them live in days-to-weeks | The provider is live now (just integrate normally) |

### How to do it without burning effort

The risk of pre-coding is **wasted work if the contract changes drastically before live-deploy**. Mitigations:

- **Import the provider's published types** if available — those are the authoritative shape, and any spec-doc-drift is the provider's drift to fix
- **Build your adapter behind a `NullAdapter` / `LiveAdapter` interface** so the consumer-code calling-side stays stable even if your impl swaps
- **Commit fixtures alongside the adapter** so future-you (or another CC) can re-run the dry-validation when the contract bumps
- **Report drift back via chatbus #contracts** — pre-coding only pays the cluster if your findings flow back to the provider

### Cross-link

See §12 "Writing Reversible Workarounds" for a related discipline: shipping workarounds with reversal-path-docs so they come out cleanly when the canonical path arrives. Pre-coding and reversible-workarounds are two sides of the same approach: **don't wait for clean conditions, build with the wiring in mind**.

### Real-world reference (anonymized)

A Phase-7-prep plugin in the `@nexus-mindgarden` cluster wrote a `LiveAdapter` against an in-flight `@plug-db/client` TS-surface before the corresponding live-deploy. The adapter compiled, unit-tested clean, and surfaced two real contract-bugs (one argument-naming drift, one silent-argument-stripping) that the upstream provider then fixed in a patch-release. Total elapsed time from adapter-write to drift-resolved: under a working day.

### §13.X Same-Key Idempotency Check — PEM-Compare not Fingerprint-Compare

> Reference-Lesson aus ET-Mind Pass-2 Foundation-Migration (Helper-Lib pattern,
> 2026-05-21, see plug-elec DM #602). Credit: `plug-elec` / ET-Mind Pass-2-author.

**Anti-Pattern (legacy ET-Mind impl, pre-Pass-2):**

```ts
function register(input: RegisterHostInput) {
  const fingerprint = fingerprintPublicKey(input.public_key_pem)
  const existing = repo.get(input.host_id)

  if (existing && existing.fingerprint === fingerprint) {
    // Drift #12 same-key idempotency — preserve user-confirmed status
    return preserveAndMergeMetadata(existing, input)
  }
  return rotateKey(existing, input)
}
```

**Pattern (Foundation v0.5.0 + post-Pass-2 ET-Mind):**

```ts
function register(input: RegisterHostInput) {
  const existing = repo.get(input.host_id)

  // Drift #12 same-key idempotency — PEM-string-compare ist authoritativ
  if (existing && existing.public_key_pem.trim() === input.public_key_pem.trim()) {
    return preserveAndMergeMetadata(existing, input)
  }
  return rotateKey(existing, input)
}
```

**Why PEM-compare is strictly better:**

1. **PEM-string equality is contract.** Two PEMs that compare equal under
   `trim()` are byte-for-byte the same public key — there is no theoretical
   collision space. Fingerprint-string equality requires equal SHA-256 outputs
   *and* equal presentational format. The latter can silently drift.
2. **Fingerprint-format is presentational.** Different Foundation versions can
   choose different formats (continuous-hex `11c5544d…` vs. colon-separated
   `11c5:544d:…` vs. base64). ET-Mind's pre-Pass-2 in-repo mirror used
   continuous-hex; Foundation v0.5.0 `fingerprintPublicKey()` returns
   colon-separated. Same SHA-256 bytes, different strings — naïve
   fingerprint-compare → drift across the boundary → every re-register goes
   to the rotate-branch → Drift #12 idempotency broken silently.
3. **Future-proof.** Foundation `fingerprintPublicKey()` could change again
   (e.g. base64 for QR-code-friendly display). PEM-compare survives all
   format changes by construction.

**Migration-Note:**

Plugins migrating from `fingerprint === fingerprint` to
`public_key_pem.trim() === public_key_pem.trim()` need no data-migration —
the stored `public_key_pem` field is already in every legacy record.
The fingerprint field on disk stays in the legacy-format until next
re-register; this is fine because nothing reads it for same-key checks
anymore.

**Generalisation (pre-coding angle):**

This anekdote also exemplifies §13's main thesis: comparing **contract-bytes**
(PEM is the canonical wire-shape) is stable across implementation-changes;
comparing **presentational-form** (fingerprint-string) is fragile because the
presentational layer can drift while the contract-bytes stay the same.
When pre-coding adapters against contracts, prefer assertions on the
canonical-wire-shape, not on derived/rendered values.

**Reference:** ET-Mind `packages/etmind-bridge/src/auth/host-registry.ts::register()`
(Pass-2 commit `14efe50`, msg #602).

---

> **See also (joint-author wire-protocol cookbook):** [`CROSS-PLUGIN-MCP-CALL-COOKBOOK.md`](./CROSS-PLUGIN-MCP-CALL-COOKBOOK.md) — the multi-author cluster-doc described in §13 is itself a worked-example of the pattern: plug-tmpl + agent + wiz-mind each pre-coded their section against an evolving shared spec, surfacing wire-shape inconsistencies BEFORE the joint-smoke (rather than during it).

---

## 14. References

- [`PLUGIN-BRIDGE-PROTOCOL.md`](https://github.com/MrDewitt88/TeamMindV8/blob/main/docs/PLUGIN-BRIDGE-PROTOCOL.md) — Wire-Spec + mcp_tools Extended Form
- [`PLUGIN-KIARA-INTEGRATION.md`](https://github.com/MrDewitt88/TeamMindV8/blob/main/docs/PLUGIN-KIARA-INTEGRATION.md) — Frag-Kiara
- [`PLUGIN-CSP-CONVENTIONS.md`](https://github.com/MrDewitt88/TeamMindV8/blob/main/docs/PLUGIN-CSP-CONVENTIONS.md) — CSP-Allowlist
- [`PLUGIN-CAPABILITIES.md`](https://github.com/MrDewitt88/TeamMindV8/blob/main/docs/PLUGIN-CAPABILITIES.md) — capabilities[] standard
- [`CROSS-REPO-LESSONS.md`](https://github.com/MrDewitt88/TeamMindV8/blob/main/docs/CROSS-REPO-LESSONS.md) — Drift-Catalog #1-#24
- `docs/templates/` (this repo) — Doc-Templates
- `HOST-INTEGRATION-GUIDE.md` (this repo) — gegenüberliegende Sicht für Plugin-Host-Integration
- **`agent.complete` Contract** — chatbus thread="contracts" 2026-05-21 + Theseus `v0.15.0-agent-complete-endpoint` (commit `51921ff`) + V8 Reverse-Call Design-Y
- **`@theseus/agent-complete-schema`** — canonical Wire-Schema (Theseus monorepo, npm publish pending)
