# {Plugin-Name} — Architecture

> **TEMPLATE.** Copy nach `docs/ARCHITECTURE.md` im Plugin-Provider-Repo + customize. Sections marked `{...}` sind plugin-specific. Keep das `Layer-Plan` + `Cross-Repo-References` Pattern für Konsistenz mit MarkView/Kanban/etc.

---

## 1. Vision

**One-line:** {Was macht dieses Plugin in einem Satz}

**Problem:** {Welches User-Problem löst es}

**Cross-Host-Reach:** {Plugin läuft in welchen Hosts — TeamMindV8, Theseus, FamilyMind, ...}

---

## 2. Component-Stack

```
{plugin-name}/
├── packages/
│   ├── {plugin-name}-bridge/         # uses @nexus/plugin-bridge-foundation
│   ├── {plugin-name}-storage/        # uses @nexus/plugin-storage-foundation (optional)
│   ├── {plugin-name}-svelte/         # uses @nexus/plugin-svelte-foundation
│   └── {plugin-name}-mcp/            # uses @nexus/plugin-mcp-foundation
├── apps/
│   └── {plugin-name}-app/            # Electron app oder dev-server (optional)
└── docs/
    ├── ARCHITECTURE.md               # this doc
    ├── WIRE-PROTOCOL.md              # custom MCP-tools + hooks
    ├── SQLITE-SCHEMA.md              # if SQLite used
    └── CROSS-REPO-LESSONS.md         # plugin-specific drifts
```

---

## 3. Plugin-Manifest

`manifest.yaml` declares:

```yaml
id: {plugin-name}                     # kebab-case 3-64 chars
name:
  de: {Display-Name DE}
  en: {Display-Name EN}
description:
  de: {kurz-beschreibung}
  en: {short description}
version: 0.1.0
distribution:
  type: external-service
  service_endpoint: http://localhost:{port}
compatibility:
  apps: [teammind, theseus]           # which hosts
  min_app_version: 0.5.0
provides:
  routes:                             # if Plugin has UI
    - path: /{plugin-name}
      component_type: web-component
      service_endpoint: /ui/{component-name}
  mcp_tools:                          # MCP-Tools — Extended Form
    - {tool.list}                     # bare-name (host synthesizes <plugin>.<tool>)
    - name: {tool.create}
      description: |
        {tool description}
      input_schema:
        type: object
        required: [{required-fields}]
        properties:
          {field}: { type: {type} }
      scopes_required: [{scope}]
  module_extensions: []               # if Plugin hooks into host-modules (versioning etc.)
  scopes_required: [{plugin-wide-scope}]
ui:
  sidebar_entry:                      # optional Sidebar-Eintrag
    icon: {icon-name}
    label_key: plugin_{plugin-name}_sidebar
    sort_order: 100
```

---

## 4. Data-Model

{IF SQLite: Schema-overview, primary-tables, foreign-keys}
{IF stateless: data-flow + transient-state}

**Persistence-Strategy:** {SQLite via @nexus/plugin-storage-foundation / file-system / in-memory / remote-API}

**Multi-Host-Storage:** {Pattern wie MarkView's `<storageRoot>/<plugin>/<host>/<tenant>/` — siehe @nexus/plugin-storage-foundation `resolvePaths`}

---

## 5. UI-Components (if applicable)

**Custom-Element-Tags:**
- `<plugin-{plugin-name}-{component-1}>` — {purpose}
- `<plugin-{plugin-name}-{component-2}>` — {purpose}

**Bridge-Attrs:** All components reading via `readBridgeAttrs()` from `@nexus/plugin-svelte-foundation` — Standard 8 attrs (bridge-token/endpoint, host-id, tenant-id, user-id, user-locale, actor-class, theme).

**Plus component-specific attrs:**
- `<plugin-{plugin-name}-foo document-id="<uuid>">` — {warum brauchen?}

**Theme:** 16-token convention via `@nexus/plugin-svelte-foundation/theme`. Prefix `--{prefix}-color-*` (e.g. `--mv-color-fg`).

---

## 6. MCP-Tools

| Tool | Description | input_schema | output_schema |
|---|---|---|---|
| `{tool.list}` | {desc} | {key inputs} | {key outputs} |
| `{tool.create}` | {desc} | required={field} | { id, ... } |

**Scope-Hierarchy:**
- plugin-wide floor: `{plugin-wide-scope}`
- per-tool extends: `{tool.create}` extends mit `{write-scope}`

---

## 7. Plugin → Host Events

{IF Plugin dispatches CustomEvents:}

- `plugin:navigate` — {when}
- `plugin:refresh` — {when}
- `plugin:error` — {when}
- `plugin:ask-kiara` — {when} mit `capabilities: [{rendering features}]`

---

## 8. Cross-Repo-References

- `@nexus/plugin-bridge-foundation` — Bridge HTTP-Server
- `@nexus/plugin-storage-foundation` — SQLite + Multi-Host-paths (if applicable)
- `@nexus/plugin-svelte-foundation` — Custom-Element + Theme + bundle-config
- `@nexus/plugin-mcp-foundation` — Tool-Registry + scope-validation

V8/Theseus/FamilyMind Plugin-Standards die dieses Plugin honoriert:
- [`PLUGIN-BRIDGE-PROTOCOL.md`](https://github.com/MrDewitt88/TeamMindV8/blob/main/docs/PLUGIN-BRIDGE-PROTOCOL.md) — Wire-Spec
- [`PLUGIN-KIARA-INTEGRATION.md`](https://github.com/MrDewitt88/TeamMindV8/blob/main/docs/PLUGIN-KIARA-INTEGRATION.md) — Frag-Kiara
- [`PLUGIN-CSP-CONVENTIONS.md`](https://github.com/MrDewitt88/TeamMindV8/blob/main/docs/PLUGIN-CSP-CONVENTIONS.md) — CSP-Allowlist
- [`PLUGIN-CAPABILITIES.md`](https://github.com/MrDewitt88/TeamMindV8/blob/main/docs/PLUGIN-CAPABILITIES.md) — capabilities[] Standard
- [`CROSS-REPO-LESSONS.md`](https://github.com/MrDewitt88/TeamMindV8/blob/main/docs/CROSS-REPO-LESSONS.md) — Drift-Catalog

---

## 9. Layer-Plan (Build-Sequenz)

| Layer | Status | Inhalt |
|---|---|---|
| L1 | {DONE/TODO} | {package-Skelett + manifest} |
| L2 | {DONE/TODO} | {Storage / DB-Schema} |
| L3 | {DONE/TODO} | {MCP-Tools-Implementation} |
| L4 | {DONE/TODO} | {UI-Components} |
| L5 | {DONE/TODO} | {Cross-Repo-Live-Smoke} |
| L6 | {DONE/TODO} | {Production-Build / Marketplace-Ready} |

---

## 10. Out-of-Scope (BACKLOG)

- {Item 1 — warum später}
- {Item 2 — Phase-N condition}
