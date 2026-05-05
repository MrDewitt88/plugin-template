# @nexus/create-plugin

CLI-Scaffold für `@nexus` Plugin-Provider. Generiert ein neues Plugin-Repo mit Foundation-Packages-Wiring + Manifest + CLAUDE.md + ARCHITECTURE-skeleton.

## Usage

```sh
npx @nexus/create-plugin <plugin-name> [options]
```

### Options

| Flag | Default | Description |
|---|---|---|
| `--hosts=<list>` | `teammind,theseus` | Targeted hosts (comma-separated). Valid: `teammind`, `theseus`, `familymind` |
| `--features=<list>` | `mcp` | Foundation-features (bridge always implied). Valid: `bridge`, `storage`, `svelte`, `mcp` |
| `--target=<dir>` | `./<plugin-name>` | Output-Directory |
| `--help`, `-h` | — | Show help |

### Examples

```sh
# Minimal — Default hosts + features
npx @nexus/create-plugin my-plugin

# Custom features
npx @nexus/create-plugin docs-plugin --features=mcp,storage,svelte

# Single host + custom target
npx @nexus/create-plugin v8-only-plugin --hosts=teammind --target=/Users/me/Plugins/v8-only
```

## Generated Files

```
<plugin-name>/
├── package.json              # workspace root + pnpm + scripts
├── pnpm-workspace.yaml
├── tsconfig.base.json        # strict TS 5.6+
├── tsconfig.json
├── vitest.workspace.ts
├── .gitignore
├── LICENSE                   # MIT
├── README.md
├── CLAUDE.md                 # engineering-rules für Plugin-Provider-CC
├── manifest.yaml             # plugin-manifest skeleton
├── docs/
│   └── ARCHITECTURE.md       # filled with placeholders for customization
└── packages/
    └── <plugin-name>-bridge/ # if 'bridge' in --features (default)
        ├── package.json
        ├── tsconfig.json
        ├── vitest.config.ts
        ├── src/index.ts      # createBridgeApp + tool-handlers stub
        └── test/bridge.test.ts
```

Plus für `--features=storage` / `svelte` / `mcp`: weitere `<plugin-name>-{storage,svelte,mcp}/` packages (Phase-2 — current CLI scaffolds bridge-only, dann Plugin-Provider hand-fügt zusätzliche packages).

## Post-Scaffold Workflow

```sh
cd <plugin-name>
pnpm install
pnpm test           # vitest workspace-wide
pnpm typecheck      # tsc --noEmit
```

Dann:
1. Customize `manifest.yaml` mit MCP-Tools + module_extensions
2. Implement Tool-Handlers in `packages/<plugin>-bridge/src/index.ts`
3. Plus Foundation-Package-Imports per `--features` Auswahl
4. Commit + push + register im Marketplace

Volle Workflow-Reference: [`PLUGIN-PROVIDER-GUIDE.md`](https://github.com/MrDewitt88/plugin-template/blob/main/docs/PLUGIN-PROVIDER-GUIDE.md)

## Implementation

```
src/
├── args.ts            # CLI argument-parser (pure-function, testbar)
├── cli.ts             # main CLI runner
├── scaffolders/
│   └── scaffold.ts    # render templates + write files
├── templates/
│   ├── render.ts      # buildContext + render({{placeholder}})
│   └── files.ts       # template strings + path-array
└── index.ts           # public exports
bin/
└── cli.js             # node-shebang entry
test/
├── args.test.ts       # 11 tests
├── render.test.ts     # 13 tests
└── scaffold.test.ts   # 8 tests
```

## Tests

```sh
pnpm test       # vitest run
pnpm typecheck  # tsc --noEmit
```

Coverage:
- `args.test.ts` — parse-positional, --help, --hosts/--features/--target overrides, all error-paths (missing/invalid name/hosts/features), bridge-implied-feature
- `render.test.ts` — buildContext kebab→camel/pascal/prefix, year, value-replacements, conditional sections (`{{#if features.X}}`), nested replacements
- `scaffold.test.ts` — root-files written, placeholder-rendering, target-exists-throws, --force-override, feature-skip-when-absent, filesWritten + context returned

## License

MIT
