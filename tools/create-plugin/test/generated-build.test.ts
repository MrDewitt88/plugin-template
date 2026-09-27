import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { scaffold } from '../src/scaffolders/scaffold.js'

const ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const require = createRequire(import.meta.url)
let target: string

beforeEach(() => {
  target = mkdtempSync(join(tmpdir(), 'generated-build-'))
  scaffold({
    pluginName: 'build-plugin',
    hosts: ['teammind', 'theseus', 'familymind'],
    features: ['bridge'],
    target,
    force: true,
  })
  // Use workspace dependencies without an install or network access. As with
  // the CLI integration tests, Foundation dist is supplied by the repo build.
  for (const [name, source] of [
    ['@nexus-mindgarden/plugin-bridge-foundation', 'packages/plugin-bridge-foundation'],
    ['hono', 'packages/plugin-bridge-foundation/node_modules/hono'],
    ['@types', 'node_modules/@types'],
    ['typescript', 'node_modules/typescript'],
  ]) {
    const destination = join(target, 'node_modules', name!)
    mkdirSync(dirname(destination), { recursive: true })
    symlinkSync(join(ROOT, source!), destination, process.platform === 'win32' ? 'junction' : 'dir')
  }
})

afterEach(() => rmSync(target, { recursive: true, force: true }))

function typecheck() {
  return spawnSync('pnpm', ['typecheck'], {
    cwd: target,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    timeout: 20_000,
  })
}

describe('generated package build', () => {
  it('ships a compiled bridge with its public health wrapper', async () => {
    const bridge = join(target, 'packages/build-plugin-bridge')
    const build = spawnSync(
      process.execPath,
      [require.resolve('typescript/bin/tsc'), '-p', join(bridge, 'tsconfig.json')],
      {
        cwd: target,
        encoding: 'utf8',
        timeout: 20_000,
      },
    )
    expect(build.status, build.stdout + build.stderr).toBe(0)
    expect(readFileSync(join(bridge, 'dist/public-health.mjs'), 'utf8')).toContain(
      'withPublicHealth',
    )
    const mod = await import(/* @vite-ignore */ pathToFileURL(join(bridge, 'dist/index.js')).href)
    const app = await mod.createApp(target)
    const health = await app.request('/plugin-bridge/v1/health')
    expect(health.status).toBe(200)
    expect(await health.json()).toMatchObject({ status: 'ok', version: '0.1.0' })
    expect((await app.request('/plugin-bridge/v1/manifest')).status).toBe(401)
  }, 20_000)

  it.each(['scaffold', 'repository'])(
    '%s root typecheck catches an error in a workspace package',
    (origin) => {
      if (origin === 'repository') {
        const file = join(target, 'package.json')
        const pkg = JSON.parse(readFileSync(file, 'utf8'))
        pkg.scripts.typecheck = JSON.parse(
          readFileSync(join(ROOT, 'package.json'), 'utf8'),
        ).scripts.typecheck
        writeFileSync(file, JSON.stringify(pkg))
      }
      const clean = typecheck()
      expect(clean.status, clean.stdout + clean.stderr).toBe(0)
      writeFileSync(
        join(target, 'packages/build-plugin-bridge/src/typecheck-regression.ts'),
        'export const invalid: number = "not-a-number"\n',
      )
      const broken = typecheck()
      expect(broken.status).not.toBe(0)
      expect(broken.stdout + broken.stderr).toContain('TS2322')
      expect(broken.stdout + broken.stderr).toContain('typecheck-regression.ts')
    },
    30_000,
  )
})
