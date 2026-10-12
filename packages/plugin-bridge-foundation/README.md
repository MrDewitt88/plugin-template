# @nexus-mindgarden/plugin-bridge-foundation

Plugin-Bridge HTTP-Server Foundation für TeamMind/Nexus Plugin-Provider.

Implementiert die 7 Plugin-Bridge-v1-Endpoints (handshake/manifest/health/execute-tool/render-ui/invoke-hook + register-host) gemäß [`PLUGIN-BRIDGE-PROTOCOL.md`](https://github.com/MrDewitt88/TeamMindV8/blob/main/docs/PLUGIN-BRIDGE-PROTOCOL.md). Plugin-Provider deklariert sein Manifest + Tool-/Hook-/Render-Handlers; Foundation liefert Hono-Server + JWT-Verify + Multi-Host-Registry.

## Quick Use

Since **0.21.0**, optional `mcpUiResources` supplies authenticated MCP Apps
resource discovery/reads and an optional `mcp_ui` handshake advertisement.
Hosts can use `createMcpUiResourceClient` to adapt these endpoints to MCP
resource methods. See [the provider/host contract](../../docs/MCP-UI-RESOURCES.md).

```ts
import {
  createBridgeApp,
  HostKeyRegistry,
  InMemoryHostKeyRepo,
  loadManifest,
} from '@nexus-mindgarden/plugin-bridge-foundation'
import { serve } from '@hono/node-server' // or Bun.serve

const manifest = await loadManifest('./manifest.yaml')
const registry = new HostKeyRegistry(new InMemoryHostKeyRepo(), {
  autoAccept: false, // privacy-by-default
})

// Bootstrap initial host (z.B. V8) wenn Public-Key bekannt
await registry.register({
  host_id: 'teammind',
  public_key_pem: process.env.V8_PUBLIC_KEY_PEM ?? '',
})
await registry.approve('teammind')

const app = createBridgeApp({
  manifest,
  registry,
  toolHandlers: {
    'documents.list': async (args, ctx) => {
      // your tool logic; ctx has tenantId, userId, hostId, scopes
      return { documents: [] }
    },
  },
  renderUi: async (routePath, ctx) => {
    if (routePath === '/dokumente') {
      return {
        html: '<plugin-mything-docs></plugin-mything-docs>',
        scripts: ['/static/ui/docs.js'],
        styles: [],
      }
    }
    throw { code: 'not_found', message: `route ${routePath} not in manifest` }
  },
  hookHandlers: {
    'notes.versioning.on_save': async (payload, ctx) => {
      // store version
      return { version_id: 'v1' }
    },
  },
})

serve({ fetch: app.fetch, port: 3500 })
```

## Architecture

```
src/
├── server.ts              # createBridgeApp() — Hono factory
├── types.ts               # Wire-Schemas (Zod) + TypeScript types
├── endpoints/
│   ├── handshake.ts       # POST /plugin-bridge/v1/handshake
│   ├── manifest.ts        # GET  /plugin-bridge/v1/manifest
│   ├── health.ts          # GET  /plugin-bridge/v1/health (mit manifest_hash)
│   ├── execute-tool.ts    # POST /plugin-bridge/v1/execute-tool
│   ├── render-ui.ts       # POST /plugin-bridge/v1/render-ui
│   └── invoke-hook.ts     # POST /plugin-bridge/v1/invoke-hook
├── auth/
│   ├── jwt.ts             # Ed25519 JWT-Verify via jose
│   ├── host-keys.ts       # Multi-Host-Registry (Drift #12 Idempotency)
│   └── index.ts           # re-exports
└── manifest/
    ├── hash.ts            # computeManifestHash für Live-Re-Registration
    ├── loader.ts          # YAML-load + Zod-validate
    └── index.ts           # re-exports
```

## Drift-Catalog Cross-Reference

Foundation hat folgende Cross-Repo-Lessons baked-in (siehe [`CROSS-REPO-LESSONS.md`](https://github.com/MrDewitt88/TeamMindV8/blob/main/docs/CROSS-REPO-LESSONS.md)):

- **Drift #6** Hook-Producer Wire-Schema — `invoke-hook` reicht payload durch; Plugin extrahiert id mit fallback-chain (`<module>s_id` plural / `source_id` / `id`)
- **Drift #8** CORS preflight handler — `hono/cors` middleware in `createBridgeApp`
- **Drift #12** Register-Host Idempotency — `HostKeyRegistry.register()` preserves status für same-key
- **Drift #14** render-ui context default — Schema accepts `{}` default + explicit-empty
- **Drift #20+#21** Bare-specifier dynamic-import — build-side concern (esbuild config); siehe `docs/SQLITE-ABI-DANCE.md`-Pattern für native binaries

## Testing

```sh
pnpm test       # run vitest
pnpm typecheck  # tsc --noEmit
```

Tests cover:
- `host-keys.test.ts` — registry-idempotency, fingerprinting, status-resolution (Drift #12)
- `jwt.test.ts` — verify-flow, host-not-registered/pending/rejected paths, malformed-token, missing-claims
- `manifest.test.ts` — validation, Extended-Form mcp_tools, stable-hash determinism

## License

MIT
