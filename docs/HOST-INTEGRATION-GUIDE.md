# Host-Integration-Guide

> Für Plugin-**Hosts** (V8/Theseus/FamilyMind/Future) die Plugin-Provider integrieren wollen. Gegenüberliegende Perspektive zu `PLUGIN-PROVIDER-GUIDE.md`.

**Audience:** Host-Engineering-Teams. Plus AI-CC-Workforce auf Host-Seite.

---

## 1. Was ein Plugin-Host bietet

Plugin-Host providet Plugins:

1. **Activation-Lifecycle** — pending → active → suspended → deactivated
2. **Auth** — Ed25519 JWT-issue + verify
3. **MCP-Routing** — `<plugin>.<tool>`-Calls von Agent → Plugin-Bridge
4. **UI-Mount** — Plugin-Custom-Elements in Host-Browser-Tab/Renderer
5. **Module-Hooks** — Host-Module-Events (notes.versioning.on_save) → Plugin-Hooks
6. **Settings-UI** — User can activate/deactivate plugins, approve hosts, configure plugin-storage

---

## 2. Activation-Lifecycle

### 2.1 State-Machine

```
        activate()
pending ---------> active <----+
                    | |        |
                    | | suspend resume
                    | v        |
                    suspended -+
                    |
                    | deactivate()
                    v
              deactivated
```

### 2.2 Required DB-Tables

```sql
-- plugins (system-wide registry)
CREATE TABLE plugins (
  plugin_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,           -- JSON i18n
  version TEXT NOT NULL,
  distribution_type TEXT NOT NULL,
  service_endpoint TEXT
);

-- plugin_activations (per-tenant on/off)
CREATE TABLE plugin_activations (
  id TEXT PRIMARY KEY,          -- UUID
  plugin_id TEXT NOT NULL REFERENCES plugins(plugin_id),
  tenant_id TEXT NOT NULL,
  activated_at TEXT NOT NULL,
  activated_by_user_id TEXT NOT NULL,
  bridge_token TEXT NOT NULL,
  bridge_token_expires_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  last_health_check_at TEXT,
  last_manifest_hash TEXT,      -- Phase-3 Live-Re-Registration
  UNIQUE (plugin_id, tenant_id)
);

-- plugin_capabilities (registered routes/mcp_tools/module_extensions)
CREATE TABLE plugin_capabilities (
  id TEXT PRIMARY KEY,
  plugin_activation_id TEXT NOT NULL REFERENCES plugin_activations(id) ON DELETE CASCADE,
  capability_type TEXT NOT NULL CHECK (capability_type IN ('route', 'mcp_tool', 'module_extension')),
  capability_data TEXT NOT NULL  -- JSON
);

-- plugin_permissions (granted scopes für bridge_token)
CREATE TABLE plugin_permissions (
  id TEXT PRIMARY KEY,
  plugin_activation_id TEXT NOT NULL REFERENCES plugin_activations(id) ON DELETE CASCADE,
  scope TEXT NOT NULL,
  UNIQUE (plugin_activation_id, scope)
);
```

### 2.3 Activate-Flow

```ts
async function activatePlugin(ctx, { pluginId }) {
  requireAdmin(ctx)

  const manifest = await loadManifest(pluginId)  // from local-snapshot
  validateCompatibility(manifest, ctx.hostId, ctx.hostVersion)
  const license = await checkLicense(pluginId, ctx)
  if (!license.allowed) throw new PluginLicenseError(license.reason)

  const issued = await jwtSigner.sign({
    pluginId, tenantId: ctx.tenantId, userId: ctx.userId,
    hostId: ctx.hostId, scopes: manifest.provides.scopes_required,
  })

  // Handshake — fail-fast vor DB-Insert
  const handshake = await bridgeHandshake({
    serviceEndpoint: manifest.distribution.service_endpoint,
    bridgeToken: issued.accessToken,
    handshake: { plugin_id: pluginId, host_id: ctx.hostId, ... },
  })
  if (handshake.health !== 'ok') throw new PluginActivationConflictError(...)

  // DB-Insert/Update activation
  // Plus replace-existing plugin_capabilities + plugin_permissions
  await registerCapabilitiesAndPermissions(ctx.db, activationId, manifest)

  return activation
}
```

---

## 3. JWT-Bridge-Token-Issue

```ts
import { SignJWT } from 'jose'

async function issueBridgeToken(opts) {
  const jwt = await new SignJWT({
    plugin_id: opts.pluginId,
    host_id: opts.hostId,
    tenant_id: opts.tenantId,
    user_id: opts.userId,
    scopes: opts.scopes,
  })
    .setProtectedHeader({ alg: 'EdDSA' })
    .setIssuer(opts.issuer)
    .setSubject(opts.pluginId)
    .setJti(crypto.randomUUID())
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(opts.privateKey)
  return { accessToken: jwt, expiresAt: ... }
}
```

**Multi-Host-Setup:** jeder Host hat eigenes Ed25519-Keypair. Public-Key wird beim ersten Activate via `register-host` an Plugin-Bridge geschickt; Plugin-Side approval landed Host als active in dessen `mv_host_keys`-equivalent.

---

## 4. MCP-Tool-Routing

### 4.1 Tool-Synthesis

Plugin manifest declared bare-names (`documents.list`). Host synthesizes namespaced names für eigene MCP-Pipeline:

```ts
import { synthesizeNamespacedName } from '@nexus-mindgarden/plugin-mcp-foundation'

// Plugin manifest mcp_tools: ['documents.list', { name: 'documents.create', ... }]
// Host adds prefix:
//   'markview.documents.list'
//   'markview.documents.create'

async function loadPluginToolsForTenant(db, tenantId) {
  const activations = await db.select(...).where({ tenantId, status: 'active' })
  const tools = []
  for (const act of activations) {
    const caps = await db.select(...).where({ plugin_activation_id: act.id, capability_type: 'mcp_tool' })
    for (const cap of caps) {
      const bareName = (cap.capability_data as any).tool_name
      tools.push({
        name: synthesizeNamespacedName(act.plugin_id, bareName),
        // attach metadata für agent
      })
    }
  }
  return tools
}
```

### 4.2 Tool-Call-Routing

Wenn Agent calls `markview.documents.list`:

```ts
async function callPluginTool(ctx, namespacedName, args) {
  const parsed = parseNamespacedName(namespacedName)
  if (!parsed) throw new Error('not a plugin tool')

  const conn = await lookupActivePluginByPluginId(ctx.db, ctx.tenantId, parsed.pluginId)
  if (!conn) throw new Error('plugin not active')

  // Forward to plugin via bridgeExecuteTool
  return bridgeExecuteTool({
    serviceEndpoint: conn.serviceEndpoint,
    bridgeToken: conn.bridgeToken,
    request: {
      tool_name: parsed.bareName,
      arguments: args,
      actor_class: ctx.actorClass,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
    },
  })
}
```

---

## 5. Plugin-UI-Mount

### 5.1 Catch-All-Route

V8s Pattern (SvelteKit):

```ts
// apps/host/src/routes/(app)/plugins/[plugin_id]/[...path]/+page.server.ts
export const load: ServerLoad = async ({ locals, params, cookies }) => {
  const conn = await lookupActivePluginByPluginId(...)
  const ui = await renderPluginRouteByPluginId(ctx, params.plugin_id, '/' + params.path)
  // Resolve relative URLs
  const resolveUrl = (href) => new URL(href, conn.serviceEndpoint).toString()
  // Inject bridge-attrs server-side (Drift #7 race-condition mitigation)
  const bridgeAttrs = {
    'bridge-token': conn.bridgeToken,
    'bridge-endpoint': conn.serviceEndpoint,
    'host-id': 'teammind',
    'tenant-id': locals.auth.tenantId,
    'user-id': locals.auth.userId,
    'user-locale': 'de',
    'actor-class': locals.auth.userType === 'human' ? 'user' : 'agent',
    theme: cookies.get('tm-theme') === 'dark' ? 'dark' : 'light',
  }
  return {
    ui: {
      html: injectAttrs(ui.html, bridgeAttrs),
      scripts: ui.scripts.map(resolveUrl),
      styles: ui.styles.map(resolveUrl),
    },
  }
}
```

### 5.2 Page-Mount (Svelte/React/etc)

```svelte
<!-- +page.svelte -->
<script>
  import { goto, invalidateAll } from '$app/navigation'

  $effect(() => {
    const shell = shellEl
    // 4 listener für plugin→host events
    shell.addEventListener('plugin:navigate', e => goto(`/plugins/${data.pluginId}${e.detail.route_path}`))
    shell.addEventListener('plugin:refresh', () => invalidateAll())
    shell.addEventListener('plugin:error', e => console.error(e.detail))
    shell.addEventListener('plugin:ask-kiara', e => openKiaraDialog(e.detail))

    // Lazy-load scripts
    for (const src of data.ui.scripts) {
      const s = document.createElement('script')
      s.type = 'module'; s.src = src
      document.head.appendChild(s)
    }
  })
</script>

<div bind:this={shellEl}>{@html data.ui.html}</div>
```

### 5.3 CSP-Allowlist

Plugin-Host muss CSP setzen die Plugin-Bridge-Origins + WASM erlauben:

```
Content-Security-Policy:
  script-src 'self' http://127.0.0.1:* 'wasm-unsafe-eval';
  connect-src 'self' http://127.0.0.1:*;
  style-src 'self' http://127.0.0.1:* 'unsafe-inline';
  img-src 'self' http: https: blob: data:;
  font-src 'self' http://127.0.0.1:* data:;
  worker-src 'self' blob:;
```

Siehe [`PLUGIN-CSP-CONVENTIONS.md`](https://github.com/MrDewitt88/TeamMindV8/blob/main/docs/PLUGIN-CSP-CONVENTIONS.md) für full spec.

---

## 6. Module-Hooks (Host fired Events an Plugins)

Host Module emittiert Events nach state-changes:

```ts
// In notes-module
async function updateNoteHandler(ctx, id, changes) {
  // ... DB-update ...
  await ctx.audit.write({ ... })

  // Hook fan-out
  await ctx.pluginHooks?.('notes', 'versioning', 'on_save', {
    source_id: noteId,        // Drift #6: canonical
    note_id: noteId,          // backward-compat
    content: serializeNote(after),
    user_id: ctx.userId,
  })
}

// pluginHooks-Implementation
async function invokePluginHooks(ctx, module, capability, hookName, payload) {
  const caps = await lookupPluginHooks(ctx.db, ctx.tenantId, module, capability)
  for (const cap of caps) {
    const endpoint = cap.capability_data.hook_endpoints[hookName]
    if (!endpoint) continue
    // Failure-isolated — Plugin-error blockt Save-Pfad nicht
    await bridgeInvokeHook({
      serviceEndpoint: cap.service_endpoint,
      bridgeToken: cap.bridge_token,
      request: { module, capability, hook_name: hookName, payload, ... },
    }).catch(err => console.error('hook fan-out failed:', err))
  }
}
```

---

## 7. Health-Monitor + Live-Re-Registration

### 7.1 Health-Check-Loop

Background-Worker pollst alle 5 Min für jede active Activation:

```ts
async function runHealthMonitorOnce(db) {
  for (const act of activeActivations) {
    const health = await bridgeHealthCheck({ serviceEndpoint, bridgeToken })
    if (health.status === 'ok') {
      await db.update(...).set({ last_health_check_at: new Date() })

      // Phase-3 Live-Re-Registration
      if (health.manifest_hash && health.manifest_hash !== act.last_manifest_hash) {
        const manifest = await bridgeFetchManifest({ serviceEndpoint, bridgeToken })
        await reRegisterCapabilitiesAndPermissions(db, act.id, manifest)
        await db.update(...).set({ last_manifest_hash: health.manifest_hash })
      }
    } else {
      await db.update(...).set({ status: 'suspended' })
    }
  }
}
```

### 7.2 Re-Registration

Replace-existing-Pattern:

```sql
DELETE FROM plugin_capabilities WHERE plugin_activation_id = $1;
DELETE FROM plugin_permissions WHERE plugin_activation_id = $1;
-- INSERT new rows from manifest.provides
```

Atomic — DB-Transaction wraps both DELETEs + INSERTs.

---

## 8. Frag-Kiara-Pattern (Host-Side)

`plugin:ask-kiara`-CustomEvent von Plugin → Host opens Kiara-Dialog mit Plugin-Context. Siehe [`PLUGIN-KIARA-INTEGRATION.md`](https://github.com/MrDewitt88/TeamMindV8/blob/main/docs/PLUGIN-KIARA-INTEGRATION.md) §4.

```ts
import { buildKiaraContext, buildPluginSystemPrompt } from './kiara-bridge'

const onAskKiara = (e) => {
  const detail = e.detail
  askKiaraOpen = true
  askKiaraContext = buildKiaraContext(pluginId, detail)
  askKiaraPromptHint = buildPluginSystemPrompt(pluginId, detail)
  askKiaraGreeting = detail.suggested_prompt
}
```

V8s implementation in `apps/host/src/routes/(app)/plugins/[plugin_id]/[...path]/+page.svelte`. Theseus' analog in `apps/mymind/src/renderer-main/ChatApp.svelte` (siehe Theseus' Companion-Doc).

---

## 9. Multi-Host-Auth-Setup

Wenn Plugin-Bridge mehreren Hosts dient (z.B. MarkView served V8 + Theseus simultan):

### 9.1 Host-Side: Public-Key Bootstrap

```sh
# V8: write public-key zu shared-location
JWT_PUBLIC_KEY_PEM=... > /tmp/v8-jwt-public-key.pem
```

Plugin-Bridge picks up beim Boot.

### 9.2 Host-Side: register-host (post-bootstrap-rotations)

Wenn Public-Key rotiert (post-deploy oder host-key-rotation), Host calls Plugin's register-host:

```ts
await fetch(`${pluginEndpoint}/plugin-bridge/v1/register-host`, {
  method: 'POST',
  body: JSON.stringify({
    host_id: 'teammind',
    public_key_pem: newPublicKey,
  }),
})
```

Plugin-Bridge resets host zu pending (User-Re-Confirm). Drift #12 idempotency: same-key preserves status.

---

## 10. Settings-UI für Plugin-Management

Host bietet User folgende Plugin-Settings:

- **Plugin-Activation:** activate/deactivate per plugin per tenant
- **Plugin-Storage-Folder:** wo Plugin-Daten liegen (siehe MarkView Phase-2 Trigger 2)
- **Multi-Host-Approval (Plugin-Side):** wenn Host gleichzeitig Plugin-Bridge ist (rare)

UI-Pattern Reference: V8 `/einstellungen/plugins` + Theseus App-Settings → Plugins-Tab.

---

## 11. Plugin-Branding & Favicon

Plugins servieren ein `/favicon.ico` auf ihrem `service_endpoint` (Pflicht-Spec siehe `PLUGIN-PROVIDER-GUIDE.md §8`). Hosts sollten das Asset in ihrer UI anzeigen damit User Plugins visuell unterscheiden können.

### 11.1 Probe-Pattern

```html
<img
  src="${service_endpoint}/favicon.ico"
  alt="${pluginName}"
  width="20"
  height="20"
  style="border-radius: 4px; object-fit: contain;"
  onerror="this.replaceWith(buildLetterFallback('${pluginName.charAt(0)}'))"
/>
```

Cascade-Pattern (Standard-Web-Convention): `/favicon.ico` → `/favicon.png` → `/apple-touch-icon.png`. Host kann alle drei probt + nimmt den ersten 200-Response.

### 11.2 Surfaces

Empfohlen für 3 UI-Loci:

| Surface | Größe | Beispiel-Host |
|---|---|---|
| Sidebar-Launcher-Button | ≈ 20×20, border-radius 4px | Theseus Sidebar (`c34f0d8`) |
| Plugin-Banner-Header über mounted Plugin-UI | ≈ 24×24 | Theseus Banner |
| Plugin-Catalog/Marketplace-Card | ≈ 64×64 | Nexus-Marketplace (Phase-N) |

### 11.3 Failure-Modes (alle → Letter-Fallback ohne Konsole-Fehler)

- HTTP 401/403/404
- Network error (Plugin-Bridge down)
- Wrong Content-Type
- Image-decode-error

Wichtig: Host's `<img>`-Tag kann **kein** Bearer-Header schicken → Plugin-Endpoint MUSS unauthenticated sein. Wenn Plugin-Service generelles Bearer-Required hat, eigenen Bypass für `/favicon.*` einbauen.

### 11.4 Caching

Plugin sollte `Cache-Control: max-age=86400` setzen (1 Tag — Rebrand propagiert innerhalb 24h). KEIN `immutable` weil das Asset sich pro Plugin-Version ändern kann.

### 11.5 Reference

- Spec: `PLUGIN-PROVIDER-GUIDE.md §8` (Plugin-Side)
- Theseus Implementation: `apps/mymind/src/renderer-main/` (Sidebar + Banner, commit `c34f0d8`)
- MarkView Implementation: `packages/plugin-bridge/src/handlers/favicon.ts` (commit `e6e7550`)
- Convention etabliert: shared.md 17511 + 17632 (Theseus-CC, 2026-05-11)

---

## 12. Pre-Drift-Checklist Host-Side

Vor Production-Release:

- [ ] CSP-Allowlist konfiguriert mit `'wasm-unsafe-eval'` + plugin-origins
- [ ] OPTIONS-Preflight-Handler funktional (cors-middleware oder analog)
- [ ] Bridge-Token-Issue mit `host_id`-claim im JWT
- [ ] Activation-Flow mit license-check + handshake-fail-fast
- [ ] Health-Monitor-Worker läuft (5min-Tick)
- [ ] Live-Re-Registration via manifest_hash implemented
- [ ] Buffer-Polyfill für Browser-Renderer (Drift #19)
- [ ] Theme-Attribut-Setting auf Plugin-Custom-Elements (Cross-Repo-Convention)
- [ ] Plugin→Host Event-Listeners (4 events: navigate/refresh/error/ask-kiara)
- [ ] Manifest-Cache-Refresh-Pattern (pull-on-activate oder manual)
- [ ] Plugin-Favicon-Probe in Sidebar + Banner mit Letter-Fallback (§11)

---

## 13. Host-Companion-Docs

Per-Host implementation-specifics (Identity-Modell, Keypair-Source, Tenant-Mapping, etc.) leben als Companion-Docs im jeweiligen Host-Repo. Plugin-Template's `HOST-INTEGRATION-GUIDE.md` (dieses Dokument) bleibt high-level Cross-Repo-Vertrag; Host-Specifics werden per Companion-Link referenziert. Pattern aligned mit `PLUGIN-KIARA-INTEGRATION.md §4.4` (Cross-Repo bereits etabliert für die Frag-Kiara-Integration).

| Host | Companion-Doc |
|---|---|
| **TeamMindV8** | inline in diesem Guide (§§1-11); Engineering-Reference: `MrDewitt88/TeamMindV8/CLAUDE.md` + `docs/teammind-v8-A2S.md` |
| **Theseus/myMind** | [PLUGIN-TEMPLATE-HOST-SECTION-THESEUS.md](https://github.com/MrDewitt88/Theseus-Agent/blob/main/docs/PLUGIN-TEMPLATE-HOST-SECTION-THESEUS.md) — Identity (single-user-multi-agent), file-based Keypair-Persistence (`~/.theseus/plugins/keys/`), `/register-tenants` agent-mapping, Persona-Layer-Integration |
| **FamilyMind** | tbd (Phase 4 Hard-Fork) |
| **KANBAN, ET-Mind** (future) | tbd (Phase-3.5+ Adoption) |

Pattern skaliert linear: pro neuem Host eine zusätzliche Tabellenzeile + Companion-Doc im Host-Repo. Plugin-Template-Guide bleibt Host-agnostic.

---

## 14. References

- V8s implementation as reference: `MrDewitt88/TeamMindV8`:
  - `packages/plugins/src/server/` — activation/health-monitor/routing/sidebar
  - `apps/host/src/routes/(app)/plugins/[plugin_id]/[...path]/` — UI-Mount
  - `apps/host/src/lib/core/plugins/kiara-bridge.ts` — Frag-Kiara-Builder

- Theseus' Companion-Docs: `MrDewitt88/Theseus-Agent/docs/PLUGIN-KIARA-INTEGRATION-THESEUS.md`, `MrDewitt88/Theseus-Agent/docs/PLUGIN-TEMPLATE-HOST-SECTION-THESEUS.md`

- Foundation-Packages (this repo):
  - `@nexus-mindgarden/plugin-bridge-foundation` — wenn Host gleichzeitig Plugin-Provider ist
  - `@nexus-mindgarden/plugin-mcp-foundation/tools/naming` — synthesizeNamespacedName / parseNamespacedName

- Cross-Repo-Standards:
  - [PLUGIN-BRIDGE-PROTOCOL.md](https://github.com/MrDewitt88/TeamMindV8/blob/main/docs/PLUGIN-BRIDGE-PROTOCOL.md)
  - [PLUGIN-KIARA-INTEGRATION.md](https://github.com/MrDewitt88/TeamMindV8/blob/main/docs/PLUGIN-KIARA-INTEGRATION.md)
  - [PLUGIN-CSP-CONVENTIONS.md](https://github.com/MrDewitt88/TeamMindV8/blob/main/docs/PLUGIN-CSP-CONVENTIONS.md)
  - [CROSS-REPO-LESSONS.md](https://github.com/MrDewitt88/TeamMindV8/blob/main/docs/CROSS-REPO-LESSONS.md)
