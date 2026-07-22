// Template file-strings + paths. Plugin-Provider-Skelett — Foundation-
// Patterns + Placeholders. CLI rendert + writes diese files in target-dir.

export interface TemplateFile {
  /** Relative path to repo-root, may contain placeholders */
  path: string
  /** File-content with {{placeholders}} */
  content: string
  /** Optional: only include if this feature in --features=... */
  feature?: 'bridge' | 'storage' | 'svelte' | 'mcp'
}

const PACKAGE_JSON_ROOT = `{
  "name": "{{pluginName}}",
  "version": "0.0.1",
  "description": "{{pluginNamePascal}} Plugin",
  "private": true,
  "type": "module",
  "license": "MIT",
  "engines": {
    "node": ">=24",
    "pnpm": ">=10"
  },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "build": "pnpm -r build",
    "bundle": "node scripts/pack-bundle.mjs"
  },
  "devDependencies": {
    "@types/node": "^24.0.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  },
  "pnpm": {
    "onlyBuiltDependencies": [
      "better-sqlite3",
      "esbuild"
    ]
  }
}
`

const PNPM_WORKSPACE = `packages:
  - 'packages/*'
`

const TSCONFIG_BASE = `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["node"],
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
`

const TSCONFIG_ROOT = `{
  "extends": "./tsconfig.base.json",
  "include": [],
  "references": []
}
`

const VITEST_WORKSPACE = `import { defineWorkspace } from 'vitest/config'

export default defineWorkspace(['packages/*/vitest.config.ts'])
`

const GITIGNORE = `node_modules/
dist/
build/
.turbo/
.cache/
*.tsbuildinfo
coverage/
*.log
.vscode/
.idea/
.DS_Store
.env
.env.local
*.key
*.pem
storage/
plugins/
`

const LICENSE = `MIT License

Copyright (c) {{year}} {{pluginNamePascal}} contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
`

const README = `# {{pluginName}}

> {{pluginNamePascal}} Plugin — built mit @nexus Plugin-Foundation.

**Status:** Pre-1st-release.

## Quick Start

\`\`\`sh
pnpm install
pnpm test
\`\`\`

## Hosts

Targets: {{hosts}}

## Features

Foundation-Packages: {{features}}

## Architecture

See \`docs/ARCHITECTURE.md\` for component-stack + manifest + data-model.

## Engineering Rules

See \`CLAUDE.md\` for engineering-rules + cross-repo-coordination-pattern.

## License

MIT — see \`LICENSE\`
`

const CLAUDE_MD = `# {{pluginNamePascal}} — Engineering-Regeln

> Generated from @nexus-mindgarden/create-plugin. Customize §6 Plugin-Specific-Rules.
> Reference: \`@nexus-mindgarden/plugin-template\` docs/CLAUDE-TEMPLATE.md

## 0. Identität

Du bist \`{{pluginName}}-cc\` — Claude-Code-Instance im {{pluginName}} Repo.

\`\`\`sh
export TM_KANBAN_ACTOR="{{pluginName}}-cc"
export TM_BROADCAST_URL="http://127.0.0.1:3000/api/shared-notes/broadcast"
\`\`\`

## 1. Non-Negotiable Rules

- snake_case auf der Wire
- Test-First für Foundation-extending-Code
- Drift-Discipline — plugin-internal Drifts in docs/CROSS-REPO-LESSONS.md range #100+
- Branch-Discipline: feat/<name>, fix/<name>, docs/<name>
- Keine Auto-Attribution in Commits

## 2. Cross-Repo-Coordination

\`\`\`sh
# Was wartet auf mich?
kanban list --assignee=\$TM_KANBAN_ACTOR --status=todo

# Cross-Repo-Anforderung
kanban create "<title>" --repo=<TargetRepo> --assignee=<target>-cc

# Status-Update
kanban comment t_abc123 "<text>"
\`\`\`

## 6. Plugin-Specific-Rules

> Customize this section.

- DB-Tables-Prefix: \`{{pluginPrefix}}_*\`
- CSS-Custom-Properties: \`--{{pluginPrefix}}-color-*\`
- Custom-Element-Tags: \`plugin-{{pluginName}}-<component>\`

## References

- Plugin-Template: https://github.com/MrDewitt88/plugin-template
- V8 Cross-Repo-Lessons: https://github.com/MrDewitt88/TeamMindV8/blob/main/docs/CROSS-REPO-LESSONS.md
- Plugin-Bridge-Protocol: https://github.com/MrDewitt88/TeamMindV8/blob/main/docs/PLUGIN-BRIDGE-PROTOCOL.md

Volle Engineering-Regeln-Reference: \`@nexus-mindgarden/plugin-template\` docs/CLAUDE-TEMPLATE.md
`

const MANIFEST_YAML = `id: {{pluginName}}
name:
  de: {{pluginNamePascal}}
  en: {{pluginNamePascal}}
description:
  de: {{pluginNamePascal}} Plugin
  en: {{pluginNamePascal}} Plugin
version: 0.1.0
distribution:
  type: external-service
  # Drift #203: use 127.0.0.1, never localhost (Browser-CSP treats loopback
  # variants as distinct origins). The port here is the STANDALONE-DEV default —
  # under a host the plugin MUST bind the host-assigned env PLUGIN_BRIDGE_PORT
  # (see packages/{{pluginName}}-bridge/src/index.ts). agent #6044 (plugin-rollout).
  service_endpoint: http://127.0.0.1:3600
compatibility:
  apps: [{{hosts}}]
  min_app_version: 0.5.0
provides:
  routes: []
  mcp_tools: []
  module_extensions: []
  scopes_required: []
`

const ARCHITECTURE_MD = `# {{pluginNamePascal}} — Architecture

> Generated from @nexus-mindgarden/create-plugin. Customize sections marked {...}.

## 1. Vision

**One-line:** {Was macht {{pluginNamePascal}} in einem Satz}

## 2. Component-Stack

\`\`\`
{{pluginName}}/
├── packages/
{{#if features.bridge}}│   ├── {{pluginName}}-bridge/        # @nexus-mindgarden/plugin-bridge-foundation
{{/if}}{{#if features.storage}}│   ├── {{pluginName}}-storage/       # @nexus-mindgarden/plugin-storage-foundation
{{/if}}{{#if features.svelte}}│   ├── {{pluginName}}-svelte/        # @nexus-mindgarden/plugin-svelte-foundation
{{/if}}{{#if features.mcp}}│   └── {{pluginName}}-mcp/           # @nexus-mindgarden/plugin-mcp-foundation
{{/if}}└── docs/
    ├── ARCHITECTURE.md           # this doc
    └── CROSS-REPO-LESSONS.md
\`\`\`

## 3. Plugin-Manifest

See \`manifest.{{pluginName}}.yaml\` — Hosts: {{hosts}}.

## 4-10. {Customize from docs/templates/ARCHITECTURE-TEMPLATE.md}

Reference: https://github.com/MrDewitt88/plugin-template/blob/main/docs/templates/ARCHITECTURE-TEMPLATE.md

## References

- Plugin-Template: https://github.com/MrDewitt88/plugin-template
- @nexus Foundation-Packages
`

// --- Bridge feature ---

const PKG_BRIDGE_JSON = `{
  "name": "{{pluginName}}-bridge",
  "version": "0.0.1",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "typecheck": "tsc --noEmit -p tsconfig.json"
  },
  "dependencies": {
    "@nexus-mindgarden/plugin-bridge-foundation": "^0.12.0",
    "@nexus-mindgarden/plugin-mcp-foundation": "^0.6.0",
    "@hono/node-server": "^1.13.0",
    "hono": "^4.6.0"
  },
  "devDependencies": {
    "@types/node": "^24.0.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
`

const PKG_BRIDGE_TSCONFIG = `{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"]
}
`

const PKG_BRIDGE_VITEST = `import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: { name: '{{pluginName}}-bridge', include: ['test/**/*.test.ts'], environment: 'node' },
})
`

const PKG_BRIDGE_INDEX = `import {
  createBridgeApp,
  discoverManifest,
  HostKeyRegistry,
  InMemoryHostKeyRepo,
  type ToolHandler,
} from '@nexus-mindgarden/plugin-bridge-foundation'

const documentsList: ToolHandler = async (_args, _ctx) => {
  // TODO: implement {{pluginName}} list
  return { items: [] }
}

export async function createApp() {
  // Dual-read manifest.<id>.yaml (fallback: deprecated manifest.yaml) from the
  // plugin root — CODEX-REV §13.8.
  const { manifest } = await discoverManifest('.')
  const registry = new HostKeyRegistry(new InMemoryHostKeyRepo(), {
    // Host-managed bundled plugin: der Host (myMind) spawnt diesen Prozess und
    // ist der einzige Loopback-Caller — er IST die Trust-Root. Deshalb seinen
    // register-host automatisch akzeptieren (erkannt an PLUGIN_BRIDGE_PORT, das
    // der Host beim Spawn setzt). Ohne das landet register-host auf 'pending'
    // und der Handshake wirft host_pending → Aktivierungs-Deadlock.
    // Aktivierungs-Sequenz host-seitig: spawn → register-host (idempotent, bei
    // JEDEM Spawn) → handshake → activate. Siehe HOST-INTEGRATION-GUIDE §2.4.
    autoAccept:
      process.env.NODE_ENV === 'development' || process.env.PLUGIN_BRIDGE_PORT !== undefined,
  })
  return createBridgeApp({
    manifest,
    registry,
    toolHandlers: {
      'documents.list': documentsList,
    },
  })
}

// Env-first port: under a host the port is ASSIGNED via PLUGIN_BRIDGE_PORT; the
// manifest port is only the standalone-dev default (agent #6044, plugin-rollout).
// Bind it in your server entry:
//
//   import { serve } from '@hono/node-server'
//   serve({ fetch: (await createApp()).fetch, port: resolvePort() })
//
// An invalid/conflicting port surfaces as a clear error, never a silent fail.
export function resolvePort(defaultPort = 3600): number {
  const raw = process.env.PLUGIN_BRIDGE_PORT
  if (raw === undefined || raw === '') return defaultPort
  const port = Number(raw)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("invalid PLUGIN_BRIDGE_PORT: '" + raw + "' (expected 1..65535)")
  }
  return port
}
`

const PKG_BRIDGE_TEST = `import { afterEach, describe, expect, it } from 'vitest'
import { HostKeyRegistry, InMemoryHostKeyRepo } from '@nexus-mindgarden/plugin-bridge-foundation'
import { resolvePort } from '../src/index.js'

describe('{{pluginNameCamel}} bridge', () => {
  afterEach(() => {
    delete process.env.PLUGIN_BRIDGE_PORT
  })

  it('HostKeyRegistry can be instantiated', () => {
    const reg = new HostKeyRegistry(new InMemoryHostKeyRepo())
    expect(reg).toBeDefined()
  })

  it('resolvePort falls back to the dev default when PLUGIN_BRIDGE_PORT is unset', () => {
    delete process.env.PLUGIN_BRIDGE_PORT
    expect(resolvePort(3600)).toBe(3600)
  })

  it('resolvePort prefers the host-assigned PLUGIN_BRIDGE_PORT', () => {
    process.env.PLUGIN_BRIDGE_PORT = '4700'
    expect(resolvePort()).toBe(4700)
  })

  it('resolvePort rejects an invalid PLUGIN_BRIDGE_PORT (no silent fail)', () => {
    process.env.PLUGIN_BRIDGE_PORT = 'not-a-port'
    expect(() => resolvePort()).toThrow()
  })
})
`

// --- Granite-Floor test-coverage templates (cluster-wide convention) ---
//
// Plugin-author edits granite-test.config.ts with their actual MCP-tools +
// test-cases, then runs `pnpm granite-test` locally + in CI. Events emit
// to Oracle's @floor aggregator (chatbus reserved-virtual-role). See
// docs/granite-floor-spec.md (Oracle repo) for full event-shape spec v1.1.

const GRANITE_TEST_CONFIG = `// Granite-Floor test-coverage config for {{pluginNamePascal}}.
//
// Author your test-cases here. Each MCP-tool in your manifest should have
// a corresponding defineGraniteToolTest() entry with representative cases.
// Run \`pnpm granite-test\` to execute against Granite-4-h-tiny-4bit (via
// LM Studio :1234 by default — override with GRANITE_TEST_ENDPOINT env-var).
//
// Cluster-goal: 100% of MCP-tools Granite-callable by September-Messe.
// Spec: docs/granite-floor-spec.md in Oracle repo. Conventions:
//   - tool: canonical MCP /tools/list value 1:1 (no plugin-prefix per Drift #200)
//   - persona: 'user' | 'admin' | 'any' (Kiara-Admin vs User-Agent drill-down)
//   - case_id: stable identifier for CAS-dedup, format <tool>.<scenario>
//
// Until @nexus-mindgarden/granite-test ships its full impl, this file is
// authored-but-not-yet-running. The package install + runner-wiring lands
// when full-impl-week-1 completes.

import { defineGraniteToolTest } from '@nexus-mindgarden/granite-test'

export default [
  // EXAMPLE — replace with your actual MCP-tools from manifest.{{pluginName}}.yaml:
  defineGraniteToolTest({
    tool: 'example.tool.do_thing',     // ← MCP /tools/list value, no plugin-prefix
    persona: 'user',                    // 'user' | 'admin' | 'any'
    cases: [
      {
        case_id: 'example.tool.basic',  // <tool>.<scenario-slug>
        prompt: 'Test prompt that should elicit the tool-call',
        expected_tool_args: { foo: 'bar' },
        max_latency_ms: 60_000,         // Pilot baseline (ET-Mind Modul-04): 31-49s p99
      },
    ],
  }),

  // Add more defineGraniteToolTest() entries per MCP-tool…
]
`

const GRANITE_TEST_WORKFLOW = `# Granite-Floor test-coverage CI workflow.
#
# Runs on every push to main + on PRs. Executes granite-test against
# Granite-4-h-tiny-4bit (via configured runtime) + emits results to Oracle's
# @floor aggregator if CHATBUS_ENDPOINT secret is set.
#
# OPT-IN: comment out the 'on:' triggers if you don't want CI runs (e.g.
# expensive Granite-runtime not available in CI, or you only run locally).
# Local-only mode: \`pnpm granite-test\` from a developer machine.

name: Granite-Floor Coverage

on:
  push:
    branches: [main]
    paths:
      - 'granite-test.config.ts'
      - 'manifest.*.yaml'
      - 'packages/**/src/**'
  pull_request:
    branches: [main]
    paths:
      - 'granite-test.config.ts'
      - 'manifest.*.yaml'

jobs:
  granite-floor:
    runs-on: ubuntu-latest
    permissions:
      contents: read

    steps:
      - uses: actions/checkout@v7

      - uses: pnpm/action-setup@v4
        with:
          version: 10

      - uses: actions/setup-node@v6
        with:
          node-version: 24
          cache: pnpm

      - run: pnpm install --frozen-lockfile

      - name: Run granite-test (DRY-RUN if no GRANITE_ENDPOINT)
        run: pnpm granite-test
        env:
          # Granite runtime endpoint (LM Studio compatible-OpenAI API)
          GRANITE_ENDPOINT: \${{ secrets.GRANITE_ENDPOINT || '' }}
          # Chatbus aggregator endpoint — emit events to Oracle's @floor
          CHATBUS_ENDPOINT: \${{ secrets.CHATBUS_ENDPOINT || '' }}
          CHATBUS_TOKEN: \${{ secrets.CHATBUS_TOKEN || '' }}
          # Set to '1' for offline mode (logs events instead of emitting)
          GRANITE_TEST_DRY_RUN: \${{ secrets.CHATBUS_ENDPOINT && '0' || '1' }}
`

// Node 24 = cluster build/dev standard (Note node-standard, agent #5943).
const NODE_VERSION = `24
`

const NOTICES = `NOTICES — {{pluginNamePascal}}

Built on the @nexus-mindgarden plugin Foundation
(https://github.com/MrDewitt88/plugin-template), MIT-licensed.

## Third-party components

List bundled third-party components and their licenses here. Update this file
when you add a dependency whose license requires attribution.

## Release provenance

Distributable bundles (\`bundle.tgz\`) are produced by \`scripts/pack-bundle.mjs\`
— deterministic (sorted USTAR, mtime=0, gzip level 9), zero-dependency. The
bundle contains ONLY this plugin's manifest, \`server/\` build, and \`dist-plugin/\`
browser artifacts — no runtime, no node_modules. Its sha256 is recorded in
\`bundle.meta.json\` and verified by the Nexus catalog on install (agent #6044,
plugin-rollout). \`signature\` is reserved for a future Ed25519 bundle-signature (v2).
`

// Build the complete file-list. Order: root files, then per-feature packages.
export const TEMPLATE_FILES: TemplateFile[] = [
  { path: 'package.json', content: PACKAGE_JSON_ROOT },
  { path: 'pnpm-workspace.yaml', content: PNPM_WORKSPACE },
  { path: 'tsconfig.base.json', content: TSCONFIG_BASE },
  { path: 'tsconfig.json', content: TSCONFIG_ROOT },
  { path: 'vitest.workspace.ts', content: VITEST_WORKSPACE },
  { path: '.gitignore', content: GITIGNORE },
  { path: '.node-version', content: NODE_VERSION },
  { path: '.nvmrc', content: NODE_VERSION },
  { path: 'LICENSE', content: LICENSE },
  { path: 'NOTICES', content: NOTICES },
  { path: 'README.md', content: README },
  { path: 'CLAUDE.md', content: CLAUDE_MD },
  { path: 'manifest.{{pluginName}}.yaml', content: MANIFEST_YAML },
  { path: 'docs/ARCHITECTURE.md', content: ARCHITECTURE_MD },

  // Bridge feature (always included)
  {
    path: 'packages/{{pluginName}}-bridge/package.json',
    content: PKG_BRIDGE_JSON,
    feature: 'bridge',
  },
  {
    path: 'packages/{{pluginName}}-bridge/tsconfig.json',
    content: PKG_BRIDGE_TSCONFIG,
    feature: 'bridge',
  },
  {
    path: 'packages/{{pluginName}}-bridge/vitest.config.ts',
    content: PKG_BRIDGE_VITEST,
    feature: 'bridge',
  },
  {
    path: 'packages/{{pluginName}}-bridge/src/index.ts',
    content: PKG_BRIDGE_INDEX,
    feature: 'bridge',
  },
  {
    path: 'packages/{{pluginName}}-bridge/test/bridge.test.ts',
    content: PKG_BRIDGE_TEST,
    feature: 'bridge',
  },

  // Granite-Floor test-coverage (always included, opt-in per plugin-author).
  // Cluster-wide convention per Oracle spec v1.1 + plug-tmpl `@nexus-mindgarden/
  // granite-test`. Plugin-authors edit `granite-test.config.ts` with their
  // actual tools + cases, then run `pnpm granite-test` locally + in CI.
  { path: 'granite-test.config.ts', content: GRANITE_TEST_CONFIG },
  { path: '.github/workflows/granite-test.yml', content: GRANITE_TEST_WORKFLOW },
]
