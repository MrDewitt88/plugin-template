import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { TEMPLATE_FILES, type TemplateFile } from './files.js'
import { MCP_UI_TEMPLATE_FILES } from './mcp-ui-files.js'

const DIRECTORY = fileURLToPath(new URL('../../templates-static/standalone-app/', import.meta.url))
export const APP_STATIC_FILES: ReadonlyArray<{ src: string; dest: string; feature?: string }> = [
  {
    src: 'standalone-app/vendor/plugin-bridge-foundation-0.21.1.tgz',
    dest: 'vendor/plugin-bridge-foundation-0.21.1.tgz',
  },
]

/** Separate lifecycle and trust defaults; never inherit host-managed startup. */
export function appTemplates(): TemplateFile[] {
  const files: TemplateFile[] = []
  const walk = (directory: string, prefix: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const path = prefix + entry.name
      if (entry.isDirectory()) walk(join(directory, entry.name), path + '/')
      else if (entry.name.endsWith('.template'))
        files.push({
          path: path.slice(0, -9),
          content: readFileSync(join(directory, entry.name), 'utf8'),
        })
    }
  }
  walk(DIRECTORY, '')
  const overridden = new Set(files.map((file) => file.path))
  return [
    ...TEMPLATE_FILES.filter((file) => ['LICENSE', '.node-version', '.nvmrc'].includes(file.path)),
    ...MCP_UI_TEMPLATE_FILES.filter((file) => !overridden.has(file.path)),
    ...files,
  ]
}
