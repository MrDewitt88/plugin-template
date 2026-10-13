import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { scaffold } from '../src/scaffolders/scaffold.js'
const directories: string[] = []
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})
describe('standalone app scaffold', () => {
  it('provides an independent process, pinned Foundation and scoped widget with safe trust defaults', () => {
    const target = mkdtempSync(join(tmpdir(), 'standalone-scaffold-'))
    directories.push(target)
    const output = scaffold({
      kind: 'app',
      pluginName: 'sample-app',
      hosts: ['theseus'],
      features: [],
      target,
      force: true,
    })
    const read = (file: string) => readFileSync(join(target, file), 'utf8')
    expect(output.context.features).toContain('mcp-ui')
    const pkg = JSON.parse(read('package.json'))
    expect(pkg.scripts.start).toContain('dist/server.js')
    expect(pkg.dependencies['@nexus-mindgarden/plugin-bridge-foundation']).toBe(
      'file:vendor/plugin-bridge-foundation-0.21.0.tgz',
    )
    expect(existsSync(join(target, 'vendor/plugin-bridge-foundation-0.21.0.tgz'))).toBe(true)
    expect(read('src/trust.ts')).toContain('autoAccept: false')
    expect(read('src/bridge.ts')).toContain('enforceScopes: true')
    expect(read('manifest.sample-app.yaml')).toContain('mcp.write.sample-app.items')
    expect(read('manifest.sample-app.yaml')).not.toMatch(/^\s*(?:start_command|command):/m)
    expect(read('src/ui/App.svelte')).toContain('myMind verbinden')
    expect(read('packages/sample-app-mcp-ui/src/app.ts')).toContain("name: 'items.create'")
    expect(output.filesWritten).not.toContain('scripts/pack-bundle.mjs')
    expect(read('src/server.ts')).not.toContain('PLUGIN_BRIDGE_PORT')
  })
})
