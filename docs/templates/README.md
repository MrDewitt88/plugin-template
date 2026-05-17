# Plugin-Provider Doc-Templates

Templates für Plugin-Provider die ein neues Plugin gegen TeamMind/Nexus Plugin-Bridge-Protocol bauen. Copy nach `docs/` im Plugin-Provider-Repo + customize. Sections marked `{...}` sind plugin-specific.

## Templates

| Template | When to use |
|---|---|
| [`ARCHITECTURE-TEMPLATE.md`](./ARCHITECTURE-TEMPLATE.md) | **Pflicht** für jedes Plugin. Vision + Component-Stack + Manifest + Data-Model + Layer-Plan. |
| [`SQLITE-SCHEMA-TEMPLATE.md`](./SQLITE-SCHEMA-TEMPLATE.md) | Optional — wenn Plugin SQLite nutzt (siehe `@nexus/plugin-storage-foundation`). |
| [`WIRE-PROTOCOL-TEMPLATE.md`](./WIRE-PROTOCOL-TEMPLATE.md) | Wenn Plugin custom MCP-Tools/Hooks/Render-Routes hat. Standard-Endpoints sind canonical in V8 PLUGIN-BRIDGE-PROTOCOL.md. |
| [`CROSS-REPO-LESSONS-TEMPLATE.md`](./CROSS-REPO-LESSONS-TEMPLATE.md) | Plugin-internal Drift-Catalog (#100+ range). Cross-Repo-adopted Lessons aus V8s canonical-#1-#24. |
| [`COMPANION-DOC-PATTERN.md`](./COMPANION-DOC-PATTERN.md) | Meta-Pattern: wann/wie Plugin-Host Companion-Docs schreibt für Spec-Implementation-Reality. |
| [`CLAUDE-SETTINGS-LOCAL-TEMPLATE.md`](./CLAUDE-SETTINGS-LOCAL-TEMPLATE.md) | Auto-Classifier-Override-Convention für Claude-Code in Plugin-Provider-Repos. Cross-Repo etabliert 2026-05-17. |

## Recommended Reading-Order

1. **`ARCHITECTURE-TEMPLATE.md`** zuerst — gesamtes Plugin-Mental-Model
2. **`WIRE-PROTOCOL-TEMPLATE.md`** wenn Tools/Hooks/Routes custom
3. **`SQLITE-SCHEMA-TEMPLATE.md`** wenn Storage involved
4. **`CROSS-REPO-LESSONS-TEMPLATE.md`** kontinuierlich während Implementation pflegen
5. **`COMPANION-DOC-PATTERN.md`** wenn dein Plugin auch als Plugin-Host fungiert

## Foundation-Cross-Reference

Jeder Template referenziert die @nexus-Foundation-Packages:

- `@nexus/plugin-bridge-foundation` — HTTP-Server + Auth + Manifest
- `@nexus/plugin-storage-foundation` — SQLite + Migrations + Multi-Host-Paths
- `@nexus/plugin-svelte-foundation` — Custom-Element + Theme + Bundle-Config
- `@nexus/plugin-mcp-foundation` — Tool-Registry + Scope-Validation + Naming

Plus V8 main canonical Standards:

- [`PLUGIN-BRIDGE-PROTOCOL.md`](https://github.com/MrDewitt88/TeamMindV8/blob/main/docs/PLUGIN-BRIDGE-PROTOCOL.md)
- [`PLUGIN-KIARA-INTEGRATION.md`](https://github.com/MrDewitt88/TeamMindV8/blob/main/docs/PLUGIN-KIARA-INTEGRATION.md)
- [`PLUGIN-CSP-CONVENTIONS.md`](https://github.com/MrDewitt88/TeamMindV8/blob/main/docs/PLUGIN-CSP-CONVENTIONS.md)
- [`PLUGIN-CAPABILITIES.md`](https://github.com/MrDewitt88/TeamMindV8/blob/main/docs/PLUGIN-CAPABILITIES.md)
- [`CROSS-REPO-LESSONS.md`](https://github.com/MrDewitt88/TeamMindV8/blob/main/docs/CROSS-REPO-LESSONS.md)
