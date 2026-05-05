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
  service_endpoint: http://localhost:3600
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

## 8. Pre-Drift-Checklist

Vor 1st-Release:

- [ ] All Foundation-Packages installed + workspace tests passing
- [ ] manifest.yaml validates (Foundation `loadManifest` parses ohne error)
- [ ] All MCP-Tools have input_schema + output_schema (Phase-3 Extended Form)
- [ ] All UI-Components long-form customElement mit explicit attribute-mapping (Drift #7)
- [ ] esbuild-bundle: external=[] + nodeBuiltinsStubPlugin (Drift #13/#20+#21)
- [ ] CSP-allowed-origins documented für deployment
- [ ] manifest_hash in /health-Response (Live-Re-Registration support)
- [ ] Cross-Repo-Live-Smoke gegen mindestens einen Production-Host
- [ ] CROSS-REPO-LESSONS.md mit plugin-internal Drifts (#100+ range)
- [ ] CLAUDE.md (siehe `CLAUDE-TEMPLATE.md`) für AI-CC-Workforce-coordination

---

## 9. Production-Deployment

### 9.1 Distribution

| Type | Wann |
|---|---|
| `external-service` | Plugin ist standalone-Server (Bridge auf eigenem port) |
| `embedded` | Phase-4 — Plugin wird in Host-Process geladen (kein eigener server) |

### 9.2 Service-Discovery

Plugin-Bridge in Production läuft auf dedicated host (z.B. localhost:<port> für desktop-app, oder cloud-service für SaaS).

Host-Side `service_endpoint` wird im Plugin-Manifest deklariert. Hosts lesen das beim Activate + speichern in `plugin_activations.service_endpoint`-row.

### 9.3 Multi-Host-Auth

Plugin sollte `autoAccept: false` setzen (privacy-by-default). Hosts ruft `register-host` mit Public-Key + landed pending. User approved via Plugin-Settings-UI.

### 9.4 Versioning

`manifest.version` (semver). Plus `manifest_hash` in /health für Live-Re-Registration. Hosts cachen + diff-en — bei hash-change re-fetch + re-register-capabilities ohne Plugin-Down-Time.

---

## 10. References

- [`PLUGIN-BRIDGE-PROTOCOL.md`](https://github.com/MrDewitt88/TeamMindV8/blob/main/docs/PLUGIN-BRIDGE-PROTOCOL.md) — Wire-Spec + mcp_tools Extended Form
- [`PLUGIN-KIARA-INTEGRATION.md`](https://github.com/MrDewitt88/TeamMindV8/blob/main/docs/PLUGIN-KIARA-INTEGRATION.md) — Frag-Kiara
- [`PLUGIN-CSP-CONVENTIONS.md`](https://github.com/MrDewitt88/TeamMindV8/blob/main/docs/PLUGIN-CSP-CONVENTIONS.md) — CSP-Allowlist
- [`PLUGIN-CAPABILITIES.md`](https://github.com/MrDewitt88/TeamMindV8/blob/main/docs/PLUGIN-CAPABILITIES.md) — capabilities[] standard
- [`CROSS-REPO-LESSONS.md`](https://github.com/MrDewitt88/TeamMindV8/blob/main/docs/CROSS-REPO-LESSONS.md) — Drift-Catalog #1-#24
- `docs/templates/` (this repo) — Doc-Templates
- `HOST-INTEGRATION-GUIDE.md` (this repo) — gegenüberliegende Sicht für Plugin-Host-Integration
