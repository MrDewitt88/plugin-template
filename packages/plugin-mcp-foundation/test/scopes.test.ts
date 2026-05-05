import { describe, expect, it } from 'vitest'
import { checkScopes } from '../src/scopes/scope-check.js'
import type { NormalizedTool } from '../src/tools/types.js'

const READ_TOOL: NormalizedTool = {
  name: 'documents.list',
  description: undefined,
  input_schema: undefined,
  output_schema: undefined,
  scopes_required: [],
}

const WRITE_TOOL: NormalizedTool = {
  name: 'documents.create',
  description: undefined,
  input_schema: undefined,
  output_schema: undefined,
  scopes_required: ['mcp.write.documents'],
}

describe('checkScopes — Phase-3 union-with semantics', () => {
  it('plugin-wide reicht für tool ohne tool-specific', () => {
    const r = checkScopes({
      pluginWideScopes: ['mcp.read.documents'],
      callerScopes: ['mcp.read.documents'],
      tool: READ_TOOL,
    })
    expect(r.ok).toBe(true)
    expect(r.required).toEqual(['mcp.read.documents'])
    expect(r.missing).toEqual([])
  })

  it('tool-specific extends plugin-wide', () => {
    const r = checkScopes({
      pluginWideScopes: ['mcp.read.documents'],
      callerScopes: ['mcp.read.documents', 'mcp.write.documents'],
      tool: WRITE_TOOL,
    })
    expect(r.ok).toBe(true)
    expect(r.required.sort()).toEqual(['mcp.read.documents', 'mcp.write.documents'])
  })

  it('missing tool-specific → fail', () => {
    const r = checkScopes({
      pluginWideScopes: ['mcp.read.documents'],
      callerScopes: ['mcp.read.documents'], // missing write
      tool: WRITE_TOOL,
    })
    expect(r.ok).toBe(false)
    expect(r.missing).toEqual(['mcp.write.documents'])
  })

  it('missing plugin-wide → fail (auch wenn tool-specific erfüllt)', () => {
    const r = checkScopes({
      pluginWideScopes: ['mcp.read.documents'],
      callerScopes: ['mcp.write.documents'], // missing read-floor
      tool: WRITE_TOOL,
    })
    expect(r.ok).toBe(false)
    expect(r.missing).toEqual(['mcp.read.documents'])
  })

  it('union dedup — plugin-wide + tool-specific überlappen', () => {
    const r = checkScopes({
      pluginWideScopes: ['mcp.read.documents'],
      callerScopes: ['mcp.read.documents', 'mcp.write.documents'],
      tool: {
        ...WRITE_TOOL,
        scopes_required: ['mcp.read.documents', 'mcp.write.documents'], // overlap
      },
    })
    expect(r.ok).toBe(true)
    expect(r.required.sort()).toEqual(['mcp.read.documents', 'mcp.write.documents'])
  })
})

describe('checkScopes — Wildcard-Convention', () => {
  it('wildcard matched concrete scope', () => {
    const r = checkScopes({
      pluginWideScopes: [],
      callerScopes: ['mcp.plugin.*'],
      tool: { ...READ_TOOL, scopes_required: ['mcp.plugin.markview.read'] },
    })
    expect(r.ok).toBe(true)
  })

  it('wildcard matched genau prefix', () => {
    const r = checkScopes({
      pluginWideScopes: [],
      callerScopes: ['mcp.plugin.*'],
      tool: { ...READ_TOOL, scopes_required: ['mcp.plugin'] },
    })
    expect(r.ok).toBe(true)
  })

  it('wildcard matched NICHT andere prefix', () => {
    const r = checkScopes({
      pluginWideScopes: [],
      callerScopes: ['mcp.plugin.*'],
      tool: { ...READ_TOOL, scopes_required: ['mcp.read.notes'] },
    })
    expect(r.ok).toBe(false)
    expect(r.missing).toEqual(['mcp.read.notes'])
  })

  it('exact-scope ohne wildcard', () => {
    const r = checkScopes({
      pluginWideScopes: [],
      callerScopes: ['mcp.read.documents'],
      tool: { ...READ_TOOL, scopes_required: ['mcp.read.documents'] },
    })
    expect(r.ok).toBe(true)
  })
})

describe('checkScopes — empty cases', () => {
  it('empty required + empty caller → ok', () => {
    const r = checkScopes({
      pluginWideScopes: [],
      callerScopes: [],
      tool: READ_TOOL,
    })
    expect(r.ok).toBe(true)
    expect(r.required).toEqual([])
  })

  it('empty caller + non-empty required → fail', () => {
    const r = checkScopes({
      pluginWideScopes: ['x'],
      callerScopes: [],
      tool: READ_TOOL,
    })
    expect(r.ok).toBe(false)
    expect(r.missing).toEqual(['x'])
  })
})
