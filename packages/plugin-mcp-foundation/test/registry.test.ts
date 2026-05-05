import { describe, expect, it } from 'vitest'
import { ToolRegistry, ToolRegistryError } from '../src/tools/registry.js'
import { normalizeMcpToolEntry } from '../src/tools/types.js'

describe('normalizeMcpToolEntry', () => {
  it('string-form → { name, undefineds, [] }', () => {
    const t = normalizeMcpToolEntry('documents.list')
    expect(t.name).toBe('documents.list')
    expect(t.description).toBeUndefined()
    expect(t.input_schema).toBeUndefined()
    expect(t.output_schema).toBeUndefined()
    expect(t.scopes_required).toEqual([])
  })

  it('object-form → propagated', () => {
    const t = normalizeMcpToolEntry({
      name: 'documents.create',
      description: 'Create doc',
      input_schema: { type: 'object', required: ['title'] },
      output_schema: { type: 'object' },
      scopes_required: ['mcp.write.documents'],
    })
    expect(t.name).toBe('documents.create')
    expect(t.description).toBe('Create doc')
    expect(t.input_schema).toEqual({ type: 'object', required: ['title'] })
    expect(t.scopes_required).toEqual(['mcp.write.documents'])
  })

  it('object-form ohne scopes_required → empty []', () => {
    const t = normalizeMcpToolEntry({ name: 'foo.bar' })
    expect(t.scopes_required).toEqual([])
  })
})

describe('ToolRegistry', () => {
  it('registerFromManifest mixed-form (string + object)', () => {
    const reg = new ToolRegistry()
    reg.registerFromManifest([
      'documents.list',
      {
        name: 'documents.create',
        description: 'Create doc',
        scopes_required: ['mcp.write.documents'],
      },
      'documents.delete',
    ])
    expect(reg.list()).toHaveLength(3)
    expect(reg.get('documents.list')?.scopes_required).toEqual([])
    expect(reg.get('documents.create')?.scopes_required).toEqual(['mcp.write.documents'])
  })

  it('rejected duplicate tool-names', () => {
    const reg = new ToolRegistry()
    reg.registerFromManifest(['documents.list'])
    expect(() => reg.registerFromManifest(['documents.list'])).toThrow(ToolRegistryError)
    expect(() =>
      reg.registerFromManifest([{ name: 'documents.list', description: 'dup' }]),
    ).toThrow(ToolRegistryError)
  })

  it('rejected invalid tool-name (uppercase, dash)', () => {
    const reg = new ToolRegistry()
    expect(() => reg.registerFromManifest(['Documents.List'])).toThrow(ToolRegistryError)
    expect(() => reg.registerFromManifest(['docs-create'])).toThrow(ToolRegistryError)
  })

  it('has() + get() + list() basic ops', () => {
    const reg = new ToolRegistry()
    reg.registerFromManifest(['a.b'])
    expect(reg.has('a.b')).toBe(true)
    expect(reg.has('c.d')).toBe(false)
    expect(reg.get('a.b')?.name).toBe('a.b')
    expect(reg.get('c.d')).toBeNull()
    expect(reg.list()).toHaveLength(1)
  })

  it('clear() resets registry', () => {
    const reg = new ToolRegistry()
    reg.registerFromManifest(['a.b'])
    reg.clear()
    expect(reg.list()).toHaveLength(0)
    expect(reg.has('a.b')).toBe(false)
  })

  it('register() single + return tool', () => {
    const reg = new ToolRegistry()
    const t = reg.register({ name: 'foo.bar', description: 'D' })
    expect(t.name).toBe('foo.bar')
    expect(t.description).toBe('D')
  })
})
