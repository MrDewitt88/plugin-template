import { describe, expect, it } from 'vitest'
import {
  isValidBareName,
  parseNamespacedName,
  synthesizeNamespacedName,
  ToolNamingError,
} from '../src/tools/naming.js'

describe('isValidBareName', () => {
  it('akzeptiert snake_case + dot-namespace', () => {
    expect(isValidBareName('list')).toBe(true)
    expect(isValidBareName('documents.create')).toBe(true)
    expect(isValidBareName('agent.tools.list_models')).toBe(true)
    expect(isValidBareName('a.b.c.d.e')).toBe(true)
  })

  it('rejected uppercase', () => {
    expect(isValidBareName('Documents.Create')).toBe(false)
    expect(isValidBareName('DocList')).toBe(false)
  })

  it('rejected dashes', () => {
    expect(isValidBareName('docs-create')).toBe(false)
  })

  it('rejected leading/trailing dots', () => {
    expect(isValidBareName('.list')).toBe(false)
    expect(isValidBareName('list.')).toBe(false)
    expect(isValidBareName('a..b')).toBe(false)
  })

  it('rejected leading digits', () => {
    expect(isValidBareName('123.go')).toBe(false)
    expect(isValidBareName('list.42abc')).toBe(false)
  })
})

describe('synthesizeNamespacedName', () => {
  it('liefert <plugin>.<tool>', () => {
    expect(synthesizeNamespacedName('markview', 'documents.create')).toBe(
      'markview.documents.create',
    )
    expect(synthesizeNamespacedName('kanban', 'cards.move')).toBe('kanban.cards.move')
  })

  it('throws bei invalid plugin_id', () => {
    expect(() => synthesizeNamespacedName('Bad-ID', 'foo')).toThrow(ToolNamingError)
    expect(() => synthesizeNamespacedName('-leading-dash', 'foo')).toThrow(ToolNamingError)
  })

  it('throws bei invalid bare_name', () => {
    expect(() => synthesizeNamespacedName('mv', 'BadName')).toThrow(ToolNamingError)
    expect(() => synthesizeNamespacedName('mv', '.list')).toThrow(ToolNamingError)
  })
})

describe('parseNamespacedName', () => {
  it('parsed <plugin>.<tool>', () => {
    expect(parseNamespacedName('markview.documents.create')).toEqual({
      pluginId: 'markview',
      bareName: 'documents.create',
    })
    expect(parseNamespacedName('kanban.cards.move')).toEqual({
      pluginId: 'kanban',
      bareName: 'cards.move',
    })
  })

  it('returnt null bei kein dot', () => {
    expect(parseNamespacedName('nodotname')).toBeNull()
  })

  it('returnt null bei invalid plugin_id', () => {
    expect(parseNamespacedName('Bad-Plugin.tool')).toBeNull()
  })

  it('returnt null bei invalid bare_name', () => {
    expect(parseNamespacedName('mv.BadName')).toBeNull()
  })

  it('roundtrip: synthesize → parse → original', () => {
    const ns = synthesizeNamespacedName('markview', 'documents.list')
    expect(parseNamespacedName(ns)).toEqual({
      pluginId: 'markview',
      bareName: 'documents.list',
    })
  })
})
