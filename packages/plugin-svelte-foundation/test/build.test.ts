import { describe, expect, it } from 'vitest'
import {
  NODE_BUILTINS,
  nodeBuiltinsStubPlugin,
  pluginBundleConfig,
} from '../src/build/esbuild-config.js'

describe('pluginBundleConfig', () => {
  it('liefert defaults für browser-platform + esm + splitting', () => {
    const cfg = pluginBundleConfig({
      componentTag: 'plugin-test-foo',
      entry: 'src/foo.ts',
      outdir: 'dist/ui',
    })
    expect(cfg.format).toBe('esm')
    expect(cfg.platform).toBe('browser')
    expect(cfg.splitting).toBe(true)
    expect(cfg.bundle).toBe(true)
    expect(cfg.minify).toBe(true)
    expect(cfg.target).toBe('es2022')
  })

  it('external default leer (Drift #20+#21)', () => {
    const cfg = pluginBundleConfig({
      componentTag: 'plugin-test-foo',
      entry: 'src/foo.ts',
      outdir: 'dist/ui',
    })
    expect(cfg.external).toEqual([])
  })

  it('external override-bar', () => {
    const cfg = pluginBundleConfig({
      componentTag: 'plugin-test-foo',
      entry: 'src/foo.ts',
      outdir: 'dist/ui',
      external: ['some-cdn-package'],
    })
    expect(cfg.external).toEqual(['some-cdn-package'])
  })

  it('process.env.NODE_ENV defined als production', () => {
    const cfg = pluginBundleConfig({
      componentTag: 'plugin-test-foo',
      entry: 'src/foo.ts',
      outdir: 'dist/ui',
    })
    expect(cfg.define['process.env.NODE_ENV']).toBe('"production"')
  })
})

describe('nodeBuiltinsStubPlugin (Drift #13 mitigation)', () => {
  it('NODE_BUILTINS enthält alle commonly-used builtins', () => {
    expect(NODE_BUILTINS).toContain('fs')
    expect(NODE_BUILTINS).toContain('path')
    expect(NODE_BUILTINS).toContain('crypto')
    expect(NODE_BUILTINS).toContain('stream')
    expect(NODE_BUILTINS).toContain('util')
  })

  it('plugin returns object mit name + setup', () => {
    const plug = nodeBuiltinsStubPlugin()
    expect(plug.name).toBe('nexus-node-builtins-stub')
    expect(typeof plug.setup).toBe('function')
  })

  it('setup registriert onResolve + onLoad für builtin-pattern', () => {
    const plug = nodeBuiltinsStubPlugin()
    const resolveFilters: Array<{ filter: RegExp }> = []
    const loadResults: Array<{ contents: string; loader: 'js' }> = []

    const fakeBuild = {
      onResolve: (filter: { filter: RegExp }, _cb: unknown) => {
        resolveFilters.push(filter)
      },
      onLoad: (
        _filter: { filter: RegExp; namespace: string },
        cb: () => { contents: string; loader: 'js' },
      ) => {
        loadResults.push(cb())
      },
    }
    plug.setup(fakeBuild)
    expect(resolveFilters).toHaveLength(1)
    expect(resolveFilters[0]!.filter.test('fs')).toBe(true)
    expect(resolveFilters[0]!.filter.test('node:fs')).toBe(true)
    expect(resolveFilters[0]!.filter.test('not-a-builtin')).toBe(false)
    expect(loadResults[0]).toEqual({ contents: 'module.exports = {};', loader: 'js' })
  })
})
