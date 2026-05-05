# @nexus/plugin-svelte-foundation

Svelte 5 Custom-Element Foundation für Plugin-UI-Components — bridge-attrs reader + plugin→host events + 16-token theme convention + esbuild bundle config.

## Quick Use

### Custom-Element-Setup (Plugin-Component .svelte)

```svelte
<script lang="ts">
  import {
    bridgeAttrPropsMapping,
    readBridgeAttrs,
    dispatchAskKiara,
    trimToMaxBytes,
    MAX_CONTENT_BYTES,
  } from '@nexus/plugin-svelte-foundation'

  // Drift #7 mitigation: long-form props mit explicit attribute-mapping
  // (short-form deriviert lowercase observedAttributes, NOT kebab-case).

  let { bridgeToken, bridgeEndpoint, hostId, tenantId, userId, theme,
        documentId } = $props()

  function askKiara() {
    const root = host  // bind-this auf root
    if (!root) return
    const trimmed = trimToMaxBytes(myContent)
    dispatchAskKiara(root, {
      context: 'document-detail',
      document_id: documentId,
      full_content: trimmed.text,
      full_content_truncated: trimmed.truncated,
      capabilities: ['markdown', 'katex'],
    })
  }
</script>

<svelte:options
  customElement={{
    tag: 'plugin-myplugin-foo',
    shadow: 'open',
    props: {
      ...bridgeAttrPropsMapping(),
      documentId: { attribute: 'document-id' },
    },
  }}
/>

<button onclick={askKiara}>Frag Kiara</button>

<style>
  /* THEME-TOKENS-BEGIN — generiert via @nexus/plugin-svelte-foundation */
  /* hier den buildThemeCss()-output einfügen */
  /* THEME-TOKENS-END */
</style>
```

### Theme-Tokens-CSS (in build-step generieren)

```ts
import { buildThemeCss } from '@nexus/plugin-svelte-foundation/theme'

const themeBlock = buildThemeCss('mv') // prefix=mv für MarkView
// inject into Component <style> via build-time-template
```

### Build-Pipeline

```ts
import esbuild from 'esbuild'
import {
  pluginBundleConfig,
  nodeBuiltinsStubPlugin,
} from '@nexus/plugin-svelte-foundation/build'

await esbuild.build({
  ...pluginBundleConfig({
    componentTag: 'plugin-myplugin-foo',
    entry: 'src/components/foo.svelte.ts',
    outdir: 'dist/ui',
  }),
  plugins: [nodeBuiltinsStubPlugin()],
})
```

## Architecture

```
src/
├── components/
│   ├── bridge-attrs.ts   # OBSERVED_BRIDGE_ATTRS + readBridgeAttrs +
│   │                       bridgeAttrPropsMapping (Drift #7)
│   ├── host-events.ts    # dispatchNavigate/refresh/error/askKiara +
│   │                       trimToMaxBytes (UTF-8-safe)
│   └── index.ts
├── theme/
│   ├── tokens.ts         # 16-token convention + STANDARD_LIGHT/DARK +
│   │                       buildThemeCss (light + dark + auto-fallback)
│   └── index.ts
└── build/
    ├── esbuild-config.ts # pluginBundleConfig + nodeBuiltinsStubPlugin
    │                       (Drift #13 + #20+#21)
    └── index.ts
```

## Drift-Catalog Cross-Reference

- **Drift #7** Svelte 5 customElement attribute lowercase — `bridgeAttrPropsMapping()` + long-form mit explicit `attribute:` mapping
- **Drift #13** Browser-Bundle CommonJS-Require — `nodeBuiltinsStubPlugin()` stubs node-builtins als empty-module statt extern
- **Drift #20+#21** Bare-specifier dynamic-imports — `pluginBundleConfig()` default external=[] + splitting=true
- **Drift #18 (superseded)** Theme-Token-Handoff — theme-attribut-Convention statt CSS-var-inheritance

## 16 Theme-Tokens

| Token | Purpose |
|---|---|
| `fg` / `bg` / `muted` | text + background base |
| `accent` / `accent-fg` | brand color + on-brand text |
| `kiara` / `kiara-fg` | Frag-Kiara button color (optional) |
| `border` / `input-bg` / `card-bg` / `chip-bg` | structure |
| `info-bg` / `error-bg` / `error-fg` / `warn-bg` / `warn-fg` | states |

CSS-Custom-Property-Naming: `--<prefix>-color-<token>` — Plugin-Provider wählt prefix (z.B. `mv-` für MarkView, `kanban-` für Kanban) für Collision-Vermeidung.

## Testing

```sh
pnpm test       # vitest run
pnpm typecheck  # tsc --noEmit
```

Tests cover:
- `theme.test.ts` — tokensToCss kebab-case, prefix-uniqueness, 16-token-count, buildThemeCss light+dark+auto-fallback markers
- `components.test.ts` — OBSERVED_BRIDGE_ATTRS, propsMapping (Drift #7), readBridgeAttrs (pflicht-felder + actor-class/theme/locale fallbacks), dispatch helpers (bubbles+composed), trimToMaxBytes (UTF-8-safe)
- `build.test.ts` — pluginBundleConfig defaults, external override, NODE_BUILTINS coverage, plugin setup signature

## License

MIT
