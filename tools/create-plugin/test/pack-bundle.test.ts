import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const PACKER = fileURLToPath(new URL('../templates-static/pack-bundle.mjs', import.meta.url))

function manifest(id: string): string {
  return `id: ${id}
name:
  de: T
  en: T
description:
  de: T
  en: T
version: 1.2.3
distribution:
  type: external-service
  service_endpoint: http://127.0.0.1:3600
compatibility:
  apps: [teammind]
  min_app_version: 1.0.0
provides:
  routes: []
  mcp_tools: []
  module_extensions: []
  scopes_required: []
`
}

function pack(dir: string) {
  const r = spawnSync('node', [PACKER], { cwd: dir, encoding: 'utf8' })
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' }
}

function sha(dir: string): string {
  return createHash('sha256').update(readFileSync(join(dir, 'bundle.tgz'))).digest('hex')
}

describe('pack-bundle.mjs', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'pack-'))
    mkdirSync(join(dir, 'dist-plugin'), { recursive: true })
    writeFileSync(join(dir, 'dist-plugin', 'a.js'), 'a\n')
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('produces a deterministic sha256 + correct meta across two runs', () => {
    writeFileSync(join(dir, 'manifest.demo.yaml'), manifest('demo'))
    const r1 = pack(dir)
    expect(r1.status).toBe(0)
    const s1 = sha(dir)
    const r2 = pack(dir)
    expect(r2.status).toBe(0)
    expect(sha(dir)).toBe(s1)
    const meta = JSON.parse(readFileSync(join(dir, 'bundle.meta.json'), 'utf8'))
    expect(meta.id).toBe('demo')
    expect(meta.version).toBe('1.2.3')
    expect(meta.min_app_version).toBe('1.0.0')
    expect(meta.signature).toBeNull()
    expect(meta.sha256).toBe(s1)
    expect(meta.files).toEqual(['dist-plugin/a.js', 'manifest.demo.yaml'])
  })

  it('rejects a filename/id mismatch at pack time (mirrors the loader guard)', () => {
    writeFileSync(join(dir, 'manifest.foo.yaml'), manifest('bar'))
    const r = pack(dir)
    expect(r.status).not.toBe(0)
    expect(r.stderr).toContain('mismatch')
  })

  it('parses a manifest that starts with a UTF-8 BOM', () => {
    writeFileSync(join(dir, 'manifest.demo.yaml'), '\uFEFF' + manifest('demo'))
    const r = pack(dir)
    expect(r.status).toBe(0)
    expect(r.stdout).toContain('"id": "demo"')
  })

  it('warns and skips a symlink instead of silently dropping it', () => {
    writeFileSync(join(dir, 'manifest.demo.yaml'), manifest('demo'))
    writeFileSync(join(dir, 'dist-plugin', 'real.js'), 'real\n')
    symlinkSync(join(dir, 'dist-plugin', 'real.js'), join(dir, 'dist-plugin', 'link.js'))
    const r = pack(dir)
    expect(r.status).toBe(0)
    expect(r.stderr).toContain('skipping symlink')
    const meta = JSON.parse(readFileSync(join(dir, 'bundle.meta.json'), 'utf8'))
    expect(meta.files).not.toContain('dist-plugin/link.js')
    expect(meta.files).toContain('dist-plugin/real.js')
  })

  it('discovers the deprecated bare manifest.yaml with a warning', () => {
    writeFileSync(join(dir, 'manifest.yaml'), manifest('legacy'))
    const r = pack(dir)
    expect(r.status).toBe(0)
    expect(r.stderr).toContain('deprecated bare manifest.yaml')
    const meta = JSON.parse(readFileSync(join(dir, 'bundle.meta.json'), 'utf8'))
    expect(meta.id).toBe('legacy')
    expect(meta.files).toContain('manifest.yaml')
  })

  describe('bundle.launch.json (agent #6046)', () => {
    beforeEach(() => {
      writeFileSync(join(dir, 'manifest.demo.yaml'), manifest('demo'))
      mkdirSync(join(dir, 'server'), { recursive: true })
      writeFileSync(join(dir, 'server', 'index.js'), 'x\n')
    })

    it('omits launch when no bundle.launch.json exists', () => {
      const r = pack(dir)
      expect(r.status).toBe(0)
      const meta = JSON.parse(readFileSync(join(dir, 'bundle.meta.json'), 'utf8'))
      expect(meta.launch).toBeUndefined()
    })

    it('embeds a valid launch block', () => {
      writeFileSync(
        join(dir, 'bundle.launch.json'),
        JSON.stringify({ entry: 'server/index.js', cwd: '.', env: { FOO: 'bar' }, health_path: '/api/health' }),
      )
      const r = pack(dir)
      expect(r.status).toBe(0)
      const meta = JSON.parse(readFileSync(join(dir, 'bundle.meta.json'), 'utf8'))
      expect(meta.launch).toEqual({ entry: 'server/index.js', cwd: '.', env: { FOO: 'bar' }, health_path: '/api/health' })
    })

    it('rejects an entry that is not a .js file', () => {
      writeFileSync(join(dir, 'bundle.launch.json'), JSON.stringify({ entry: 'server/index.py' }))
      const r = pack(dir)
      expect(r.status).not.toBe(0)
      expect(r.stderr).toContain('entry')
    })

    it('rejects an entry that is not present in the bundle', () => {
      writeFileSync(join(dir, 'bundle.launch.json'), JSON.stringify({ entry: 'server/missing.js' }))
      const r = pack(dir)
      expect(r.status).not.toBe(0)
      expect(r.stderr).toContain('not in the bundle')
    })

    it('rejects a path-traversal / absolute entry', () => {
      writeFileSync(join(dir, 'bundle.launch.json'), JSON.stringify({ entry: '../evil.js' }))
      expect(pack(dir).status).not.toBe(0)
      writeFileSync(join(dir, 'bundle.launch.json'), JSON.stringify({ entry: '/etc/evil.js' }))
      expect(pack(dir).status).not.toBe(0)
    })

    it('rejects an unknown launch key', () => {
      writeFileSync(
        join(dir, 'bundle.launch.json'),
        JSON.stringify({ entry: 'server/index.js', run: 'rm -rf /' }),
      )
      const r = pack(dir)
      expect(r.status).not.toBe(0)
      expect(r.stderr).toContain('unknown key')
    })
  })
})
