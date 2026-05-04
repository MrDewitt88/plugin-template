// POST /plugin-bridge/v1/render-ui — UI-Render-Routing.
// Host routet route_path zum Plugin. Plugin returnt
// `{ html, scripts, styles }` damit Host das mounten kann.
//
// Plugin-Provider entscheidet route_path-Matching (static + dynamic).
// Foundation reicht route_path durch — Plugin matcht selber.
//
// Drift #14 mitigation: context default {} ist server-side-Schema-default;
// Host MUSS context-field explicit senden (kann aber {} sein).
// Drift #20+#21 mitigation: scripts/styles können relative URLs sein
// (`/static/ui/<bundle>.js`). Host resolved gegen serviceEndpoint.

import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { RenderUiRequestSchema, type BridgeTokenClaims, type RenderUiHandler } from '../types.js'

export function renderUiHandler(handler: RenderUiHandler) {
  return async (c: Context) => {
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: { code: 'invalid_request', message: 'malformed JSON' } }, 400)
    }

    const parsed = RenderUiRequestSchema.safeParse(body)
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
    const claims = c.get('claims') as BridgeTokenClaims

    try {
      const result = await handler(req.route_path, {
        pluginId: claims.plugin_id,
        hostId: claims.host_id,
        tenantId: claims.tenant_id,
        userId: claims.user_id,
        scopes: claims.scopes,
        jti: claims.jti,
        context: req.context,
      })
      return c.json(result)
    } catch (err) {
      const e = err as { code?: string; message?: string; status?: number }
      const status: ContentfulStatusCode = (e.status ?? (e.code === 'not_found' ? 404 : 500)) as ContentfulStatusCode
      return c.json(
        {
          error: {
            code: e.code ?? 'render_error',
            message: e.message ?? 'render-ui failed',
          },
        },
        status,
      )
    }
  }
}
