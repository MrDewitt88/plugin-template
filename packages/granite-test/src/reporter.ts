// @nexus-mindgarden/granite-test — reportToCluster() transport stub.
//
// SKELETON ONLY — full impl pending Oracle spec-freeze (2026-05-27) +
// decision-gate hit (wiz-mind + plug-elec adoption signals).
//
// Contract per Oracle spec v1 (chatbus msg #708):
//   - Transport: chatbus `post_message` mit `to_role="@floor"` reserved-virtual-role
//   - Thread: `granite-floor`
//   - Content: JSON-stringified `GraniteFloorEvent`
//   - CAS-dedup: aggregator enforces `UNIQUE(run_id, case_id)`
//   - Total event size cap: 64 KB (including replay_bundle)
//
// Optional v1.1 batch-emission (plug-tmpl suggestion in msg #713):
//   - Buffer events client-side, flush every N events (default 50) OR every
//     M seconds (default 2s), whichever first
//   - Force-flush on end-of-run
//   - Reduces "500 events in 10s burst" to "10 batched messages, 50 events each"

import { GraniteFloorEventSchema, type GraniteFloorEvent, type ReportToClusterOptions } from './types.js'

/**
 * Report one or more Granite-Floor events to the cluster aggregator.
 *
 * SKELETON: validates event-shape against spec v1, but does NOT yet emit
 * over chatbus. Returns the validated events for now. Full transport-impl
 * lands post-spec-freeze + decision-gate.
 *
 * @param events - Single event or array. Validated against `GraniteFloorEventSchema`.
 * @param options - Transport configuration (chatbus v1.0, http v1.1+).
 * @returns Promise resolving with the validated events (passthrough until transport lands).
 */
export async function reportToCluster(
  events: GraniteFloorEvent | GraniteFloorEvent[],
  options: ReportToClusterOptions = {},
): Promise<GraniteFloorEvent[]> {
  const list = Array.isArray(events) ? events : [events]

  // Validate each event against spec v1 schema
  const validated = list.map((e) => GraniteFloorEventSchema.parse(e))

  // Enforce 64 KB cap per event (spec v1)
  for (const event of validated) {
    const serialized = JSON.stringify(event)
    if (Buffer.byteLength(serialized, 'utf8') > 64 * 1024) {
      throw new ReportToClusterError(
        'event_too_large',
        `event ${event.run_id}/${event.case_id} exceeds 64 KB cap (replay_bundle likely too large)`,
      )
    }
  }

  // TODO post-decision-gate: actual transport
  switch (options.transport ?? 'chatbus') {
    case 'chatbus': {
      // TODO: chatbus.post_message({ to_role: '@floor', thread: 'granite-floor',
      //   content: JSON.stringify(event) }) per event (or batched per options)
      // Requires chatbus-client to be wired (env-var or DI). v1.0 surface: client
      // detection via process.env.CHATBUS_ENDPOINT OR pre-injection via setReporter.
      break
    }
    case 'http': {
      // v1.1 candidate. options.http_endpoint required. POST batch to
      // /api/granite-floor/events
      if (!options.http_endpoint) {
        throw new ReportToClusterError(
          'http_endpoint_missing',
          'options.http_endpoint is required when transport="http"',
        )
      }
      break
    }
  }

  return validated
}

/**
 * Typed error thrown by `reportToCluster()` on validation or transport failure.
 * Codes mirror Drift #103 canonical error-shape.
 */
export class ReportToClusterError extends Error {
  readonly code: string
  constructor(code: string, message?: string) {
    super(message ?? code)
    this.code = code
    this.name = 'ReportToClusterError'
  }
}
