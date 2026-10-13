import { build } from 'esbuild'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

async function license(name) {
  let directory = dirname(fileURLToPath(import.meta.resolve(name)))
  while (directory !== dirname(directory)) {
    try {
      const pkg = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'))
      if (pkg.name === name) return name + '\n' + await readFile(join(directory, 'LICENSE'), 'utf8')
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
const script = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script')
const template = await readFile(new URL('./src/item-panel.html', import.meta.url), 'utf8')
const notices = (await Promise.all([
  '@modelcontextprotocol/ext-apps', '@modelcontextprotocol/core', '@modelcontextprotocol/client', 'zod',
].map(license))).join('\n\n')
const html = template.replace('<!-- MCP_APP_SCRIPT -->', () => '<script>' + script + '</script>') +
  '\n<!-- Bundled SDK notices\n' + notices.replace(/-->/g, '-- >') + '\n-->\n'
if (Buffer.byteLength(html, 'utf8') > 512 * 1024) throw new Error('MCP UI exceeds 512 KiB')
await mkdir(output, { recursive: true })
await writeFile(new URL('item-panel.html', output), html)
