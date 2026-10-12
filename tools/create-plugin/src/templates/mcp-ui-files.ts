import type { TemplateFile } from './files.js'

/** Opt-in MCP Apps view; the official SDK owns the iframe JSON-RPC protocol. */
export const MCP_UI_TEMPLATE_FILES: TemplateFile[] = [
  {
    path: 'packages/{{pluginName}}-mcp-ui/package.json',
    feature: 'mcp-ui',
    content: `{
  "name": "{{pluginName}}-mcp-ui",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc --noEmit -p tsconfig.json && node build.mjs",
    "typecheck": "tsc --noEmit -p tsconfig.json"
  },
  "dependencies": {
    "@modelcontextprotocol/ext-apps": "2.0.3",
    "@modelcontextprotocol/client": "^2.0.0",
    "@modelcontextprotocol/core": "^2.0.0",
    "zod": "^4.2.0"
  },
  "devDependencies": {
    "esbuild": "^0.25.12",
    "typescript": "^5.6.0"
  }
}
`,
  },
  {
    path: 'packages/{{pluginName}}-mcp-ui/tsconfig.json',
    feature: 'mcp-ui',
    content: `{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "noEmit": true },
  "include": ["src/**/*.ts"]
}
`,
  },
  {
    path: 'packages/{{pluginName}}-mcp-ui/build.mjs',
    feature: 'mcp-ui',
    content: `import { build } from 'esbuild'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

async function license(name) {
  let directory = dirname(fileURLToPath(import.meta.resolve(name)))
  while (directory !== dirname(directory)) {
    try {
      const pkg = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'))
      if (pkg.name === name) return name + '\\n' + await readFile(join(directory, 'LICENSE'), 'utf8')
    } catch { /* ascend to the package root */ }
    directory = dirname(directory)
  }
  throw new Error('License missing for ' + name)
}

const output = new URL('../../dist-plugin/', import.meta.url)
const result = await build({
  entryPoints: [fileURLToPath(new URL('./src/app.ts', import.meta.url))],
  bundle: true, write: false, platform: 'browser', format: 'iife',
  target: 'es2022', minify: true, legalComments: 'inline',
})
const script = result.outputFiles[0].text.replace(/<\\/script/gi, '<\\\\/script')
const template = await readFile(new URL('./src/item-panel.html', import.meta.url), 'utf8')
const notices = (await Promise.all([
  '@modelcontextprotocol/ext-apps', '@modelcontextprotocol/core', '@modelcontextprotocol/client', 'zod',
].map(license))).join('\\n\\n')
const html = template.replace('<!-- MCP_APP_SCRIPT -->', () => '<script>' + script + '</script>') +
  '\\n<!-- Bundled SDK notices\\n' + notices.replace(/-->/g, '-- >') + '\\n-->\\n'
if (Buffer.byteLength(html, 'utf8') > 512 * 1024) throw new Error('MCP UI exceeds 512 KiB')
await mkdir(output, { recursive: true })
await writeFile(new URL('item-panel.html', output), html)
`,
  },
  {
    path: 'packages/{{pluginName}}-mcp-ui/src/item-panel.html',
    feature: 'mcp-ui',
    content: `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <title>{{pluginNamePascal}} Einträge</title>
  <style>
    :root { color-scheme: light dark; font: 16px system-ui,sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 16px; overflow-wrap: anywhere; }
    main { max-width: 48rem; margin: auto; min-width: 0; }
    h1 { font-size: 1.2rem; }
    button { min-height: 44px; padding: 10px 16px; font: inherit; cursor: pointer; }
    pre { white-space: pre-wrap; overflow-wrap: anywhere; }
    [role=status] { min-height: 1.5em; }
  </style>
</head>
<body>
  <main>
    <h1>{{pluginNamePascal}} Einträge</h1>
    <p id="status" role="status">Verbindung wird aufgebaut …</p>
    <button id="refresh" type="button" disabled>Aktualisieren</button>
    <pre id="items" aria-label="Einträge"></pre>
  </main>
  <!-- MCP_APP_SCRIPT -->
</body>
</html>
`,
  },
  {
    path: 'packages/{{pluginName}}-mcp-ui/src/app.ts',
    feature: 'mcp-ui',
    content: `// Official prebundled view entry keeps the self-contained HTML below 512 KiB.
import { App } from '@modelcontextprotocol/ext-apps/app-with-deps'

const app = new App({ name: '{{pluginNamePascal}} Item Panel', version: '0.1.0' }, {})
const status = document.querySelector<HTMLElement>('#status')!
const items = document.querySelector<HTMLElement>('#items')!
const refresh = document.querySelector<HTMLButtonElement>('#refresh')!

function renderResult(result: { structuredContent?: unknown; isError?: boolean | undefined }) {
  // All server data is text, never executable HTML or an authority claim.
  const data = result.structuredContent
  const entries = data !== null && typeof data === 'object' && 'items' in data && Array.isArray(data.items) ? data.items : []
  items.textContent = JSON.stringify(entries, null, 2)
  status.textContent = result.isError ? 'Einträge konnten nicht geladen werden.' : 'Einträge geladen.'
}

// Install handlers BEFORE connect: the host can send its result immediately.
app.ontoolresult = renderResult
app.onhostcontextchanged = (context) => {
  if (context.theme) document.documentElement.style.colorScheme = context.theme
}
refresh.addEventListener('click', async () => {
  refresh.disabled = true
  try {
    // Local manifest name. The host maps it to this originating plugin and
    // enforces permissions; the iframe never receives a bridge bearer token.
    renderResult(await app.callServerTool({ name: 'items.panel', arguments: {} }))
  } catch {
    status.textContent = 'Aktualisierung ist derzeit nicht verfügbar.'
  } finally { refresh.disabled = false }
})

void app.connect().then(() => {
  refresh.disabled = false
  status.textContent = 'Bereit.'
}).catch(() => { status.textContent = 'Dieses Widget benötigt einen MCP-Apps-Host.' })
`,
  },
]
