// v0.0.5.1: Live smoke-test gegen Oracle's live aggregator.
//
// Opt-in via 2 env-vars (BOTH required):
//   GRANITE_TEST_LIVE_SMOKE=1   — explicit opt-in
//   CHATBUS_ENDPOINT=http://127.0.0.1:7878/api/messages   — target
//
// Without both, the test is SKIPPED (vitest reports as skipped, not failed).
// This makes the test safe to run in any CI: it only runs when explicitly
// opted-in with a running chatbus-web.
//
// Purpose: catches wire-shape silent-regressions of the v0.0.3 class.
// v0.0.3 had `to_role: "@floor"` + missing `group: "mindgarden"` and
// silently 0-emitted with 200 responses. Mock-fetch unit-tests didn't catch
// it because they only validated the body-shape we built, not the body-shape
// the server accepts. This live-smoke validates the real round-trip:
//
//   1. Build a marker-event with unique run_id (so we can find it in aggregator)
//   2. POST it via reportToCluster()
//   3. GET /api/granite-floor/health → assert events_total counter incremented
//   4. (Optional) GET /api/granite-floor/runs?repo=plug-tmpl → assert marker-event present

import { describe, expect, it } from 'vitest'
import { reportToCluster } from '../src/index.js'
import type { GraniteFloorEvent } from '../src/index.js'

const LIVE_SMOKE_ENABLED = process.env['GRANITE_TEST_LIVE_SMOKE'] === '1'
const ENDPOINT = process.env['CHATBUS_ENDPOINT']
const HEALTH_URL = ENDPOINT?.replace('/api/messages', '/api/granite-floor/health')

const ENABLED = LIVE_SMOKE_ENABLED && Boolean(ENDPOINT) && Boolean(HEALTH_URL)

// Vitest's `it.skipIf` is cleaner than conditional skip in body
const itIfEnabled = ENABLED ? it : it.skip

describe('live-smoke against Oracle aggregator (opt-in: GRANITE_TEST_LIVE_SMOKE=1 + CHATBUS_ENDPOINT)', () => {
  if (!ENABLED) {
    it.skip('SKIPPED — set GRANITE_TEST_LIVE_SMOKE=1 + CHATBUS_ENDPOINT to enable', () => {
      // Marker for skipped-reason visibility in vitest output
    })
    return
  }

  itIfEnabled(
    'reportToCluster() emits a marker-event that increments aggregator counter',
    async () => {
      // Use a unique run_id with timestamp to avoid dedup-collisions on re-runs
      const markerRunId = `plug-tmpl-live-smoke-${Date.now()}`
      const markerEvent: GraniteFloorEvent = {
        event_kind: 'granite-floor.event.v1',
        run_id: markerRunId,
        case_id: 'live-smoke.marker',
        repo: 'plug-tmpl',
        tool: 'plug-tmpl.live-smoke-marker',
        persona: 'any',
        mode: 'ci',
        outcome: 'pass',
        fail_category: null,
        fail_detail: null,
        model: 'live-smoke-noop',
        latency_ms: 1,
        timestamp: new Date().toISOString(),
        domain_kind: 'foundation-smoke-test',
      }

      // Snapshot counter BEFORE
      const healthBefore = await fetch(HEALTH_URL!)
        .then((r) => r.json() as Promise<{ events_total: number }>)
        .catch(() => ({ events_total: -1 }))
      const totalBefore = healthBefore.events_total

      // Emit via Foundation's reportToCluster (batch-form for immediate-flush)
      await reportToCluster([markerEvent])

      // Brief delay for server-side processing (aggregator validates + persists)
      await new Promise((r) => setTimeout(r, 500))

      // Snapshot counter AFTER
      const healthAfter = await fetch(HEALTH_URL!)
        .then((r) => r.json() as Promise<{ events_total: number }>)
        .catch(() => ({ events_total: -1 }))
      const totalAfter = healthAfter.events_total

      // CRITICAL ASSERTION: counter must have incremented
      // This catches the v0.0.3-class bug where reporter built wrong-shape body
      // → server returned 200 but never persisted → counter unchanged
      expect(
        totalAfter,
        `Counter did not increment (before=${totalBefore}, after=${totalAfter}). ` +
          `Likely wire-shape regression — reportToCluster body not accepted by aggregator. ` +
          `Check: 'to' field (not 'to_role'), 'group: "mindgarden"' present, 'content' stringified.`,
      ).toBeGreaterThan(totalBefore)

      // Optional secondary check: verify event was specifically persisted (not just any-counter-tick)
      // (Skip if /api/granite-floor/runs not available — primary counter-check is the v0.0.3-regression-catcher)
      const runsUrl = ENDPOINT!.replace('/api/messages', `/api/granite-floor/runs?repo=plug-tmpl`)
      try {
        const runs = await fetch(runsUrl).then((r) => r.json() as Promise<{ runs: Array<{ run_id: string }> }>)
        const foundMarker = runs.runs?.some((r) => r.run_id === markerRunId)
        if (foundMarker !== undefined) {
          expect(foundMarker, `Marker event ${markerRunId} not visible via /runs endpoint`).toBe(true)
        }
      } catch {
        // /runs endpoint optional — counter-increment is primary check
      }
    },
    15_000, // 15s timeout (network + server)
  )
})
