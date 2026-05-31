// Hono-Server-Factory für Plugin-Bridge.
//
// Plugin-Provider:
//   1. instantiate manifest + registry
//   2. register tool-handlers + render-ui-handler + hook-handlers
//   3. createBridgeApp({...}) → Hono-app
//   4. serve via Bun.serve / Node @hono/node-server
//
// Endpoints (siehe PLUGIN-BRIDGE-PROTOCOL.md):
//   POST /plugin-bridge/v1/register-host
//   POST /plugin-bridge/v1/handshake
//   GET  /plugin-bridge/v1/manifest
//   GET  /plugin-bridge/v1/health
//   POST /plugin-bridge/v1/execute-tool
//   POST /plugin-bridge/v1/render-ui
//   POST /plugin-bridge/v1/invoke-hook
//
// CORS: Browser-Requests aus Plugin-Hosts (V8/Theseus) brauchen preflight
// für POST + Authorization-Header. Standard-Allowlist `*` für Phase-2-Dev;
// Phase-3 Plugin-Provider können `cors({ origin: <allowlist> })` overriden.
//
// Drift-Reference (siehe CROSS-REPO-LESSONS.md):
//   #8 CORS preflight handler (incl. hier via hono/cors)
//   #14 render-ui context default {} (validation accepts both)
//   #20+#21 bare-specifier-bundles (build-side concern, not server)

import { Hono, type MiddlewareHandler } from 'hono'
import { cors } from 'hono/cors'
import {
  buildHostRecordStatus,
  HostKeyRegistry,
  verifyAuthorizationHeader,
  type HandshakeTokenStoreImpl,
} from './auth/index.js'
import { extractPublicKeyPem, RegisterHostRequestSchema } from './types.js'
import { handshakeHandler } from './endpoints/handshake.js'
import { manifestHandler } from './endpoints/manifest.js'
import { healthHandler } from './endpoints/health.js'
import { executeToolHandler } from './endpoints/execute-tool.js'
import { renderUiHandler } from './endpoints/render-ui.js'
import { invokeHookHandler } from './endpoints/invoke-hook.js'
import { staticUiHandler, type StaticUiHandlerOptions } from './endpoints/static-ui.js'
import { computeManifestHash } from './manifest/hash.js'
import { Counter, Gauge, MetricsRegistry, type Logger } from './observability/index.js'
import type {
  BridgeTokenClaims,
  HookHandler,
  PluginManifest,
  RenderUiHandler,
  ToolHandler,
} from './types.js'

// Hono-Bindings für typed c.set('claims', ...) / c.get('claims') / c.get('request_id')
export type BridgeEnv = {
  Variables: {
    claims: BridgeTokenClaims
    request_id: string
  }
}

/**
 * Generate UUIDv4-shaped request-id für Distributed-Tracing. Cross-language
 * convention aligned mit plug-db's X-Request-Id middleware (chatbus #294).
 */
function generateRequestId(): string {
  // crypto.randomUUID() ist Node 19+, browser-safe. Foundation Targets Node 20+.
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.randomUUID) {
    return globalThis.crypto.randomUUID()
  }
  // Fallback (sehr defensive — sollte nie erreicht werden auf Node 20+)
  return Array.from({ length: 4 }, () =>
    Math.random().toString(16).slice(2, 10),
  ).join('-')
}

export interface BridgeAppOptions {
  manifest: PluginManifest
  registry: HostKeyRegistry
  /** map of tool_name → handler */
  toolHandlers: Record<string, ToolHandler>
  /** route_path-pattern handler — Plugin-Provider matcht selbst */
  renderUi?: RenderUiHandler
  /** map of `${module}.${capability}.${hook_name}` → handler */
  hookHandlers?: Record<string, HookHandler>
  /** Custom CORS origin-list. Default '*'. */
  corsOrigin?: string | string[]
  /** Optional: fixed plugin-version-string für /health.version (default manifest.version) */
  pluginVersion?: string
  /**
   * v0.2.0 — Observability opt-ins. Wenn provided wired Foundation:
   *  - HTTP-request-counter (method, path, status)
   *  - /metrics endpoint (unauth, Prometheus exposition-format 0.0.4)
   *  - HTTP-access-logs via Logger
   * Wenn weggelassen: kein observability-wiring (backward-compat mit v0.1.x).
   */
  observability?: BridgeObservabilityOptions
  /**
   * v0.2.0 — Static UI serving. Wenn provided mounted Foundation `urlPrefix`
   * (default '/static/ui') als unauth file-server gegen `staticDir` mit
   * content-type-detection, immutable cache-control, path-traversal-safety.
   */
  staticUi?: StaticUiHandlerOptions
  /**
   * v0.7.1 — Handshake-token capture for outbound clients.
   *
   * When provided, Foundation hooks the `/plugin-bridge/v1/handshake` middleware
   * to capture the incoming Authorization Bearer (the per-plugin activation JWT
   * issued by the host during register-tenants) and write it into the store.
   * The plugin-author can then pass the same store to outbound clients:
   *
   *   const tokenStore = createHandshakeTokenStore()
   *   const app = createBridgeApp({ ..., handshakeTokenStore: tokenStore })
   *
   *   const agentComplete = createAgentComplete({
   *     bridgeEndpoint: 'http://127.0.0.1:3400/agent/complete',
   *     transport: 'agent-socket-direct',
   *     tokenResolver: () => tokenStore.current(),
   *   })
   *
   *   const reverseCall = createReverseCallClient({
   *     hostEndpoint: 'http://127.0.0.1:3400',
   *     tokenStore,
   *   })
   *
   * Capture is BEFORE Foundation's JWT-validation middleware — so even if
   * verification fails, the token is captured for diagnostics. Plugin-authors
   * who don't need outbound calls can omit this field (zero impact).
   *
   * @see createHandshakeTokenStore in '/auth' subpath
   */
  handshakeTokenStore?: HandshakeTokenStoreImpl
}

export interface BridgeObservabilityOptions {
  /** MetricsRegistry — Foundation registriert HTTP-counter + uptime + registry-size. */
  registry?: MetricsRegistry
  /** Logger für HTTP-access-logs (1 line per request). */
  logger?: Logger
  /** Default true wenn registry provided. /metrics-endpoint at `/metrics` (unauth, top-level). */
  exposeMetricsEndpoint?: boolean
}

export function createBridgeApp(opts: BridgeAppOptions): Hono<BridgeEnv> {
  const app = new Hono<BridgeEnv>()

  // CORS — Drift #8 mitigation. Plugin-Bridge endpoints serve cross-origin
  // POST mit Authorization → preflight pflicht.
  app.use(
    '*',
    cors({
      origin: opts.corsOrigin ?? '*',
      allowMethods: ['GET', 'POST', 'OPTIONS'],
      allowHeaders: ['Authorization', 'Content-Type', 'X-Request-Id'],
      exposeHeaders: ['Content-Length', 'X-Request-Id'],
      maxAge: 86400,
      credentials: false,
    }),
  )

  // X-Request-Id middleware (v0.2.2) — distributed-tracing primitive.
  // Pattern aligned mit plug-db's 3-Service-Tracing (chatbus #294). If client
  // sends X-Request-Id, propagate it through claims-context + response header.
  // Otherwise generate UUIDv4. Available via `c.get('request_id')` in handlers.
  app.use('*', async (c, next) => {
    const incoming = c.req.header('X-Request-Id') || c.req.header('x-request-id')
    const requestId = incoming && incoming.length > 0 ? incoming : generateRequestId()
    c.set('request_id', requestId)
    c.header('X-Request-Id', requestId)
    await next()
  })

  // Pre-compute manifest_hash damit /health-handler nicht jedes mal hashes.
  const manifestHash = computeManifestHash(opts.manifest)
  const pluginVersion = opts.pluginVersion ?? opts.manifest.version

  // --- Observability (v0.2.0) ---
  const obs = opts.observability
  const obsLogger = obs?.logger
  let httpCounter: Counter | null = null
  if (obs?.registry) {
    httpCounter = obs.registry.register(
      new Counter(
        'plugin_bridge_http_requests_total',
        'Total HTTP requests handled by plugin-bridge by method, path, status',
        ['method', 'path', 'status'],
      ),
    )
    const startedAt = Date.now()
    obs.registry.register(
      new Gauge(
        'plugin_bridge_uptime_seconds',
        'Uptime of the plugin-bridge process in seconds',
        [],
        () => (Date.now() - startedAt) / 1000,
      ),
    )
    obs.registry.register(
      new Gauge(
        'plugin_bridge_host_registry_size',
        'Number of registered hosts in the bridge HostKeyRegistry',
        [],
        // best-effort sync — Registry.list() is async; we cache last-known count.
        () => lastKnownRegistrySize,
      ),
    )
  }
  let lastKnownRegistrySize = 0
  const refreshRegistrySize = () => {
    void opts.registry.list().then((rs) => {
      lastKnownRegistrySize = rs.length
    })
  }
  refreshRegistrySize()

  // HTTP-counter + access-log middleware. Runs für alle requests.
  if (httpCounter || obsLogger) {
    app.use('*', async (c, next) => {
      const started = Date.now()
      await next()
      const status = String(c.res.status)
      // Normalize path: strip query, collapse trailing-slash, keep route-shape.
      const path = c.req.path.replace(/\/$/, '') || '/'
      httpCounter?.inc({ method: c.req.method, path, status })
      obsLogger?.info('http_request', {
        method: c.req.method,
        path,
        status: c.res.status,
        duration_ms: Date.now() - started,
        request_id: c.get('request_id'),
      })
    })
  }

  // /metrics — unauth, top-level. Default-on wenn registry provided.
  if (obs?.registry && obs.exposeMetricsEndpoint !== false) {
    app.get('/metrics', async (c) => {
      // Refresh registry-size gauge sync-ish before scrape.
      const records = await opts.registry.list()
      lastKnownRegistrySize = records.length
      const body = obs.registry!.collect()
      return c.text(body, 200, { 'content-type': 'text/plain; version=0.0.4; charset=utf-8' })
    })
  }

  // Static UI serving (v0.2.0) — unauth, mounted at opts.staticUi.urlPrefix.
  if (opts.staticUi) {
    const urlPrefix = (opts.staticUi.urlPrefix ?? '/static/ui').replace(/\/$/, '')
    const handler = staticUiHandler(opts.staticUi)
    app.get(`${urlPrefix}/*`, handler)
  }

  // --- register-host (kein bridge-token required — bootstrap-flow) ---
  app.post('/plugin-bridge/v1/register-host', async (c) => {
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: { code: 'invalid_request', message: 'malformed JSON' } }, 400)
    }
    const parsed = RegisterHostRequestSchema.safeParse(body)
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: 'invalid_request',
            message: parsed.error.issues
              .map((i) => `${i.path.join('.')}: ${i.message}`)
              .join('; '),
          },
        },
        400,
      )
    }
    const req = parsed.data
    // v0.3.1: extract PEM regardless of which field-name the caller sent
    // (public_key_pem canonical-target vs public_key legacy — markview drift-resolution).
    const publicKeyPem = extractPublicKeyPem(req)
    const providedOptionalFields = Object.keys(req).filter(
      (k) =>
        k !== 'host_id' &&
        k !== 'public_key_pem' &&
        k !== 'public_key' &&
        req[k as keyof typeof req] !== undefined,
    )
    const { record, isFirstRegister } = await opts.registry.register({
      host_id: req.host_id,
      public_key_pem: publicKeyPem,
      ...(req.host_version !== undefined ? { host_version: req.host_version } : {}),
      ...(req.relay_url !== undefined ? { relay_url: req.relay_url } : {}),
    })
    const missingFields = opts.registry.optionalFields.filter(
      (f) => !providedOptionalFields.includes(f),
    )
    const loopDetected = opts.registry.detectReregisterLoop(record.host_id, missingFields)
    return c.json({
      host_id: record.host_id,
      status: record.status,
      fingerprint: record.fingerprint,
      registered_at: record.registered_at,
      host_record_status: buildHostRecordStatus({
        isFirstRegister,
        providedFields: providedOptionalFields,
        optionalFields: opts.registry.optionalFields,
        loopDetected,
      }),
    })
  })

  // --- v0.7.1 — Handshake-Token Capture Middleware (BEFORE authMiddleware) ---
  // When BridgeAppOptions.handshakeTokenStore is provided, we capture the
  // incoming Authorization Bearer before JWT-validation. This lets outbound
  // clients (createAgentComplete, createReverseCallClient) reuse the per-plugin
  // activation JWT without manual env-var wiring.
  //
  // Capture runs BEFORE authMiddleware so we still capture for diagnostics
  // even if validation fails (e.g. expired JWT — the store has the most-recent
  // value, useful for staleness-debug via lastUpdated()).
  if (opts.handshakeTokenStore) {
    const tokenStore = opts.handshakeTokenStore
    app.use('/plugin-bridge/v1/handshake', async (c, next) => {
      const authHeader =
        c.req.header('Authorization') ?? c.req.header('authorization')
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.slice('Bearer '.length).trim()
        if (token.length > 0) {
          tokenStore._capture(token)
        }
      }
      await next()
    })
  }

  // --- Auth-Middleware für alle anderen Endpoints ---
  app.use('/plugin-bridge/v1/handshake', authMiddleware(opts.registry))
  app.use('/plugin-bridge/v1/manifest', authMiddleware(opts.registry))
  app.use('/plugin-bridge/v1/health', authMiddleware(opts.registry))
  app.use('/plugin-bridge/v1/execute-tool', authMiddleware(opts.registry))
  app.use('/plugin-bridge/v1/render-ui', authMiddleware(opts.registry))
  app.use('/plugin-bridge/v1/invoke-hook', authMiddleware(opts.registry))

  // --- Endpoints ---
  app.post('/plugin-bridge/v1/handshake', handshakeHandler(opts.manifest, opts.registry))
  app.get('/plugin-bridge/v1/manifest', manifestHandler(opts.manifest))
  app.get('/plugin-bridge/v1/health', healthHandler({ pluginVersion, manifestHash }))
  app.post('/plugin-bridge/v1/execute-tool', executeToolHandler(opts.toolHandlers))
  if (opts.renderUi) {
    app.post('/plugin-bridge/v1/render-ui', renderUiHandler(opts.renderUi))
  }
  if (opts.hookHandlers) {
    app.post('/plugin-bridge/v1/invoke-hook', invokeHookHandler(opts.hookHandlers))
  }

  // --- 404 fallback ---
  app.notFound((c) =>
    c.json(
      {
        error: { code: 'not_found', message: `route not found: ${c.req.method} ${c.req.path}` },
      },
      404,
    ),
  )

  return app
}

function authMiddleware(registry: HostKeyRegistry): MiddlewareHandler<BridgeEnv> {
  return async (c, next) => {
    const auth = c.req.header('Authorization')
    try {
      const claims = await verifyAuthorizationHeader(auth, registry)
      c.set('claims', claims)
    } catch (err) {
      const code = (err as { code?: string }).code ?? 'unauthorized'
      return c.json({ error: { code, message: (err as Error).message } }, 401)
    }
    return next()
  }
}
