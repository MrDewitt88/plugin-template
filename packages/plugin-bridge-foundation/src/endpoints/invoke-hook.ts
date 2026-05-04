// POST /plugin-bridge/v1/invoke-hook — Module-Hook-Routing.
// Host fired hooks (z.B. notes.versioning.on_save) wenn Plugin sie in
// manifest.provides.module_extensions registriert hat. Plugin executes
// hook + returnt result oder error.
//
// Drift #6 mitigation: Plugin akzeptiert sowohl `<module>s_id` plural
// als auch `source_id` als entity-identifier. Foundation reicht payload
// durch; Plugin-Provider extrahiert id mit fallback-chain.

import type { Context } from 'hono'
import { InvokeHookRequestSchema, type BridgeTokenClaims, type HookHandler } from '../types.js'

export function invokeHookHandler(handlers: Record<string, HookHandler>) {
  return async (c: Context) => {
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: { code: 'invalid_request', message: 'malformed JSON' } }, 400)
    }

    const parsed = InvokeHookRequestSchema.safeParse(body)
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
    const key = `${req.module}.${req.capability}.${req.hook_name}`
    const handler = handlers[key]
    if (!handler) {
      return c.json({
        ok: false,
        error: { code: 'hook_not_found', message: `hook '${key}' not registered` },
      })
    }

    const claims = c.get('claims') as BridgeTokenClaims
    try {
      const result = await handler(req.payload, {
        pluginId: claims.plugin_id,
        hostId: claims.host_id,
        tenantId: claims.tenant_id,
        userId: claims.user_id,
        scopes: claims.scopes,
        jti: claims.jti,
        module: req.module,
        capability: req.capability,
        hookName: req.hook_name,
      })
      return c.json({ ok: true, result })
    } catch (err) {
      const e = err as { code?: string; message?: string }
      return c.json({
        ok: false,
        error: {
          code: e.code ?? 'hook_error',
          message: e.message ?? 'hook execution failed',
        },
      })
    }
  }
}
