// @nexus-mindgarden/granite-test — reportToCluster() transport implementation.
//
// Spec-aligned per Oracle msg #732 (v1.1 FROZEN). Transport contract:
//   - chatbus `post_message` mit `to_role="@floor"` reserved-virtual-role
//   - Thread: `granite-floor`
//   - Content: JSON-stringified `GraniteFloorEvent`
//   - CAS-dedup: aggregator enforces `UNIQUE(run_id, case_id)`
//   - Total event size cap: 64 KB (including replay_bundle)
//   - PII-guard: wild-mode events MUST use ReplayBundleWild shape (enforced at
//     schema-level via GraniteFloorEventSchema's .refine())
//
// Environment configuration (no DI required for plugin-authors):
//   - CHATBUS_ENDPOINT — full URL to chatbus's post_message endpoint
//                       (e.g. http://127.0.0.1:7878/api/post_message)
//   - CHATBUS_TOKEN    — bearer token for chatbus auth (optional, env-dependent)
//   - GRANITE_TEST_DRY_RUN — '1' to log events instead of emitting (CI debug)
//   - GRANITE_TEST_BATCH_MS — flush interval ms (default 2000)
//   - GRANITE_TEST_BATCH_N — flush event-count threshold (default 50)

import {
  GraniteFloorEventSchema,
  type GraniteFloorEvent,
  type ReportToClusterOptions,
} from './types.js'

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

/**
 * Configuration resolved from env-vars + options. Exposed for testing
 * + custom transport-adapters.
 */
export interface ResolvedReporterConfig {
  transport: 'chatbus' | 'http'
  endpoint: string | null
  token: string | null
  dryRun: boolean
  batchFlushMs: number
  batchFlushCount: number
}

/**
 * Resolve config from env + options. options override env. Exported for
 * testability + advanced setups (e.g. plug-inst's air-gapped CI).
 */
export function resolveReporterConfig(
  options: ReportToClusterOptions = {},
): ResolvedReporterConfig {
  const env = typeof process !== 'undefined' ? process.env : {}
  const transport = options.transport ?? 'chatbus'

  // Endpoint resolution — different defaults per transport
  let endpoint: string | null = null
  if (transport === 'chatbus') {
    endpoint = env['CHATBUS_ENDPOINT'] ?? null
  } else {
    endpoint = options.http_endpoint ?? env['CHATBUS_ENDPOINT'] ?? null
  }

  return {
    transport,
    endpoint,
    token: env['CHATBUS_TOKEN'] ?? null,
    dryRun: env['GRANITE_TEST_DRY_RUN'] === '1',
    batchFlushMs: options.batch_flush_ms ?? Number(env['GRANITE_TEST_BATCH_MS'] ?? 2000),
    batchFlushCount: options.batch_flush_count ?? Number(env['GRANITE_TEST_BATCH_N'] ?? 50),
  }
}

/**
 * Validate + size-check an event-list against spec v1.1. Throws
 * `ReportToClusterError` on validation failure or 64 KB cap exceeded.
 */
function validateEvents(events: GraniteFloorEvent[]): GraniteFloorEvent[] {
  const validated: GraniteFloorEvent[] = []
  for (const e of events) {
    try {
      validated.push(GraniteFloorEventSchema.parse(e) as GraniteFloorEvent)
    } catch (err) {
      throw new ReportToClusterError(
        'event_validation_failed',
        `event ${e.run_id}/${e.case_id}: ${(err as Error).message}`,
      )
    }
  }
  for (const event of validated) {
    const serialized = JSON.stringify(event)
    const bytes =
      typeof Buffer !== 'undefined'
        ? Buffer.byteLength(serialized, 'utf8')
        : new TextEncoder().encode(serialized).byteLength
    if (bytes > 64 * 1024) {
      throw new ReportToClusterError(
        'event_too_large',
        `event ${event.run_id}/${event.case_id} exceeds 64 KB cap (replay_bundle likely too large)`,
      )
    }
  }
  return validated
}

/**
 * Send a single event via chatbus `post_message` with `to_role="@floor"`.
 * Returns aggregator response (event-id on accept, error-code on reject).
 *
 * Aggregator side enforces:
 *   - schema-validation (rejects malformed events)
 *   - PII-guard (rejects wild-mode events with verbatim user_prompt)
 *   - CAS-dedup (UNIQUE(run_id, case_id))
 *
 * Network-failures retry once with 1s backoff. Non-2xx responses throw
 * `ReportToClusterError('aggregator_rejected', <status>: <body>)`.
 */
async function sendViaChatbus(
  event: GraniteFloorEvent,
  config: ResolvedReporterConfig,
): Promise<void> {
  if (config.dryRun) {
    // eslint-disable-next-line no-console
    console.log(
      `[granite-test:dry-run] ${event.run_id}/${event.case_id} ${event.tool} ${event.outcome}${event.fail_category ? `/${event.fail_category}` : ''}`,
    )
    return
  }
  if (!config.endpoint) {
    throw new ReportToClusterError(
      'endpoint_missing',
      'CHATBUS_ENDPOINT not set — runtime cannot reach chatbus. Set env-var or use { transport: "http", http_endpoint } in options. Or set GRANITE_TEST_DRY_RUN=1 for offline runs.',
    )
  }
  const body = JSON.stringify({
    to_role: '@floor',
    thread: 'granite-floor',
    content: JSON.stringify(event),
  })
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (config.token) headers['Authorization'] = `Bearer ${config.token}`

  let lastError: unknown
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(config.endpoint, { method: 'POST', headers, body })
      if (!response.ok) {
        const text = await response.text().catch(() => '<no body>')
        throw new ReportToClusterError(
          'aggregator_rejected',
          `${response.status}: ${text.slice(0, 200)}`,
        )
      }
      return
    } catch (err) {
      lastError = err
      if (err instanceof ReportToClusterError) throw err
      // Network-error — retry once with 1s backoff
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 1000))
      }
    }
  }
  throw new ReportToClusterError(
    'network_error',
    `chatbus unreachable after retry: ${(lastError as Error)?.message ?? 'unknown'}`,
  )
}

/**
 * Batched-emitter. Buffers events + flushes on N-count or M-ms whichever
 * first. Plugin-authors typically call `reportToCluster(event)` per case
 * + the helper handles buffering. Call `flushPending()` at end-of-run
 * to force-emit anything still buffered.
 *
 * Module-level buffer keeps the helper API simple — one `reportToCluster()`
 * call per case-result, no need for plugin-authors to wire up a batcher.
 */
let pendingBuffer: { events: GraniteFloorEvent[]; config: ResolvedReporterConfig | null } = {
  events: [],
  config: null,
}
let pendingTimer: ReturnType<typeof setTimeout> | null = null

async function flushBuffer(): Promise<void> {
  if (pendingTimer !== null) {
    clearTimeout(pendingTimer)
    pendingTimer = null
  }
  const toEmit = pendingBuffer.events
  const config = pendingBuffer.config
  pendingBuffer = { events: [], config: null }
  if (toEmit.length === 0 || !config) return
  // Sequential emit — preserves causal-order if aggregator cares
  for (const event of toEmit) {
    await sendViaChatbus(event, config)
  }
}

/**
 * Force-flush any buffered events. Call at end-of-CI-run to ensure
 * trailing events emit before process-exit.
 *
 * ```ts
 * import { reportToCluster, flushPending } from '@nexus-mindgarden/granite-test'
 *
 * // ... run all cases
 * await flushPending()  // ← critical: don't drop trailing events
 * ```
 */
export async function flushPending(): Promise<void> {
  await flushBuffer()
}

/**
 * Report one or more Granite-Floor events to the cluster aggregator.
 *
 * Single-event API: `reportToCluster(event)` — buffered, flushed on
 * N-count or M-ms.
 * Batch API: `reportToCluster([e1, e2, ...])` — immediate flush, no buffer.
 *
 * Always validates against spec v1.1 schema + 64 KB cap. PII-guard for
 * wild-mode is enforced at schema-level (refuses verbatim user_prompt).
 *
 * @returns Promise resolving to the validated events (passthrough for chain
 *   usage). Resolves AFTER any immediate emission completes for batch-arrays.
 *   For single-event buffering, resolves immediately + emission is deferred.
 */
export async function reportToCluster(
  events: GraniteFloorEvent | GraniteFloorEvent[],
  options: ReportToClusterOptions = {},
): Promise<GraniteFloorEvent[]> {
  const isArrayInput = Array.isArray(events)
  const list = isArrayInput ? events : [events]
  const validated = validateEvents(list)
  const config = resolveReporterConfig(options)

  // Batch-input → immediate flush (caller wants synchronous emit-confirmation)
  if (isArrayInput) {
    for (const event of validated) {
      await sendViaChatbus(event, config)
    }
    return validated
  }

  // Single-event → buffer + scheduled flush
  pendingBuffer.events.push(...validated)
  pendingBuffer.config = config

  // Flush-trigger 1: N-count exceeded
  if (pendingBuffer.events.length >= config.batchFlushCount) {
    await flushBuffer()
    return validated
  }

  // Flush-trigger 2: M-ms timer (idempotent — only schedule if no timer pending)
  if (pendingTimer === null) {
    pendingTimer = setTimeout(() => {
      flushBuffer().catch((err) => {
        // eslint-disable-next-line no-console
        console.error('[granite-test] background flush failed:', err)
      })
    }, config.batchFlushMs)
  }

  return validated
}
