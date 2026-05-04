# @nexus/plugin-template

> Cross-Repo Plugin-Template für TeamMind/Nexus Plugin-Provider Foundation.

**Status:** Phase-3.5 in development. Layer 1 (Repo-Setup) live; Layer 2-7 in Bearbeitung.

## Zweck

Foundation-Skeleton für Plugin-Provider die gegen TeamMind-Plugin-Bridge-Protocol implementieren wollen. Hosts: TeamMindV8 (Web/SvelteKit), Theseus/myMind (Electron), FamilyMind (Phase 4 Hard-Fork). Plugin-Examples als Reference: MarkView, KANBAN, ET-Mind.

## Layer-Plan

| Layer | Inhalt | Status |
|---|---|---|
| L1 | Repo-Setup (pnpm-workspace + tsconfig + vitest + prettier + LICENSE + README) | ✅ done |
| L2 | Foundation-Packages: bridge / storage / svelte / mcp | ⏳ next |
| L3 | Doc-Templates: ARCHITECTURE / SQLITE-SCHEMA / WIRE-PROTOCOL / CROSS-REPO-LESSONS / COMPANION-DOC | ⏳ |
| L4 | PLUGIN-PROVIDER-GUIDE.md | ⏳ |
| L5 | HOST-INTEGRATION-GUIDE.md | ⏳ |
| L6 | CLAUDE-TEMPLATE.md (Engineering-Regeln für Plugin-Provider-CCs) | ⏳ |
| L7 | `@nexus/create-plugin` CLI | ⏳ |

## Cross-Repo-Reference

Plugin-Template referenziert TeamMindV8s Cross-Repo-Foundation-Docs:

- `PLUGIN-BRIDGE-PROTOCOL.md` — Wire-Spec (Plugin-Bridge-Endpoints + mcp_tools Extended Form)
- `PLUGIN-KIARA-INTEGRATION.md` — Frag-Kiara Cross-Host-Pattern
- `PLUGIN-CSP-CONVENTIONS.md` — CSP-Allowlist + dynamic-per-plugin
- `PLUGIN-CAPABILITIES.md` — Standard-Capabilities + Custom-Extensions
- `CROSS-REPO-LESSONS.md` — Drift-Catalog #1-#24 + 10 Process-Lessons

Plus Implementation-References:
- **MarkView** (`MrDewitt88/MarkView`) — Production-Plugin-Provider mit 5 Components, Plugin-Bridge, Storage, Theme, Frag-Kiara
- **TeamMind-Kanban** (`MrDewitt88/TeamMind-Kanban`) — Kanban-CC Phase-A Foundation als Companion-Pattern
- **Theseus-Agent** (`MrDewitt88/Theseus-Agent`) — Plugin-Host mit ChatApp-Listener + AgentHost + IPC

## Quick-Start (after L7 lands)

```sh
npx @nexus/create-plugin my-plugin --hosts=teammind,theseus --features=mcp,ui
cd my-plugin
pnpm install
pnpm test
```

## Workspace-Setup

- **Package-Manager:** pnpm 10+ (siehe `package.json` engines + `pnpm.onlyBuiltDependencies`)
- **TypeScript:** 5.6+ strict (siehe `tsconfig.base.json`)
- **Test-Runner:** vitest mit per-package `vitest.config.ts` (Lesson aus MarkView/Kanban: shared workspace-config kann native-binary-Conflicts auslösen)
- **Code-Style:** prettier (siehe `.prettierrc`), no-semi + single-quote + 100-cols

## Foundation-Packages (L2 incoming)

```
packages/
├── plugin-bridge-foundation/    # Hono server + JWT-Auth + handshake/manifest/health/execute-tool/render-ui
├── plugin-storage-foundation/   # SQLite + Multi-Host-Storage-Pattern (optional)
├── plugin-svelte-foundation/    # Web-Components + Theme-Attribut + 16-Token-Convention
└── plugin-mcp-foundation/       # MCP-Server + mcp_tools Extended Form
```

Each package has its own `package.json`, `tsconfig.json`, `vitest.config.ts`, `README.md`.

## License

MIT — see `LICENSE`.
