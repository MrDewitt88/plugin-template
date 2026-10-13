# @nexus-mindgarden/create-plugin

## Eigenständige Apps mit myMind — ab 0.16.0

Aktueller Stand: Generator 0.16.1, Starter 0.1.1, Bridge Foundation 0.21.1.

`--kind=app` erzeugt eine eigene Svelte-5-/Node-24-App mit dauerhaftem Store,
expliziter Host-Freigabe, MCPi-Bridge und einem selbstenthaltenen MCPi-UI-B1-Widget.
Das fertige, kopierbare Beispiel liegt unter
[`examples/standalone-notes-app`](../../examples/standalone-notes-app/README.md).
Dort enthalten `OPENCODE.md` und `AGENTS.md` den konkreten Weiterbau-Auftrag.

Aus dem aktuellen Repository nach Installation und Build des Generators:

```sh
node tools/create-plugin/bin/cli.js my-app --kind=app --target=../my-app
cd ../my-app
pnpm install
pnpm typecheck
pnpm test
pnpm start
```

Die Starter-Foundation 0.21.1 liegt geprüft unter `vendor/`; der App-Starter
ist damit von einer npm-Veröffentlichung dieser Foundation unabhängig.
Die neue Generator-Version wird hier nicht als bereits auf npm veröffentlicht
ausgegeben. Plugin-Modus und dessen bestehende Defaults bleiben erhalten.
App-Modus richtet sich standardmäßig an `theseus` (myMind), liefert seine
eigene Svelte-Oberfläche und seinen Store und übernimmt keine Host-Startbefehle.
Native Installer/Hintergrunddienste sind App-spezifische Erweiterungen.

CLI-Scaffold für `@nexus` Plugin-Provider. Generiert ein neues Plugin-Repo mit Foundation-Packages-Wiring + Manifest + CLAUDE.md + ARCHITECTURE-skeleton.

## Usage

```sh
npx @nexus-mindgarden/create-plugin <plugin-name> [options]
```

### Options

| Flag                | Default                       | Description                                                                                        |
| ------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------- |
| `--hosts=<list>`    | `teammind,theseus,familymind` | Targeted hosts (comma-separated). Valid: `teammind`, `theseus`, `familymind`                       |
| `--features=<list>` | `mcp`                         | Foundation-features (bridge always implied). Valid: `bridge`, `storage`, `svelte`, `mcp`, `mcp-ui` |
| `--target=<dir>`    | `./<plugin-name>`             | Output-Directory                                                                                   |
| `--help`, `-h`      | —                             | Show help                                                                                          |

### Examples

```sh
# Minimal — Default hosts + features
npx @nexus-mindgarden/create-plugin my-plugin

# Custom features
npx @nexus-mindgarden/create-plugin docs-plugin --features=mcp,storage,svelte

# Bridge plus a self-contained MCP Apps widget (Generator 0.15.0)
npx @nexus-mindgarden/create-plugin widget-plugin --features=mcp-ui

# Single host + custom target
npx @nexus-mindgarden/create-plugin v8-only-plugin --hosts=teammind --target=/Users/me/Plugins/v8-only
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

`--features=mcp-ui` adds a real `<plugin-name>-mcp-ui` package, the `items.panel`
tool/URI linkage and its Bridge Foundation resource reader. `pnpm build` emits
the inline HTML into `dist-plugin/item-panel.html` for the bundle packer.
See [MCP UI resources](../../docs/MCP-UI-RESOURCES.md) for the host adapter and
the browser smoke. A host needs MCP Apps support to display this widget.

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
