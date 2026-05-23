# @nexus/plugin-template

> Cross-Repo Plugin-Template für TeamMind/Nexus Plugin-Provider Foundation.

**Status:** v0.1.0 (2026-05-17) — Foundation-Packages production-ready. Layers 1-6 live; L7 CLI in Bearbeitung. Inherited Cross-Repo-Drifts #103/#200/#203/#206 baked-in. Consume via `pnpm add github:MrDewitt88/plugin-template#v0.1.0`.

## Zweck

Foundation-Skeleton für Plugin-Provider die gegen TeamMind-Plugin-Bridge-Protocol implementieren wollen. Hosts: TeamMindV8 (Web/SvelteKit), Theseus/myMind (Electron), FamilyMind (Phase 4 Hard-Fork). Plugin-Examples als Reference: MarkView, KANBAN, ET-Mind.

## Layer-Plan

| Layer | Inhalt | Status |
|---|---|---|
| L1 | Repo-Setup (pnpm-workspace + tsconfig + vitest + prettier + LICENSE + README) | ✅ done |
| L2 | Foundation-Packages: bridge / storage / svelte / mcp | ✅ v0.1.0 |
| L3 | Doc-Templates: ARCHITECTURE / SQLITE-SCHEMA / WIRE-PROTOCOL / CROSS-REPO-LESSONS / COMPANION-DOC / CLAUDE-SETTINGS-LOCAL | ✅ done |
| L4 | PLUGIN-PROVIDER-GUIDE.md | ✅ v0.1.0 |
| L5 | HOST-INTEGRATION-GUIDE.md | ✅ done |
| L6 | CLAUDE-TEMPLATE.md (Engineering-Regeln für Plugin-Provider-CCs) | ✅ done |
| L7 | `@nexus/create-plugin` CLI | ⏳ in progress |

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

## Migration & Adoption

- [`docs/MIGRATION-COOKBOOK.md`](./docs/MIGRATION-COOKBOOK.md) — three battle-tested adoption-patterns (Full-Replace / Helper-Lib / In-Repo-Mirror) with decision-matrix, step-by-step recipes, and drift-discipline guidance
- [`docs/CROSS-PLUGIN-MCP-CALL-COOKBOOK.md`](./docs/CROSS-PLUGIN-MCP-CALL-COOKBOOK.md) — 3-side ko-authored canonical wire-spec for plugin custom-element bundles dispatching MCP-calls through the host's IPC layer (`callMcp()` runtime helper, `plugin:mcp-call/response` CustomEvents, DOM-bubble-direction failure-mode catalog). First cluster-living-pattern-doc from the Wiz-Mind v0.1.0 joint-smoke
- [`docs/PLUGIN-PROVIDER-GUIDE.md`](./docs/PLUGIN-PROVIDER-GUIDE.md) — canonical patterns for plugin authors (render-ui wire-spec, agent.complete contract, JWT-auth, manifest_hash, observability)
- [`docs/HOST-INTEGRATION-GUIDE.md`](./docs/HOST-INTEGRATION-GUIDE.md) — for host-app developers integrating with bridges
- [`CHANGELOG.md`](./CHANGELOG.md) — release notes with cross-repo provenance for each version

## License

MIT — see `LICENSE`.
