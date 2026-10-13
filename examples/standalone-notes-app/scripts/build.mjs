import { build } from 'esbuild'
import { compile } from 'svelte/compiler'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import { verifyVendor } from './verify-vendor.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
await verifyVendor()
const checked = spawnSync(process.execPath, [fileURLToPath(import.meta.resolve('typescript/bin/tsc')), '-p', 'tsconfig.build.json'], { cwd: root, stdio: 'inherit' })
if (checked.status !== 0) process.exit(checked.status ?? 1)
const output = new URL('../dist/public/', import.meta.url)
const result = await build({
  entryPoints: [fileURLToPath(new URL('../src/ui/main.ts', import.meta.url))],
  bundle: true, write: false, platform: 'browser', format: 'iife', target: 'es2022', minify: true,
  plugins: [{ name: 'svelte', setup(builder) {
    builder.onLoad({ filter: /\.svelte$/ }, async ({ path }) => {
      const compiled = compile(await readFile(path, 'utf8'), { filename: path, generate: 'client', css: 'injected' })
      if (compiled.warnings.length) throw new Error(compiled.warnings.map(warning => warning.message).join('\n'))
      return { contents: compiled.js.code, loader: 'js', resolveDir: dirname(path) }
    })
  } }],
})
await mkdir(output, { recursive: true })
await writeFile(new URL('app.js', output), result.outputFiles[0].text)
await writeFile(new URL('index.html', output), await readFile(new URL('../src/ui/index.html', import.meta.url), 'utf8'))
const widget = spawnSync(process.execPath, ['packages/standalone-notes-app-mcp-ui/build.mjs'], { cwd: root, stdio: 'inherit' })
if (widget.status !== 0) process.exit(widget.status ?? 1)
console.log('Built standalone app and self-contained MCPi-UI widget.')
