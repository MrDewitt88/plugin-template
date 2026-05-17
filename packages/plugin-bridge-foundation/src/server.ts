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
} from './auth/index.js'
import { RegisterHostRequestSchema } from './types.js'
import { handshakeHandler } from './endpoints/handshake.js'
import { manifestHandler } from './endpoints/manifest.js'
import { healthHandler } from './endpoints/health.js'
import { executeToolHandler } from './endpoints/execute-tool.js'
import { renderUiHandler } from './endpoints/render-ui.js'
import { invokeHookHandler } from './endpoints/invoke-hook.js'
import { computeManifestHash } from './manifest/hash.js'
import type {
  BridgeTokenClaims,
  HookHandler,
  PluginManifest,
  RenderUiHandler,
  ToolHandler,
} from './types.js'

// Hono-Bindings für typed c.set('claims', ...) / c.get('claims')
export type BridgeEnv = {
  Variables: {
    claims: BridgeTokenClaims
  }
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
      allowHeaders: ['Authorization', 'Content-Type'],
      exposeHeaders: ['Content-Length'],
      maxAge: 86400,
      credentials: false,
    }),
  )

  // Pre-compute manifest_hash damit /health-handler nicht jedes mal hashes.
  const manifestHash = computeManifestHash(opts.manifest)
  const pluginVersion = opts.pluginVersion ?? opts.manifest.version

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
    const providedOptionalFields = Object.keys(req).filter(
      (k) => k !== 'host_id' && k !== 'public_key_pem' && req[k as keyof typeof req] !== undefined,
    )
    const { record, isFirstRegister } = await opts.registry.register({
      host_id: req.host_id,
      public_key_pem: req.public_key_pem,
      ...(req.host_version !== undefined ? { host_version: req.host_version } : {}),
    })
    return c.json({
      host_id: record.host_id,
      status: record.status,
      fingerprint: record.fingerprint,
      registered_at: record.registered_at,
      host_record_status: buildHostRecordStatus({
        isFirstRegister,
        providedFields: providedOptionalFields,
        optionalFields: opts.registry.optionalFields,
      }),
    })
  })

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
