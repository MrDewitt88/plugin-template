// v0.0.1 skeleton smoke-tests. Validates the spec-v1 contract-shapes parse
// correctly + the API surfaces are importable. Full impl tests land
// post-decision-gate.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_MAX_LATENCY_MS,
  defineGraniteToolTest,
  FailCategorySchema,
  flushPending,
  GRANITE_FLOOR_EVENT_KIND,
  GraniteFloorEventSchema,
  ModeSchema,
  PersonaSchema,
  ReplayBundleCIToolCallSchema,
  ReplayBundleWildToolCallSchema,
  ReportToClusterError,
  reportToCluster,
  resolveReporterConfig,
  type GraniteFloorEvent,
  type GraniteToolTest,
} from '../src/index.js'

describe('@nexus-mindgarden/granite-test — skeleton', () => {
  describe('GRANITE_FLOOR_EVENT_KIND', () => {
    it('is the canonical spec-v1 discriminator', () => {
      expect(GRANITE_FLOOR_EVENT_KIND).toBe('granite-floor.event.v1')
    })
  })

  describe('DEFAULT_MAX_LATENCY_MS (plug-elec Pilot empirical baseline)', () => {
    it('is 60_000ms (60s) — generous headroom over 31-49s p99', () => {
      expect(DEFAULT_MAX_LATENCY_MS).toBe(60_000)
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

    it('rejects categories not yet in enum (would require additive v1.x.y)', () => {
      expect(() => FailCategorySchema.parse('rate-limit')).toThrow()
      expect(() => FailCategorySchema.parse('network-error')).toThrow()
    })

    it('accepts text-leak (v1.1.1 additive, Oracle msg #831)', () => {
      expect(FailCategorySchema.parse('text-leak')).toBe('text-leak')
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

  describe('reportToCluster (v0.0.2 chatbus-transport)', () => {
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

    // Use dry-run for tests — no actual network calls
    beforeEach(() => {
      process.env['GRANITE_TEST_DRY_RUN'] = '1'
      // Reset any pending buffer between tests
    })

    afterEach(async () => {
      // Force-flush any pending buffer to avoid cross-test leaks
      await flushPending().catch(() => {})
      delete process.env['GRANITE_TEST_DRY_RUN']
      delete process.env['CHATBUS_ENDPOINT']
      delete process.env['CHATBUS_TOKEN']
    })

    it('validates + buffers single event (dry-run mode)', async () => {
      const result = await reportToCluster(validEvent)
      expect(result).toHaveLength(1)
      expect(result[0]?.case_id).toBe('test.case')
      await flushPending() // emit buffered event in dry-run log-mode
    })

    it('accepts an array of events (immediate-flush, no buffer)', async () => {
      const result = await reportToCluster([validEvent, { ...validEvent, case_id: 'test.case2' }])
      expect(result).toHaveLength(2)
    })

    it('rejects invalid event-shape with event_validation_failed code', async () => {
      const bad = { ...validEvent, outcome: 'fail' as const, fail_category: null }
      try {
        await reportToCluster(bad as unknown as GraniteFloorEvent)
        expect.fail('should have thrown')
      } catch (err) {
        expect(err).toBeInstanceOf(ReportToClusterError)
        expect((err as ReportToClusterError).code).toBe('event_validation_failed')
      }
    })

    it('throws endpoint_missing when not in dry-run + CHATBUS_ENDPOINT unset', async () => {
      delete process.env['GRANITE_TEST_DRY_RUN']
      try {
        await reportToCluster([validEvent]) // array = immediate-flush
        expect.fail('should have thrown')
      } catch (err) {
        expect(err).toBeInstanceOf(ReportToClusterError)
        expect((err as ReportToClusterError).code).toBe('endpoint_missing')
      }
    })

    it('throws endpoint_missing when transport=http without http_endpoint', async () => {
      delete process.env['GRANITE_TEST_DRY_RUN']
      try {
        await reportToCluster([validEvent], { transport: 'http' })
        expect.fail('should have thrown')
      } catch (err) {
        expect(err).toBeInstanceOf(ReportToClusterError)
        expect((err as ReportToClusterError).code).toBe('endpoint_missing')
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

  describe('resolveReporterConfig (env-resolution)', () => {
    beforeEach(() => {
      delete process.env['CHATBUS_ENDPOINT']
      delete process.env['CHATBUS_TOKEN']
      delete process.env['GRANITE_TEST_DRY_RUN']
      delete process.env['GRANITE_TEST_BATCH_MS']
      delete process.env['GRANITE_TEST_BATCH_N']
    })

    it('reads CHATBUS_ENDPOINT from env', () => {
      process.env['CHATBUS_ENDPOINT'] = 'http://127.0.0.1:7878/api/post_message'
      const config = resolveReporterConfig()
      expect(config.endpoint).toBe('http://127.0.0.1:7878/api/post_message')
    })

    it('reads GRANITE_TEST_DRY_RUN=1 as truthy', () => {
      process.env['GRANITE_TEST_DRY_RUN'] = '1'
      expect(resolveReporterConfig().dryRun).toBe(true)
    })

    it('treats any other GRANITE_TEST_DRY_RUN value as falsy', () => {
      process.env['GRANITE_TEST_DRY_RUN'] = 'true' // strict-1-only by design
      expect(resolveReporterConfig().dryRun).toBe(false)
    })

    it('options.batch_flush_count overrides env', () => {
      process.env['GRANITE_TEST_BATCH_N'] = '100'
      const config = resolveReporterConfig({ batch_flush_count: 25 })
      expect(config.batchFlushCount).toBe(25)
    })

    it('defaults: chatbus transport, 2000ms flush, 50 events', () => {
      const config = resolveReporterConfig()
      expect(config.transport).toBe('chatbus')
      expect(config.batchFlushMs).toBe(2000)
      expect(config.batchFlushCount).toBe(50)
    })
  })

  describe('v0.0.2 tool-call sub-discriminator (oracle msg #732 + wiz-mind suggestion)', () => {
    it('ReplayBundleCIToolCallSchema accepts kind=tool-call with extra fields', () => {
      const bundle = {
        system_prompt_hash: 'sha256:abc',
        user_prompt: 'Schedule a meeting at 2pm',
        granite_response: '{"tool":"calendar.events.create","args":{...}}',
        kind: 'tool-call' as const,
        expected_tool_name: 'calendar.events.create',
        actual_tool_name: 'calendar.events.create',
        actual_tool_args: { time: '14:00' },
        expected_schema_failures: [],
        multiturn_step: 0,
      }
      expect(ReplayBundleCIToolCallSchema.parse(bundle).kind).toBe('tool-call')
    })

    it('ReplayBundleWildToolCallSchema accepts hashed prompt + tool-call extras', () => {
      const bundle = {
        system_prompt_hash: 'sha256:def',
        user_prompt_hash: 'sha256:user123',
        granite_response: '{}',
        local_log_ref: 'diary:2026-05-24:42',
        kind: 'tool-call' as const,
        actual_tool_name: 'projects.cards.move',
      }
      expect(ReplayBundleWildToolCallSchema.parse(bundle).kind).toBe('tool-call')
    })

    it('event with tool-call CI bundle round-trips through GraniteFloorEventSchema', () => {
      const event: GraniteFloorEvent = {
        event_kind: 'granite-floor.event.v1',
        run_id: '00000000-0000-4000-8000-000000000099',
        case_id: 'tool-call-test',
        repo: 'plug-tmpl',
        tool: 'calendar.events.create',
        persona: 'user',
        mode: 'ci',
        outcome: 'fail',
        fail_category: 'hallucination',
        fail_detail: 'tool not found',
        model: 'granite-4-h-tiny-4bit',
        latency_ms: 100,
        timestamp: '2026-05-24T12:00:00.000Z',
        replay_bundle: {
          system_prompt_hash: 'sha256:x',
          user_prompt: 'schedule something',
          granite_response: '{}',
          kind: 'tool-call',
          expected_tool_name: 'calendar.events.create',
          actual_tool_name: 'calendar.create_event', // hallucinated name
          expected_schema_failures: ['expected calendar.events.create, got calendar.create_event'],
        },
      }
      const parsed = GraniteFloorEventSchema.parse(event)
      expect(parsed.replay_bundle).toBeDefined()
      expect((parsed.replay_bundle as { kind?: string }).kind).toBe('tool-call')
    })
  })

  describe('v0.0.4 reporter wire-shape fix (CRITICAL: was silent 0-emit in v0.0.3)', () => {
    const validEvent: GraniteFloorEvent = {
      event_kind: 'granite-floor.event.v1',
      run_id: '00000000-0000-4000-8000-000000099999',
      case_id: 'wire-shape-test',
      repo: 'plug-tmpl',
      tool: 'plug-tmpl.smoke',
      persona: 'any',
      mode: 'ci',
      outcome: 'pass',
      fail_category: null,
      fail_detail: null,
      model: 'granite-4-h-tiny-4bit',
      latency_ms: 100,
      timestamp: '2026-05-26T13:00:00.000Z',
    }

    it('sends body with `to` (not `to_role`) per chatbus API', async () => {
      let capturedBody: string | null = null
      const originalFetch = globalThis.fetch
      globalThis.fetch = (async (_url: string, init: RequestInit) => {
        capturedBody = init.body as string
        return new Response('ok', { status: 200 })
      }) as typeof fetch
      try {
        process.env['CHATBUS_ENDPOINT'] = 'http://127.0.0.1:7878/api/messages'
        process.env['GRANITE_TEST_DRY_RUN'] = '0'
        await reportToCluster([validEvent])
        const parsed = JSON.parse(capturedBody!)
        expect(parsed.to).toBe('@floor')
        expect(parsed.to_role).toBeUndefined()
      } finally {
        globalThis.fetch = originalFetch
        delete process.env['CHATBUS_ENDPOINT']
        delete process.env['GRANITE_TEST_DRY_RUN']
      }
    })

    it('sends body with `group: "mindgarden"` REQUIRED field', async () => {
      let capturedBody: string | null = null
      const originalFetch = globalThis.fetch
      globalThis.fetch = (async (_url: string, init: RequestInit) => {
        capturedBody = init.body as string
        return new Response('ok', { status: 200 })
      }) as typeof fetch
      try {
        process.env['CHATBUS_ENDPOINT'] = 'http://127.0.0.1:7878/api/messages'
        process.env['GRANITE_TEST_DRY_RUN'] = '0'
        await reportToCluster([validEvent])
        const parsed = JSON.parse(capturedBody!)
        expect(parsed.group).toBe('mindgarden')
      } finally {
        globalThis.fetch = originalFetch
        delete process.env['CHATBUS_ENDPOINT']
        delete process.env['GRANITE_TEST_DRY_RUN']
      }
    })

    it('sends body with stringified content (server parses, NOT nested object)', async () => {
      let capturedBody: string | null = null
      const originalFetch = globalThis.fetch
      globalThis.fetch = (async (_url: string, init: RequestInit) => {
        capturedBody = init.body as string
        return new Response('ok', { status: 200 })
      }) as typeof fetch
      try {
        process.env['CHATBUS_ENDPOINT'] = 'http://127.0.0.1:7878/api/messages'
        process.env['GRANITE_TEST_DRY_RUN'] = '0'
        await reportToCluster([validEvent])
        const parsed = JSON.parse(capturedBody!)
        // content must be a string (not nested object) — server parses
        expect(typeof parsed.content).toBe('string')
        const innerEvent = JSON.parse(parsed.content)
        expect(innerEvent.run_id).toBe(validEvent.run_id)
      } finally {
        globalThis.fetch = originalFetch
        delete process.env['CHATBUS_ENDPOINT']
        delete process.env['GRANITE_TEST_DRY_RUN']
      }
    })
  })

  describe('v0.0.3 text-leak fail-category (Oracle msg #831 v1.1.1)', () => {
    it('text-leak event round-trips through GraniteFloorEventSchema', () => {
      const event = {
        event_kind: 'granite-floor.event.v1' as const,
        run_id: '00000000-0000-4000-8000-000000001001',
        case_id: 'text-leak-test',
        repo: 'plug-tmpl',
        tool: 'dice.roll',
        persona: 'user' as const,
        mode: 'ci' as const,
        outcome: 'fail' as const,
        fail_category: 'text-leak' as const,
        fail_detail: 'prose + tool-call both present: "The d20 roll is **15**."',
        model: 'granite-4-h-tiny-4bit',
        latency_ms: 4500,
        timestamp: '2026-05-26T13:00:00.000Z',
      }
      const parsed = GraniteFloorEventSchema.parse(event)
      expect(parsed.fail_category).toBe('text-leak')
    })
  })

  describe('v0.0.5 spec v1.2.2 additive fields (Oracle #1015 + #1289 + v1.2.2 FROZEN)', () => {
    const baseV12Event = {
      event_kind: 'granite-floor.event.v1' as const,
      run_id: '00000000-0000-4000-8000-000000002001',
      case_id: 'v1.2-test',
      repo: 'plug-elec',
      tool: 'switchgear.aggregate_befund',
      persona: 'user' as const,
      mode: 'ci' as const,
      outcome: 'pass' as const,
      fail_category: null,
      fail_detail: null,
      model: 'granite-4-h-tiny-4bit',
      latency_ms: 5000,
      timestamp: '2026-05-26T15:00:00.000Z',
    }

    it('accepts L3 outcome_raw + outcome_post_repair + applied_repairs (repair success)', () => {
      const event = {
        ...baseV12Event,
        outcome_raw: 'fail' as const,
        outcome_post_repair: 'pass' as const,
        applied_repairs: [
          {
            rule_id: 'verbatim-digit-replace',
            audit_reason: '"zwölf" → "12" per DE-number-word-dictionary',
          },
        ],
      }
      const parsed = GraniteFloorEventSchema.parse(event)
      expect(parsed.outcome_raw).toBe('fail')
      expect(parsed.outcome_post_repair).toBe('pass')
      expect(parsed.applied_repairs).toHaveLength(1)
    })

    it('REJECTS outcome_raw=fail + outcome_post_repair=pass + empty applied_repairs (Anti-Cheating Test-2)', () => {
      const cheating = {
        ...baseV12Event,
        outcome_raw: 'fail' as const,
        outcome_post_repair: 'pass' as const,
        applied_repairs: [],
      }
      expect(() => GraniteFloorEventSchema.parse(cheating)).toThrow(/Anti-cheating/)
    })

    it('REJECTS outcome_raw=fail + outcome_post_repair=pass + missing applied_repairs', () => {
      const cheating = {
        ...baseV12Event,
        outcome_raw: 'fail' as const,
        outcome_post_repair: 'pass' as const,
      }
      expect(() => GraniteFloorEventSchema.parse(cheating)).toThrow(/Anti-cheating/)
    })

    it('accepts outcome_post_repair=unrepairable (audit-only fail-mode)', () => {
      const event = {
        ...baseV12Event,
        outcome: 'fail' as const,
        fail_category: 'hallucination' as const,
        fail_detail: 'Granite paraphrased content',
        outcome_raw: 'fail' as const,
        outcome_post_repair: 'unrepairable' as const,
        // No applied_repairs needed when unrepairable
      }
      const parsed = GraniteFloorEventSchema.parse(event)
      expect(parsed.outcome_post_repair).toBe('unrepairable')
    })

    it('accepts L4 pass_id + prompt_version_hash + strengthen_recipes_applied', () => {
      const event = {
        ...baseV12Event,
        pass_id: '3b',
        prompt_version_hash: 'sha256:abc123',
        strengthen_recipes_applied: ['hard-error-framing', 'flexion-coverage'],
      }
      const parsed = GraniteFloorEventSchema.parse(event)
      expect(parsed.pass_id).toBe('3b')
      expect(parsed.strengthen_recipes_applied).toEqual(['hard-error-framing', 'flexion-coverage'])
    })

    it('accepts pass_id as number (Pass 1, 2, etc)', () => {
      const event = { ...baseV12Event, pass_id: 2 }
      expect(GraniteFloorEventSchema.parse(event).pass_id).toBe(2)
    })

    it('accepts pass_predecessor_event_id (L6b chain-walker support)', () => {
      const event = {
        ...baseV12Event,
        pass_id: 3,
        pass_predecessor_event_id: 'evt-pass2-baseline-001',
      }
      const parsed = GraniteFloorEventSchema.parse(event)
      expect(parsed.pass_predecessor_event_id).toBe('evt-pass2-baseline-001')
    })

    it('accepts v1.2.1 plural fail_sub_categories (multi-violation case)', () => {
      const event = {
        ...baseV12Event,
        outcome: 'fail' as const,
        fail_category: 'schema-issue' as const,
        fail_detail: 'multiple violations',
        fail_sub_category: 'enum-translate-de-en',
        fail_sub_categories: ['enum-translate-de-en', 'verbatim-digit-replace'],
      }
      const parsed = GraniteFloorEventSchema.parse(event)
      expect(parsed.fail_sub_categories).toHaveLength(2)
    })

    it('REJECTS plural-singular inconsistency (Oracle #1289 spec)', () => {
      const inconsistent = {
        ...baseV12Event,
        outcome: 'fail' as const,
        fail_category: 'schema-issue' as const,
        fail_detail: 'multiple violations',
        fail_sub_category: 'enum-translate-de-en',
        fail_sub_categories: ['verbatim-digit-replace', 'enum-translate-de-en'], // wrong order
      }
      expect(() => GraniteFloorEventSchema.parse(inconsistent)).toThrow(/plural-singular/)
    })

    it('accepts v1.2.2 domain_kind field', () => {
      const event = { ...baseV12Event, domain_kind: 'structured-output' }
      expect(GraniteFloorEventSchema.parse(event).domain_kind).toBe('structured-output')
    })

    it('v1.1.1 emitters without v1.2 fields still validate (backwards-compat)', () => {
      // baseV12Event has NONE of the v1.2 fields set
      const parsed = GraniteFloorEventSchema.parse(baseV12Event)
      expect(parsed.outcome_raw).toBeUndefined()
      expect(parsed.outcome_post_repair).toBeUndefined()
      expect(parsed.pass_id).toBeUndefined()
    })
  })

  describe('v0.0.6 spec v1.3 target_kind / target_host (Oracle FROZEN 2026-05-31)', () => {
    // Spec source: chatbus contracts thread 2026-05-31 ~05:01 oracle.
    // Mirrors oracle's 10 v1.3 tests in chatbus aggregator + adds plugin-side
    // defineGraniteToolTest threading.
    const baseV13Event = {
      event_kind: 'granite-floor.event.v1' as const,
      run_id: '00000000-0000-4000-8000-000000003001',
      case_id: 'v1.3-test',
      repo: 'apex2d',
      tool: 'image.generate',
      persona: 'user' as const,
      mode: 'ci' as const,
      outcome: 'pass' as const,
      fail_category: null,
      fail_detail: null,
      model: 'granite-4-h-tiny-4bit',
      latency_ms: 12_000,
      timestamp: '2026-05-31T05:00:00.000Z',
    }

    it('accepts event without target_kind (v1.2 back-compat, defaults to plugin-tool semantics)', () => {
      const parsed = GraniteFloorEventSchema.parse(baseV13Event)
      expect(parsed.target_kind).toBeUndefined()
      expect(parsed.target_host).toBeUndefined()
    })

    it('accepts explicit target_kind=plugin-tool without target_host', () => {
      const event = { ...baseV13Event, target_kind: 'plugin-tool' as const }
      const parsed = GraniteFloorEventSchema.parse(event)
      expect(parsed.target_kind).toBe('plugin-tool')
      expect(parsed.target_host).toBeUndefined()
    })

    it('accepts host-tool happy-path: target_kind=host-tool + target_host=theseus', () => {
      const event = {
        ...baseV13Event,
        target_kind: 'host-tool' as const,
        target_host: 'theseus',
      }
      const parsed = GraniteFloorEventSchema.parse(event)
      expect(parsed.target_kind).toBe('host-tool')
      expect(parsed.target_host).toBe('theseus')
    })

    it('rejects target_kind=host-tool when target_host is missing (collapsed-refine)', () => {
      const event = { ...baseV13Event, target_kind: 'host-tool' as const }
      expect(() => GraniteFloorEventSchema.parse(event)).toThrow(/target_host/)
    })

    it('rejects target_kind=host-tool when target_host is empty string', () => {
      const event = {
        ...baseV13Event,
        target_kind: 'host-tool' as const,
        target_host: '',
      }
      expect(() => GraniteFloorEventSchema.parse(event)).toThrow()
    })

    it('rejects target_kind=plugin-tool when target_host is also set (collapsed-refine)', () => {
      const event = {
        ...baseV13Event,
        target_kind: 'plugin-tool' as const,
        target_host: 'theseus',
      }
      expect(() => GraniteFloorEventSchema.parse(event)).toThrow(/target_host/)
    })

    it('rejects target_host without target_kind (collapsed-refine)', () => {
      const event = { ...baseV13Event, target_host: 'theseus' }
      expect(() => GraniteFloorEventSchema.parse(event)).toThrow(/target_host/)
    })

    it('rejects target_kind=invalid-enum-value', () => {
      const event = { ...baseV13Event, target_kind: 'system-tool' as never }
      expect(() => GraniteFloorEventSchema.parse(event)).toThrow()
    })

    it('host-tool event coexists with domain_kind (orthogonal axes)', () => {
      const event = {
        ...baseV13Event,
        target_kind: 'host-tool' as const,
        target_host: 'theseus',
        domain_kind: 'text-to-image-generation',
      }
      const parsed = GraniteFloorEventSchema.parse(event)
      expect(parsed.target_kind).toBe('host-tool')
      expect(parsed.target_host).toBe('theseus')
      expect(parsed.domain_kind).toBe('text-to-image-generation')
    })

    it('host-tool event coexists with v1.2 L3-repair fields', () => {
      const event = {
        ...baseV13Event,
        target_kind: 'host-tool' as const,
        target_host: 'theseus',
        outcome: 'pass' as const,
        outcome_raw: 'fail' as const,
        outcome_post_repair: 'pass' as const,
        applied_repairs: [
          { rule_id: 'dim-snap-16', audit_reason: 'width 250 → 256 (×16 snap)' },
        ],
      }
      const parsed = GraniteFloorEventSchema.parse(event)
      expect(parsed.target_kind).toBe('host-tool')
      expect(parsed.applied_repairs).toHaveLength(1)
    })

    it('defineGraniteToolTest threads target_kind + target_host (host-tool decl)', async () => {
      const { defineGraniteToolTest } = await import('../src/define-tool-test.js')
      const test = defineGraniteToolTest({
        tool: 'image.generate',
        persona: 'user',
        target_kind: 'host-tool',
        target_host: 'theseus',
        cases: [
          {
            case_id: 'img.gen.pixel-tile',
            prompt: 'pixel-art forest tile 256x256',
          },
        ],
      })
      expect(test.target_kind).toBe('host-tool')
      expect(test.target_host).toBe('theseus')
      expect(test.tool).toBe('image.generate')
    })

    it('defineGraniteToolTest plugin-tool decl (no target_kind = default plugin-tool semantics)', async () => {
      const { defineGraniteToolTest } = await import('../src/define-tool-test.js')
      const test = defineGraniteToolTest({
        tool: 'apex.generate_map',
        persona: 'user',
        cases: [{ case_id: 'apex.map.basic', prompt: 'create a forest map 20x20' }],
      })
      expect(test.target_kind).toBeUndefined()
      expect(test.target_host).toBeUndefined()
    })
  })
})
