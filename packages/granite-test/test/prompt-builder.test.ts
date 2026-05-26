// v0.0.3: Zod-enum auto-injection + system-prompt enrichment tests.
// Validates wiz-mind cohort-2 pattern (msg #761) + plug-elec #783 + plug-db #780
// 3-adopter design: enum-injection from Zod-schema → 0/3 → 3/3 schema-pass.

import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { buildEnumInjection, buildSystemPromptEnrichment } from '../src/prompt-builder.js'

describe('buildEnumInjection — Zod-schema auto-derivation', () => {
  it('extracts enum-values from flat z.object', () => {
    const schema = z.object({
      kind_filter: z.enum(['STATIC', 'VERSIONED', 'EVENT']),
      doc_type_filter: z.enum(['kb_card', 'wm_npc_memory']),
    })
    const injection = buildEnumInjection(schema)
    expect(injection).toContain('Available kind_filter values: STATIC, VERSIONED, EVENT.')
    expect(injection).toContain(
      'Available doc_type_filter values: kb_card, wm_npc_memory.',
    )
  })

  it('handles plug-elec switchgear scenario (4-5 enums per tool)', () => {
    const schema = z.object({
      installation_type: z.enum(['A', 'B', 'C', 'D', 'E']),
      rcd_typ: z.enum(['A', 'B', 'F']),
    })
    const injection = buildEnumInjection(schema)
    expect(injection).toContain('Available installation_type values: A, B, C, D, E.')
    expect(injection).toContain('Available rcd_typ values: A, B, F.')
  })

  it('returns empty string when no enums present', () => {
    const schema = z.object({
      title: z.string(),
      count: z.number(),
    })
    expect(buildEnumInjection(schema)).toBe('')
  })

  it('unwraps optional enums', () => {
    const schema = z.object({
      priority: z.enum(['low', 'medium', 'high']).optional(),
    })
    const injection = buildEnumInjection(schema)
    expect(injection).toContain('Available priority values: low, medium, high.')
  })

  it('unwraps nullable enums', () => {
    const schema = z.object({
      status: z.enum(['active', 'archived']).nullable(),
    })
    const injection = buildEnumInjection(schema)
    expect(injection).toContain('Available status values: active, archived.')
  })

  it('recurses one-level into nested objects', () => {
    const schema = z.object({
      filter: z.object({
        kind: z.enum(['a', 'b', 'c']),
      }),
    })
    const injection = buildEnumInjection(schema)
    expect(injection).toContain('Available filter.kind values: a, b, c.')
  })
})

describe('buildSystemPromptEnrichment — full enrichment composition', () => {
  it('composes all 3 hint-types when all inputs present', () => {
    const enrichment = buildSystemPromptEnrichment({
      tool: 'dice.roll',
      parameters: z.object({
        sides: z.number(),
        modifier: z.enum(['advantage', 'disadvantage', 'normal']),
      }),
      expectedToolArgs: { sides: 20, modifier: 'normal' },
      enforceNoTextLeak: true,
    })
    expect(enrichment).toContain('Available modifier values: advantage, disadvantage, normal.')
    expect(enrichment).toContain('To call dice.roll, use the exact shape:')
    expect(enrichment).toContain('"sides":20')
    expect(enrichment).toContain('ALWAYS call the dice.roll tool')
    expect(enrichment).toContain('NEVER describe the result in text')
  })

  it('omits enum-injection if no parameters', () => {
    const enrichment = buildSystemPromptEnrichment({
      tool: 'tool.x',
      expectedToolArgs: { foo: 'bar' },
    })
    expect(enrichment).not.toContain('Available')
    expect(enrichment).toContain('To call tool.x, use the exact shape:')
  })

  it('omits shape-hint if no expectedToolArgs', () => {
    const enrichment = buildSystemPromptEnrichment({
      tool: 'tool.x',
      parameters: z.object({
        mode: z.enum(['fast', 'slow']),
      }),
    })
    expect(enrichment).toContain('Available mode values: fast, slow.')
    expect(enrichment).not.toContain('use the exact shape')
  })

  it('omits no-text-leak directive when enforceNoTextLeak=false (permissive mode)', () => {
    const enrichment = buildSystemPromptEnrichment({
      tool: 'tool.x',
      expectedToolArgs: { foo: 'bar' },
      enforceNoTextLeak: false,
    })
    expect(enrichment).not.toContain('NEVER describe')
  })

  it('enforces no-text-leak directive by default (strict v0.0.3 default)', () => {
    const enrichment = buildSystemPromptEnrichment({
      tool: 'tool.x',
      expectedToolArgs: { foo: 'bar' },
    })
    expect(enrichment).toContain('NEVER describe the result in text')
  })

  it('returns empty string when all inputs absent', () => {
    const enrichment = buildSystemPromptEnrichment({
      tool: 'tool.x',
      enforceNoTextLeak: false,
    })
    expect(enrichment).toBe('')
  })
})
