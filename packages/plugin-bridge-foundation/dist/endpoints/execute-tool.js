// POST /plugin-bridge/v1/execute-tool — MCP-Tool-Call-Routing.
// Host routet Tool-Call zum Plugin. Plugin executes + returnt
// MCP-konforme ToolCallResult-shape (`{ ok: true, result }` oder
// `{ ok: false, error: { code, message } }`).
import { ExecuteToolRequestSchema } from '../types.js';
export function executeToolHandler(handlers) {
    return async (c) => {
        let body;
        try {
            body = await c.req.json();
        }
        catch {
            return c.json({ error: { code: 'invalid_request', message: 'malformed JSON' } }, 400);
        }
        const parsed = ExecuteToolRequestSchema.safeParse(body);
        if (!parsed.success) {
            return c.json({
                error: {
                    code: 'invalid_request',
                    message: parsed.error.issues
                        .map((i) => `${i.path.join('.')}: ${i.message}`)
                        .join('; '),
                },
            }, 400);
        }
        const req = parsed.data;
        const handler = handlers[req.tool_name];
        if (!handler) {
            return c.json({
                ok: false,
                error: { code: 'tool_not_found', message: `tool '${req.tool_name}' not registered` },
            });
        }
        const claims = c.get('claims');
        try {
            const result = await handler(req.arguments, {
                pluginId: claims.plugin_id,
                hostId: claims.host_id,
                tenantId: claims.tenant_id,
                userId: claims.user_id,
                scopes: claims.scopes,
                jti: claims.jti,
                actorClass: req.actor_class ?? null,
            });
            return c.json({ ok: true, result });
        }
        catch (err) {
            const e = err;
            return c.json({
                ok: false,
                error: {
                    code: e.code ?? 'tool_error',
                    message: e.message ?? 'tool execution failed',
                    ...(e.details !== undefined ? { details: e.details } : {}),
                },
            });
        }
    };
}
//# sourceMappingURL=execute-tool.js.map