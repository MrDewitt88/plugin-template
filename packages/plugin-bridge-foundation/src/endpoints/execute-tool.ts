// POST /plugin-bridge/v1/execute-tool — MCP-Tool-Call-Routing.
// Host routet Tool-Call zum Plugin. Plugin executes + returnt
// MCP-konforme ToolCallResult-shape (`{ ok: true, result }` oder
// `{ ok: false, error: { code, message } }`).

import type { Context } from 'hono'
import {
  ExecuteToolRequestSchema,
  type BridgeTokenClaims,
  type PluginManifest,
  type ToolHandler,
} from '../types.js'
import { checkToolScopes } from '../auth/scope-check.js'

export interface ExecuteToolOptions {
  /** Manifest — Quelle für plugin-wide + per-tool scopes_required (v0.8.0). */
  manifest: PluginManifest
  /** v0.8.0 — wenn true: per-tool scope-enforcement (403 insufficient_scope). */
  enforceScopes: boolean
}

export function executeToolHandler(
  handlers: Record<string, ToolHandler>,
  opts: ExecuteToolOptions,
) {
  return async (c: Context) => {
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: { code: 'invalid_request', message: 'malformed JSON' } }, 400)
    }

    const parsed = ExecuteToolRequestSchema.safeParse(body)
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: 'invalid_request',
            message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
          },
        },
        400,
      )
    }

    const req = parsed.data
    const handler = handlers[req.tool_name]
    if (!handler) {
      return c.json({
        ok: false,
        error: { code: 'tool_not_found', message: `tool '${req.tool_name}' not registered` },
      })
    }

    const claims = c.get('claims') as BridgeTokenClaims

    // v0.8.0 — opt-in per-tool scope-enforcement. Runs AFTER tool_not_found
    // (no info-leak for unknown tools) and BEFORE the handler. Reads ONLY
    // claims.scopes + manifest scopes_required — NOT actor_class/tenant_id
    // (cross-tenant authz is blocked on v8-corp ruling #5206, out of scope here).
    if (opts.enforceScopes) {
      const sc = checkToolScopes(opts.manifest, req.tool_name, claims.scopes ?? [])
      if (!sc.ok) {
        return c.json(
          {
            ok: false,
            error: {
              code: 'insufficient_scope',
              message: `tool '${req.tool_name}' requires scopes [${sc.missing.join(', ')}] not granted to caller`,
              details: { required: sc.required, missing: sc.missing },
            },
          },
          403,
        )
      }
    }

    try {
      const result = await handler(req.arguments, {
        // v0.10.0 (markview #5357): plugin_id/user_id sind im V8-Token optional →
        // pluginId fällt auf `sub` (canonical activator) zurück, userId aufs
        // Body-Feld (live-caller). claims = raw passthrough (wiz-mind family_policy).
        pluginId: claims.plugin_id ?? claims.sub,
        hostId: claims.host_id,
        tenantId: claims.tenant_id,
        userId: claims.user_id ?? req.user_id,
        scopes: claims.scopes,
        jti: claims.jti,
        claims,
        actorClass: req.actor_class ?? null,
      })
      return c.json({ ok: true, result })
    } catch (err) {
      const e = err as { code?: string; message?: string; details?: unknown }
      return c.json({
        ok: false,
        error: {
          code: e.code ?? 'tool_error',
          message: e.message ?? 'tool execution failed',
          ...(e.details !== undefined ? { details: e.details } : {}),
        },
      })
    }
  }
}
