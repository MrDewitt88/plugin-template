import { describe, expect, it } from 'vitest'
import { ArgsError, parseArgs } from '../src/args.js'

function call(args: string[]) {
  return parseArgs(['node', 'cli.js', ...args])
}

describe('parseArgs', () => {
  it('parses minimal: only plugin-name', () => {
    const r = call(['my-plugin'])
    expect(r.pluginName).toBe('my-plugin')
    expect(r.hosts).toEqual(['teammind', 'theseus'])
    expect(r.features).toContain('mcp')
    expect(r.features).toContain('bridge')
    expect(r.target).toBe('./my-plugin')
    expect(r.help).toBe(false)
  })

  it('--help shows help', () => {
    expect(call(['--help']).help).toBe(true)
    expect(call(['-h']).help).toBe(true)
  })

  it('--hosts override', () => {
    const r = call(['my-plugin', '--hosts=teammind'])
    expect(r.hosts).toEqual(['teammind'])
  })

  it('--features override (bridge always implied)', () => {
    const r = call(['my-plugin', '--features=storage,svelte'])
    expect(r.features).toContain('bridge')
    expect(r.features).toContain('storage')
    expect(r.features).toContain('svelte')
    expect(r.features).not.toContain('mcp')
  })

  it('--target override', () => {
    const r = call(['my-plugin', '--target=/tmp/foo'])
    expect(r.target).toBe('/tmp/foo')
  })

  it('throws missing_name', () => {
    expect(() => call([])).toThrow(ArgsError)
    expect(() => call([])).toThrow(/required/)
  })

  it('throws invalid_name (uppercase)', () => {
    expect(() => call(['MyPlugin'])).toThrow(ArgsError)
  })

  it('throws invalid_name (underscores)', () => {
    expect(() => call(['my_plugin'])).toThrow(ArgsError)
  })

  it('throws invalid_hosts', () => {
    expect(() => call(['my-plugin', '--hosts=bogus'])).toThrow(ArgsError)
  })

  it('throws invalid_features', () => {
    expect(() => call(['my-plugin', '--features=bogus'])).toThrow(ArgsError)
  })

  it('all features explicit', () => {
    const r = call(['my-plugin', '--features=bridge,storage,svelte,mcp'])
    expect(r.features.sort()).toEqual(['bridge', 'mcp', 'storage', 'svelte'])
  })
})
