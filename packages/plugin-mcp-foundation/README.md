# @nexus/plugin-mcp-foundation

Plugin-MCP Foundation — Tool-Registry mit mcp_tools Extended-Form-Support, Scope-Validation, Tool-Naming-Convention für Cross-Repo-Konsistenz.

## Quick Use

### Tool-Registry aus Manifest

```ts
import { ToolRegistry, checkScopes } from '@nexus/plugin-mcp-foundation'
import { loadManifest } from '@nexus/plugin-bridge-foundation'

const manifest = await loadManifest('./manifest.yaml')
const registry = new ToolRegistry()
registry.registerFromManifest(manifest.provides.mcp_tools)

// Mixed-Form OK:
//   ['documents.list', { name: 'documents.create', scopes_required: ['...'] }]
```

### Pre-Execute Scope-Check

```ts
const tool = registry.get('documents.create')
if (!tool) return error('tool_not_found')

const scopeResult = checkScopes({
  pluginWideScopes: manifest.provides.scopes_required,
  callerScopes: claims.scopes, // aus JWT
  tool,
})

if (!scopeResult.ok) {
  return error('forbidden', `missing scopes: ${scopeResult.missing.join(', ')}`)
}

// proceed with tool-call
```

### Naming-Convention (Host-Side)

```ts
import { synthesizeNamespacedName, parseNamespacedName }
  from '@nexus/plugin-mcp-foundation'

// Plugin manifest hat bare-name 'documents.create'
// Host (V8/Theseus) synthesizes:
const namespaced = synthesizeNamespacedName('markview', 'documents.create')
// → 'markview.documents.create'

// Inverse (host-side routing):
const parsed = parseNamespacedName('markview.documents.create')
// → { pluginId: 'markview', bareName: 'documents.create' }
```

## Architecture

```
src/
├── tools/
│   ├── types.ts        # ExtendedMcpToolSchema + McpToolEntrySchema +
│   │                     normalizeMcpToolEntry (string/object → Normalized)
│   ├── registry.ts     # ToolRegistry — registerFromManifest + get/has/
│   │                     list/clear, dedup + validate
│   ├── naming.ts       # isValidBareName + synthesizeNamespacedName +
│   │                     parseNamespacedName (Cross-Repo-Convention)
│   └── index.ts
├── scopes/
│   ├── scope-check.ts  # checkScopes — union-with plugin-wide ∪ tool-
│   │                     specific, wildcard-support (`mcp.plugin.*`)
│   └── index.ts
└── index.ts
```

## mcp_tools Extended Form (Phase-3 Spec)

Foundation accept'd beide Formen aus `manifest.provides.mcp_tools`:

```yaml
provides:
  mcp_tools:
    - documents.list                        # string-form (Phase-1)
    - name: documents.create                # Extended-Form (Phase-3)
      description: Create a new document
      input_schema:
        type: object
        required: [title]
        properties:
          title: { type: string }
      output_schema:
        type: object
        required: [id]
      scopes_required:
        - mcp.write.documents
```

`normalizeMcpToolEntry()` upgrade'd string-form zu `{ name, undefineds, [] }`. Registry behält normalized form.

## Per-Tool Scope-Semantics

`checkScopes()` implementiert Phase-3 §4 Per-Tool Semantics: plugin-wide `scopes_required` ist Union-Floor — JEDER Tool-Call braucht ALL plugin-wide scopes. Tool-specific `scopes_required` extends statt replace.

```ts
// plugin-wide: ['mcp.read.documents']
// tool 'create': ['mcp.write.documents']
// →  required = ['mcp.read.documents', 'mcp.write.documents'] (union)
```

Wildcard-Convention: `mcp.plugin.*` matched alle scopes mit prefix `mcp.plugin.` (V8s admin-cookie-Convention).

## Tool-Naming

| Form | Where | Example |
|---|---|---|
| **bare-name** | Plugin manifest | `documents.create` |
| **namespaced-name** | Host MCP-Pipeline | `markview.documents.create` |

`isValidBareName(name)` enforced snake_case + dot-namespace. `synthesizeNamespacedName(pluginId, bareName)` is host-side helper. `parseNamespacedName()` ist die Inverse für tool-routing zurück zum Plugin.

## Testing

```sh
pnpm test       # vitest run
pnpm typecheck  # tsc --noEmit
```

Tests cover:
- `registry.test.ts` — normalizeMcpToolEntry both-forms, ToolRegistry mixed-form ingestion, dedup-throws, invalid-name-throws, basic ops, clear, single register
- `naming.test.ts` — isValidBareName accept/reject (uppercase/dashes/leading-dot/leading-digit), synthesizeNamespacedName + parseNamespacedName roundtrip, error-paths
- `scopes.test.ts` — Phase-3 union-semantics (plugin-wide reicht / extends / missing both directions / dedup), Wildcard-Convention (concrete-match, prefix-match, no-cross-prefix), empty cases

## License

MIT
