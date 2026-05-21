# {Plugin-Name} — Wire Protocol

> **TEMPLATE.** Nur kopieren wenn dein Plugin custom MCP-Tools / Hooks / Render-Endpoints zusätzlich zur Plugin-Bridge-Standard-Endpoints exposiert. Plugin-Bridge-Endpoints (handshake/manifest/health/execute-tool/render-ui/invoke-hook) sind canonical in [`PLUGIN-BRIDGE-PROTOCOL.md`](https://github.com/MrDewitt88/TeamMindV8/blob/main/docs/PLUGIN-BRIDGE-PROTOCOL.md) — diese Datei dokumentiert nur die plugin-spezifischen Tool/Hook/Route Wire-Bodies.

---

## 1. Wire-Convention

- **Format:** snake_case auf der Wire (matched Cross-Repo-Standard)
- **Encoding:** JSON (UTF-8)
- **Auth:** Bearer-Token via Plugin-Bridge-Auth (siehe PROTOCOL.md §"Auth — Plugin-Bridge-Token")
- **Errors:** `{ ok: false, error: { code, message } }` — code in snake_case-namespace

---

## 2. MCP-Tools

### `{plugin}.{tool.list}`

**Description:** {Was macht dieses Tool}

**Scope:** plugin-wide-floor (`{plugin-wide-scope}`)

**Input:**
```json
{
  "filter": "string?",
  "limit": "number?"
}
```

**Output (`ok: true`):**
```json
{
  "items": [
    { "id": "uuid", "title": "string", "created_at": "iso8601" }
  ],
  "total": "number"
}
```

**Errors:**
- `not_found` — {when}
- `invalid_args` — {when}

**Example:**
```bash
curl -X POST http://localhost:{port}/plugin-bridge/v1/execute-tool \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "tool_name": "{tool.list}",
    "arguments": { "limit": 10 },
    "actor_class": "user",
    "tenant_id": "<uuid>",
    "user_id": "<uuid>"
  }'
```

---

### `{plugin}.{tool.create}`

**Description:** {desc}

**Scope:** plugin-wide-floor + per-tool `{write-scope}`

**Input:**
```json
{
  "title": "string (required)",
  "content": "string?"
}
```

**Output (`ok: true`):**
```json
{
  "id": "uuid",
  "title": "string",
  "created_at": "iso8601"
}
```

---

## 3. Module-Hooks (if applicable)

{IF Plugin registriert in `manifest.provides.module_extensions`:}

### `{module}.{capability}.{hook_name}` (e.g. `notes.versioning.on_save`)

**Triggered:** when {host-side condition}

**Input (Host → Plugin):**
```json
{
  "module": "{module}",
  "capability": "{capability}",
  "hook_name": "{hook_name}",
  "payload": {
    "source_id": "uuid",
    "content": "string",
    "user_id": "uuid"
  },
  "tenant_id": "uuid",
  "user_id": "uuid"
}
```

**Output (Plugin → Host):**
```json
{
  "ok": true,
  "result": {
    "version_id": "uuid",
    "version_number": "number"
  }
}
```

**Drift #6 Mitigation:** Plugin akzeptiert sowohl `<module>s_id` plural als auch `source_id` als entity-identifier. Foundation-pattern: extract id mit fallback-chain.

---

## 4. Render-UI Routes (if applicable)

{IF Plugin hat UI-Components:}

### `route_path: /{view-1}` → `<plugin-{plugin}-{component-1}>`

**Bridge-Attrs gesetzt vom Host (siehe @nexus-mindgarden/plugin-svelte-foundation OBSERVED_BRIDGE_ATTRS):**
- `bridge-token`, `bridge-endpoint`, `host-id`, `tenant-id`, `user-id`, `user-locale`, `actor-class`, `theme`

**Plus component-specific attrs:**
- `{custom-id}` — z.B. `document-id`

**Plugin → Host CustomEvents:**
- `plugin:navigate` — when {action}
- `plugin:refresh` — when {action}
- `plugin:error` — when {error condition}
- `plugin:ask-kiara` — when User klickt Frag-Kiara-Button mit context `{view-1}`

---

## 5. Drift-Risk-Reminder

Aus [`CROSS-REPO-LESSONS.md`](https://github.com/MrDewitt88/TeamMindV8/blob/main/docs/CROSS-REPO-LESSONS.md):

- **#3** Wire-Format snake_case — alle Body-Keys snake_case
- **#4** Wire-Schema-Schärfe — Schemas auf BEIDEN Seiten gegen ECHTE-impl validieren
- **#6** Hook-Producer-Wire — `<module>s_id` plural ODER `source_id` ODER `id` accept'd
- **#14** render-ui context — Default `{}` ist Server-Side-Schema, Clients senden explicit
- **#15** Asset-URL — relative URLs wie `/static/ui/<bundle>` — Host resolved via `new URL(href, bridgeEndpoint)`

---

## 6. Versioning

- Wire-Schema-Versions follow plugin `manifest.version` (semver)
- Breaking-Changes erhöhen Major. Plugin-Provider gibt Migration-Path im Changelog
- `manifest_hash` (siehe Plugin-Bridge `/health`-Endpoint) erlaubt Live-Re-Registration ohne Plugin-Down-Time wenn nur capabilities-Drift, kein wire-break

---

## 7. References

- [`PLUGIN-BRIDGE-PROTOCOL.md`](https://github.com/MrDewitt88/TeamMindV8/blob/main/docs/PLUGIN-BRIDGE-PROTOCOL.md) — Standard-Endpoints + mcp_tools Extended Form
- [`PLUGIN-CAPABILITIES.md`](https://github.com/MrDewitt88/TeamMindV8/blob/main/docs/PLUGIN-CAPABILITIES.md) — capabilities[]-Convention
- [`PLUGIN-KIARA-INTEGRATION.md`](https://github.com/MrDewitt88/TeamMindV8/blob/main/docs/PLUGIN-KIARA-INTEGRATION.md) — Frag-Kiara-Pattern
- `@nexus-mindgarden/plugin-mcp-foundation` — Tool-Registry + scope-validation
