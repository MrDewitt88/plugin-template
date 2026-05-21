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
    "node": ">=20",
    "pnpm": ">=10"
  },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "build": "pnpm -r build"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
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
  service_endpoint: http://localhost:3600
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

See \`manifest.yaml\` — Hosts: {{hosts}}.

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
    "@nexus-mindgarden/plugin-bridge-foundation": "^0.0.1",
    "@nexus-mindgarden/plugin-mcp-foundation": "^0.0.1",
    "@hono/node-server": "^1.13.0",
    "hono": "^4.6.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
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
  HostKeyRegistry,
  InMemoryHostKeyRepo,
  loadManifest,
  type ToolHandler,
} from '@nexus-mindgarden/plugin-bridge-foundation'

const documentsList: ToolHandler = async (_args, _ctx) => {
  // TODO: implement {{pluginName}} list
  return { items: [] }
}

export async function createApp() {
  const manifest = await loadManifest('./manifest.yaml')
  const registry = new HostKeyRegistry(new InMemoryHostKeyRepo(), {
    autoAccept: process.env.NODE_ENV === 'development',
  })
  return createBridgeApp({
    manifest,
    registry,
    toolHandlers: {
      'documents.list': documentsList,
    },
  })
}
`

const PKG_BRIDGE_TEST = `import { describe, expect, it } from 'vitest'
import { HostKeyRegistry, InMemoryHostKeyRepo } from '@nexus-mindgarden/plugin-bridge-foundation'

describe('{{pluginNameCamel}} bridge', () => {
  it('HostKeyRegistry can be instantiated', () => {
    const reg = new HostKeyRegistry(new InMemoryHostKeyRepo())
    expect(reg).toBeDefined()
  })
})
`

// Build the complete file-list. Order: root files, then per-feature packages.
export const TEMPLATE_FILES: TemplateFile[] = [
  { path: 'package.json', content: PACKAGE_JSON_ROOT },
  { path: 'pnpm-workspace.yaml', content: PNPM_WORKSPACE },
  { path: 'tsconfig.base.json', content: TSCONFIG_BASE },
  { path: 'tsconfig.json', content: TSCONFIG_ROOT },
  { path: 'vitest.workspace.ts', content: VITEST_WORKSPACE },
  { path: '.gitignore', content: GITIGNORE },
  { path: 'LICENSE', content: LICENSE },
  { path: 'README.md', content: README },
  { path: 'CLAUDE.md', content: CLAUDE_MD },
  { path: 'manifest.yaml', content: MANIFEST_YAML },
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
]
