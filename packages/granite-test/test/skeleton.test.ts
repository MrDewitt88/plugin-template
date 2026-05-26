// v0.0.1 skeleton smoke-tests. Validates the spec-v1 contract-shapes parse
// correctly + the API surfaces are importable. Full impl tests land
// post-decision-gate.

import { describe, expect, it } from 'vitest'
import {
  defineGraniteToolTest,
  FailCategorySchema,
  GRANITE_FLOOR_EVENT_KIND,
  GraniteFloorEventSchema,
  ModeSchema,
  PersonaSchema,
  ReportToClusterError,
  reportToCluster,
  type GraniteFloorEvent,
  type GraniteToolTest,
} from '../src/index.js'

describe('@nexus-mindgarden/granite-test — skeleton', () => {
  describe('GRANITE_FLOOR_EVENT_KIND', () => {
    it('is the canonical spec-v1 discriminator', () => {
      expect(GRANITE_FLOOR_EVENT_KIND).toBe('granite-floor.event.v1')
    })
  })

  describe('PersonaSchema (agent msg #701 dual-mode)', () => {
    it('accepts user / admin / any', () => {
      for (const p of ['user', 'admin', 'any'] as const) {
        expect(PersonaSchema.parse(p)).toBe(p)
      }
    })

    it('rejects non-canonical personas (e.g. NPC names — would need v2)', () => {
      expect(() => PersonaSchema.parse('lyra')).toThrow()
      expect(() => PersonaSchema.parse('kiara')).toThrow()
    })
  })

  describe('ModeSchema', () => {
    it('accepts ci / wild', () => {
      expect(ModeSchema.parse('ci')).toBe('ci')
      expect(ModeSchema.parse('wild')).toBe('wild')
    })
  })

  describe('FailCategorySchema (6 fix in v1)', () => {
    it('accepts all 6 canonical categories', () => {
      for (const c of [
        'schema-issue',
        'multiturn-state-loss',
        'hallucination',
        'silent-fail',
        'length-exceeded',
        'latency-spike',
      ] as const) {
        expect(FailCategorySchema.parse(c)).toBe(c)
      }
    })

    it('rejects new categories (would require v2 spec-bump)', () => {
      expect(() => FailCategorySchema.parse('rate-limit')).toThrow()
      expect(() => FailCategorySchema.parse('network-error')).toThrow()
    })
  })

  describe('GraniteFloorEventSchema (spec v1)', () => {
    const baseEvent: GraniteFloorEvent = {
      event_kind: 'granite-floor.event.v1',
      run_id: '00000000-0000-4000-8000-000000000001',
      case_id: 'kabel.16A-25m',
      repo: 'plug-elec',
      tool: 'plug-elec.kabel.dimensionierung',
      persona: 'user',
      mode: 'ci',
      outcome: 'pass',
      fail_category: null,
      fail_detail: null,
      model: 'granite-4-h-tiny-4bit',
      latency_ms: 3421,
      timestamp: '2026-05-24T11:30:00.000Z',
    }

    it('parses a minimal pass-event', () => {
      const parsed = GraniteFloorEventSchema.parse(baseEvent)
      expect(parsed.outcome).toBe('pass')
      expect(parsed.fail_category).toBeNull()
    })

    it('parses a fail-event with category + detail', () => {
      const failEvent = {
        ...baseEvent,
        outcome: 'fail' as const,
        fail_category: 'latency-spike' as const,
        fail_detail: 'exceeded 8000ms budget',
      }
      const parsed = GraniteFloorEventSchema.parse(failEvent)
      expect(parsed.fail_category).toBe('latency-spike')
    })

    it('enforces outcome=fail ⇒ fail_category non-null', () => {
      const broken = { ...baseEvent, outcome: 'fail' as const, fail_category: null }
      expect(() => GraniteFloorEventSchema.parse(broken)).toThrow()
    })

    it('enforces outcome=pass ⇒ fail_category null', () => {
      const broken = {
        ...baseEvent,
        outcome: 'pass' as const,
        fail_category: 'silent-fail' as const,
      }
      expect(() => GraniteFloorEventSchema.parse(broken)).toThrow()
    })

    it('accepts optional multiturn telemetry', () => {
      const withMultiturn = {
        ...baseEvent,
        multiturn: {
          step_count: 3,
          failed_at_step: null,
          expected_tools: ['wiz-mind.scene.next', 'wiz-mind.diary.append'],
        },
      }
      expect(GraniteFloorEventSchema.parse(withMultiturn).multiturn?.step_count).toBe(3)
    })

    it('accepts CI-mode replay_bundle with verbatim user_prompt (synthetic fixtures OK)', () => {
      const withReplay = {
        ...baseEvent,
        mode: 'ci' as const,
        replay_bundle: {
          system_prompt_hash: 'sha256:abc',
          user_prompt: 'Dimensioniere 16A 25m',
          granite_response: '{"tool":"calendar.events.create","args":{}}',
          tool_state_before: { existing_records: 0 },
          tool_state_after: { existing_records: 1 },
        },
      }
      const parsed = GraniteFloorEventSchema.parse(withReplay)
      expect((parsed.replay_bundle as { user_prompt: string }).user_prompt).toBe(
        'Dimensioniere 16A 25m',
      )
    })

    it('accepts wild-mode replay_bundle with user_prompt_hash (PII-safe)', () => {
      const withReplay = {
        ...baseEvent,
        mode: 'wild' as const,
        replay_bundle: {
          system_prompt_hash: 'sha256:def',
          user_prompt_hash: 'sha256:abc123',
          granite_response: '{"tool":"x","args":{}}',
          local_log_ref: 'diary:2026-05-24:42',
        },
      }
      expect(() => GraniteFloorEventSchema.parse(withReplay)).not.toThrow()
    })

    it('REJECTS wild-mode replay_bundle with verbatim user_prompt (PII guard, spec v1.1)', () => {
      const broken = {
        ...baseEvent,
        mode: 'wild' as const,
        replay_bundle: {
          system_prompt_hash: 'sha256:def',
          user_prompt: 'real user input — PII leak risk',
          granite_response: '{}',
        },
      }
      expect(() => GraniteFloorEventSchema.parse(broken)).toThrow(/PII guard/)
    })

    it('accepts optional runner_scrubbed attestation (v1.1 additive)', () => {
      const withAttestation = { ...baseEvent, runner_scrubbed: true }
      expect(GraniteFloorEventSchema.parse(withAttestation).runner_scrubbed).toBe(true)
    })

    it('enforces fail_detail max 500 chars', () => {
      const tooLong = {
        ...baseEvent,
        outcome: 'fail' as const,
        fail_category: 'schema-issue' as const,
        fail_detail: 'x'.repeat(501),
      }
      expect(() => GraniteFloorEventSchema.parse(tooLong)).toThrow()
    })
  })

  describe('defineGraniteToolTest', () => {
    it('returns the config pass-through (v1.0 contract)', () => {
      const test: GraniteToolTest = {
        tool: 'plug-elec.kabel.dimensionierung',
        persona: 'user',
        cases: [
          {
            case_id: 'kabel.16A-25m',
            prompt: 'Dimensioniere 16A 25m',
            expected_tool_args: { strom: 16, laenge: 25 },
            max_latency_ms: 8000,
          },
        ],
      }
      expect(defineGraniteToolTest(test)).toBe(test) // identity-pass-through
    })

    it('supports admin persona for privileged tools', () => {
      const test = defineGraniteToolTest({
        tool: 'plug-elec.project.delete',
        persona: 'admin',
        cases: [],
      })
      expect(test.persona).toBe('admin')
    })
  })

  describe('reportToCluster (skeleton)', () => {
    const validEvent: GraniteFloorEvent = {
      event_kind: 'granite-floor.event.v1',
      run_id: '00000000-0000-4000-8000-000000000002',
      case_id: 'test.case',
      repo: 'plug-tmpl',
      tool: 'plug-tmpl.smoke.test',
      persona: 'any',
      mode: 'ci',
      outcome: 'pass',
      fail_category: null,
      fail_detail: null,
      model: 'granite-4-h-tiny-4bit',
      latency_ms: 100,
      timestamp: '2026-05-24T12:00:00.000Z',
    }

    it('validates + returns events (skeleton passthrough)', async () => {
      const result = await reportToCluster(validEvent)
      expect(result).toHaveLength(1)
      expect(result[0]?.case_id).toBe('test.case')
    })

    it('accepts an array of events', async () => {
      const result = await reportToCluster([validEvent, { ...validEvent, case_id: 'test.case2' }])
      expect(result).toHaveLength(2)
    })

    it('rejects invalid event-shape', async () => {
      const bad = { ...validEvent, outcome: 'fail' as const, fail_category: null }
      await expect(reportToCluster(bad)).rejects.toThrow()
    })

    it('throws ReportToClusterError on missing http_endpoint when transport=http', async () => {
      try {
        await reportToCluster(validEvent, { transport: 'http' })
        expect.fail('should have thrown')
      } catch (err) {
        expect(err).toBeInstanceOf(ReportToClusterError)
        expect((err as ReportToClusterError).code).toBe('http_endpoint_missing')
      }
    })

    it('enforces 64 KB event-size cap', async () => {
      const huge: GraniteFloorEvent = {
        ...validEvent,
        outcome: 'fail',
        fail_category: 'schema-issue',
        fail_detail: 'test fail',
        replay_bundle: {
          system_prompt_hash: 'sha256:x',
          user_prompt: 'x'.repeat(70_000), // > 64 KB
          granite_response: 'y',
        },
      }
      try {
        await reportToCluster(huge)
        expect.fail('should have thrown')
      } catch (err) {
        expect(err).toBeInstanceOf(ReportToClusterError)
        expect((err as ReportToClusterError).code).toBe('event_too_large')
      }
    })
  })
})
