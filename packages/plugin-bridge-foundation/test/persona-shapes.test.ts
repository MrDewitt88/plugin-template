// v0.5.0: Persona-anchor shape-contract tests. Validates the SHAPE-ONLY surface
// (Zod-schemas + types + v0.6.0-runtime-contract). No runtime helper to test
// yet — that arrives in v0.6.0.

import { describe, expect, it } from 'vitest'
import {
  PersonaAnchorInputSchema,
  PersonaDiaryEntrySchema,
  PersonaDiarySchema,
  PersonaLocaleSchema,
  PersonaMemorySchema,
  PersonaRelationshipDispositionSchema,
  PersonaSoulSchema,
  type BuildPersonaPromptFn,
  type PersonaAnchoredAgent,
  type PersonaAnchoredAgentOptions,
  type PersonaAnchorInput,
  type PersonaPromptBuildResult,
} from '../src/persona/index.js'

describe('@nexus-mindgarden/plugin-bridge-foundation/persona — shape-contract', () => {
  describe('PersonaSoulSchema', () => {
    it('parses a minimal soul', () => {
      const valid: unknown = { name: 'Lyra', tone: 'warm' }
      const parsed = PersonaSoulSchema.parse(valid)
      expect(parsed.values).toEqual([]) // default
      expect(parsed.name).toBe('Lyra')
    })

    it('rejects empty name + empty tone', () => {
      expect(() => PersonaSoulSchema.parse({ name: '', tone: 'x' })).toThrow()
      expect(() => PersonaSoulSchema.parse({ name: 'x', tone: '' })).toThrow()
    })

    it('preserves values array', () => {
      const parsed = PersonaSoulSchema.parse({
        name: 'Lyra',
        tone: 'warm',
        values: ['curiosity', 'loyalty'],
      })
      expect(parsed.values).toEqual(['curiosity', 'loyalty'])
    })
  })

  describe('PersonaDiaryEntrySchema + PersonaDiarySchema', () => {
    it('accepts ISO timestamp', () => {
      const parsed = PersonaDiaryEntrySchema.parse({
        when: '2026-05-21T19:00:00Z',
        what: 'Met a stranger at the crossroads.',
      })
      expect(parsed.when).toBe('2026-05-21T19:00:00Z')
    })

    it('accepts relative timing string ("two scenes ago")', () => {
      const parsed = PersonaDiaryEntrySchema.parse({
        when: 'two scenes ago',
        what: 'Found a key.',
      })
      expect(parsed.when).toBe('two scenes ago')
    })

    it('diary entries default to []', () => {
      const parsed = PersonaDiarySchema.parse({})
      expect(parsed.entries).toEqual([])
    })
  })

  describe('PersonaMemorySchema', () => {
    it('both arrays default to []', () => {
      const parsed = PersonaMemorySchema.parse({})
      expect(parsed.recent).toEqual([])
      expect(parsed.persistent).toEqual([])
    })

    it('preserves hot/cold split', () => {
      const parsed = PersonaMemorySchema.parse({
        recent: ['user asked about the river'],
        persistent: ['Lyra was born in the lowlands'],
      })
      expect(parsed.recent).toHaveLength(1)
      expect(parsed.persistent).toHaveLength(1)
    })
  })

  describe('PersonaLocaleSchema (wiz-mind extension #1)', () => {
    it('accepts de + en', () => {
      expect(PersonaLocaleSchema.parse('de')).toBe('de')
      expect(PersonaLocaleSchema.parse('en')).toBe('en')
    })

    it('rejects unsupported locales — additive expansion required for new locales', () => {
      expect(() => PersonaLocaleSchema.parse('fr')).toThrow()
      expect(() => PersonaLocaleSchema.parse('es')).toThrow()
    })
  })

  describe('PersonaRelationshipDispositionSchema (wiz-mind extension #4)', () => {
    it('accepts all 5 canonical states including dead', () => {
      for (const state of ['trust', 'neutral', 'distrust', 'hostile', 'dead'] as const) {
        expect(PersonaRelationshipDispositionSchema.parse(state)).toBe(state)
      }
    })

    it('rejects non-canonical states', () => {
      expect(() => PersonaRelationshipDispositionSchema.parse('friendly')).toThrow()
      expect(() => PersonaRelationshipDispositionSchema.parse('unknown')).toThrow()
    })
  })

  describe('PersonaAnchorInputSchema — canonical input', () => {
    it('parses a minimal valid anchor (required fields only)', () => {
      const minimal: unknown = {
        soul: { name: 'Lyra', tone: 'warm' },
        diary: {},
        memory: {},
        locale: 'de',
        setting_anchor: 'high-fantasy, post-cataclysm',
      }
      const parsed = PersonaAnchorInputSchema.parse(minimal)
      expect(parsed.locale).toBe('de')
      expect(parsed.setting_anchor).toBe('high-fantasy, post-cataclysm')
      expect(parsed.npc_voice_style).toBeUndefined()
      expect(parsed.relationship_disposition).toBeUndefined()
      expect(parsed.npc_id).toBeUndefined()
    })

    it('parses a full anchor with all optional fields populated', () => {
      const full: PersonaAnchorInput = {
        soul: {
          name: 'Lyra, the Cartographer',
          values: ['curiosity', 'loyalty to the user'],
          tone: 'warm, slightly melancholic',
        },
        diary: {
          entries: [
            { when: 'two scenes ago', what: 'Met a stranger at the crossroads.' },
            { when: '2026-05-21T19:00:00Z', what: 'Found a battered map.' },
          ],
        },
        memory: {
          recent: ['User asked about the eastern river.', 'I described the swamp.'],
          persistent: ['Lyra was born in the lowlands.', 'Lyra fears deep water.'],
        },
        locale: 'en',
        setting_anchor: 'high-fantasy, post-cataclysm',
        npc_voice_style: 'slow-paced, formal address',
        relationship_disposition: 'trust',
        npc_id: 'npc_lyra_001',
      }
      const parsed = PersonaAnchorInputSchema.parse(full)
      expect(parsed.npc_id).toBe('npc_lyra_001')
      expect(parsed.relationship_disposition).toBe('trust')
      expect(parsed.diary.entries).toHaveLength(2)
    })

    it('rejects missing locale (required, no Foundation-default)', () => {
      const noLocale = {
        soul: { name: 'Lyra', tone: 'warm' },
        diary: {},
        memory: {},
        setting_anchor: 'high-fantasy',
      }
      expect(() => PersonaAnchorInputSchema.parse(noLocale)).toThrow()
    })

    it('rejects empty setting_anchor (Granite-Floor §3.5: required to prevent contemporary-fiction drift)', () => {
      const emptyAnchor = {
        soul: { name: 'Lyra', tone: 'warm' },
        diary: {},
        memory: {},
        locale: 'de',
        setting_anchor: '',
      }
      expect(() => PersonaAnchorInputSchema.parse(emptyAnchor)).toThrow()
    })

    it('supports dead-NPC anchoring (DIARY-callback use-case)', () => {
      const deadNpc: PersonaAnchorInput = {
        soul: { name: 'Grimm the Elder', tone: 'gravelly, fading' },
        diary: {
          entries: [{ when: 'three scenes ago', what: 'Grimm fell at the river crossing.' }],
        },
        memory: { recent: [], persistent: ['Grimm taught the user to read maps.'] },
        locale: 'en',
        setting_anchor: 'high-fantasy, post-cataclysm',
        relationship_disposition: 'dead',
        npc_id: 'npc_grimm_001',
      }
      const parsed = PersonaAnchorInputSchema.parse(deadNpc)
      expect(parsed.relationship_disposition).toBe('dead')
    })
  })

  describe('v0.6.0+ runtime-contract types are structurally importable', () => {
    it('PersonaPromptBuildResult shape compiles', () => {
      const result: PersonaPromptBuildResult = {
        systemPrompt: 'You are Lyra...',
        userPrompt: 'What do you see at the river?',
      }
      expect(result.systemPrompt).toContain('Lyra')
    })

    it('BuildPersonaPromptFn signature is valid', () => {
      const fn: BuildPersonaPromptFn = (anchor) => ({
        systemPrompt: `You are ${anchor.soul.name}. Setting: ${anchor.setting_anchor}.`,
        userPrompt: 'placeholder',
      })
      const out = fn({
        soul: { name: 'Lyra', tone: 'warm', values: [] },
        diary: { entries: [] },
        memory: { recent: [], persistent: [] },
        locale: 'de',
        setting_anchor: 'high-fantasy',
      })
      expect(out.systemPrompt).toContain('Lyra')
      expect(out.systemPrompt).toContain('high-fantasy')
    })

    it('PersonaAnchoredAgentOptions accepts buildPrompt override', () => {
      const opts: PersonaAnchoredAgentOptions = {
        agentCompleteEndpoint: 'https://host.example/agent/complete',
        anchor: {
          soul: { name: 'Lyra', tone: 'warm', values: [] },
          diary: { entries: [] },
          memory: { recent: [], persistent: [] },
          locale: 'de',
          setting_anchor: 'high-fantasy',
        },
        buildPrompt: (a) => ({
          systemPrompt: `${a.soul.name}!`,
          userPrompt: '',
        }),
      }
      expect(opts.buildPrompt).toBeDefined()
    })

    it('PersonaAnchoredAgent.complete returns Promise<{ text }>', async () => {
      // Mock-only — verifies type-shape, not runtime behavior (no runtime yet).
      const fakeAgent: PersonaAnchoredAgent = {
        complete: async (_userPrompt) => ({ text: 'mock response' }),
      }
      const out = await fakeAgent.complete('hello')
      expect(out.text).toBe('mock response')
    })
  })

  describe('multi-NPC parallel-instances pattern (wiz-mind msg #570)', () => {
    it('supports independent anchors per NPC (NOT a Record<NpcId, ...>-map)', () => {
      // Pattern: each NPC gets its own PersonaAnchorInput — caller manages
      // a list/iteration over instances. The shape does not enforce or
      // require a multi-NPC container; npc_id is optional metadata only.
      const npcs: PersonaAnchorInput[] = [
        {
          soul: { name: 'Lyra', tone: 'warm', values: [] },
          diary: { entries: [] },
          memory: { recent: [], persistent: [] },
          locale: 'de',
          setting_anchor: 'high-fantasy',
          npc_id: 'npc_lyra',
        },
        {
          soul: { name: 'Grimm', tone: 'gravelly', values: [] },
          diary: { entries: [] },
          memory: { recent: [], persistent: [] },
          locale: 'de',
          setting_anchor: 'high-fantasy',
          npc_id: 'npc_grimm',
          relationship_disposition: 'distrust',
        },
      ]
      expect(npcs.map((n) => n.npc_id)).toEqual(['npc_lyra', 'npc_grimm'])
      // Different disposition per NPC — pattern works.
      expect(npcs[1]!.relationship_disposition).toBe('distrust')
    })
  })
})
