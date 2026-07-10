import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { scaffold, ScaffoldError } from '../src/scaffolders/scaffold.js'

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'create-plugin-test-'))
})

afterEach(() => {
  try {
    rmSync(tmpDir, { recursive: true, force: true })
  } catch {
    /* ignore */
  }
})

describe('scaffold', () => {
  it('schreibt root files + bridge package by default', () => {
    const target = join(tmpDir, 'my-plugin')
    const r = scaffold({
      pluginName: 'my-plugin',
      hosts: ['teammind'],
      features: ['bridge'],
      target,
    })
    expect(r.target).toBe(target)
    expect(existsSync(join(target, 'package.json'))).toBe(true)
    expect(existsSync(join(target, 'pnpm-workspace.yaml'))).toBe(true)
    expect(existsSync(join(target, 'tsconfig.base.json'))).toBe(true)
    expect(existsSync(join(target, 'README.md'))).toBe(true)
    expect(existsSync(join(target, 'CLAUDE.md'))).toBe(true)
    // manifest.<id>.yaml (CODEX-REV §13.8) — NOT the bare manifest.yaml
    expect(existsSync(join(target, 'manifest.my-plugin.yaml'))).toBe(true)
    expect(existsSync(join(target, 'manifest.yaml'))).toBe(false)
    expect(existsSync(join(target, 'docs/ARCHITECTURE.md'))).toBe(true)
    // Node 24 pins + notices + bundle packer (static asset)
    expect(existsSync(join(target, '.node-version'))).toBe(true)
    expect(existsSync(join(target, '.nvmrc'))).toBe(true)
    expect(existsSync(join(target, 'NOTICES'))).toBe(true)
    expect(existsSync(join(target, 'scripts/pack-bundle.mjs'))).toBe(true)
    // bridge package
    expect(existsSync(join(target, 'packages/my-plugin-bridge/package.json'))).toBe(true)
    expect(existsSync(join(target, 'packages/my-plugin-bridge/src/index.ts'))).toBe(true)
  })

  it('renders {{pluginName}}-placeholders korrekt', () => {
    const target = join(tmpDir, 'cool-plugin')
    scaffold({
      pluginName: 'cool-plugin',
      hosts: ['teammind'],
      features: ['bridge'],
      target,
    })
    const pkg = readFileSync(join(target, 'package.json'), 'utf-8')
    expect(pkg).toContain('"name": "cool-plugin"')
    const manifest = readFileSync(join(target, 'manifest.cool-plugin.yaml'), 'utf-8')
    expect(manifest).toContain('id: cool-plugin')
    expect(manifest).toContain('apps: [teammind]')
    expect(manifest).toContain('service_endpoint: http://127.0.0.1:3600')
  })

  it('renders {{pluginNamePascal}} in CLAUDE.md', () => {
    const target = join(tmpDir, 'my-plugin')
    scaffold({
      pluginName: 'my-plugin',
      hosts: ['teammind'],
      features: ['bridge'],
      target,
    })
    const claude = readFileSync(join(target, 'CLAUDE.md'), 'utf-8')
    expect(claude).toContain('# MyPlugin — Engineering-Regeln')
    expect(claude).toContain('"my-plugin-cc"')
  })

  it('throws bei target-exists default', () => {
    const target = join(tmpDir, 'foo')
    scaffold({ pluginName: 'foo', hosts: ['teammind'], features: ['bridge'], target })
    expect(() =>
      scaffold({ pluginName: 'foo', hosts: ['teammind'], features: ['bridge'], target }),
    ).toThrow(ScaffoldError)
  })

  it('--force overrides target-exists', () => {
    const target = join(tmpDir, 'foo')
    scaffold({ pluginName: 'foo', hosts: ['teammind'], features: ['bridge'], target })
    expect(() =>
      scaffold({
        pluginName: 'foo',
        hosts: ['teammind'],
        features: ['bridge'],
        target,
        force: true,
      }),
    ).not.toThrow()
  })

  it('skipt feature-files wenn feature nicht in features-list', () => {
    const target = join(tmpDir, 'my-plugin')
    scaffold({
      pluginName: 'my-plugin',
      hosts: ['teammind'],
      features: [], // no bridge feature → bridge-package files skipped
      target,
    })
    expect(existsSync(join(target, 'package.json'))).toBe(true) // root file
    expect(existsSync(join(target, 'packages/my-plugin-bridge/package.json'))).toBe(false)
  })

  it('returns filesWritten list', () => {
    const target = join(tmpDir, 'my-plugin')
    const r = scaffold({
      pluginName: 'my-plugin',
      hosts: ['teammind'],
      features: ['bridge'],
      target,
    })
    expect(r.filesWritten.length).toBeGreaterThan(5)
    expect(r.filesWritten).toContain('package.json')
  })

  it('returns context für caller-summary', () => {
    const target = join(tmpDir, 'my-plugin')
    const r = scaffold({
      pluginName: 'my-plugin',
      hosts: ['teammind', 'theseus'],
      features: ['bridge', 'mcp'],
      target,
    })
    expect(r.context.pluginName).toBe('my-plugin')
    expect(r.context.pluginNamePascal).toBe('MyPlugin')
    expect(r.context.hosts).toEqual(['teammind', 'theseus'])
  })
})
