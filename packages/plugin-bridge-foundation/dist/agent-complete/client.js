// createAgentComplete — Foundation-Helper für Plugin-Authors.
//
// Wraps fetch(bridgeEndpoint + '/mcp/v1/call-tool') mit {tool: 'agent.complete',
// arguments: validated}. Zod-validation auf Request + Response macht silent-fail
// sichtbar. Cross-Repo: V8 + v8-fam exposen `/mcp/v1/call-tool` per Design-Y
// (msg #445), forward zu Theseus' POST /agent/complete (msg #449).
//
// Plugin-Author-API:
//
//   import { createAgentComplete } from '@nexus/plugin-bridge-foundation/agent-complete'
//
//   const agentComplete = createAgentComplete({
//     bridgeEndpoint: ctx.bridgeEndpoint,  // aus M17 accept-response
//     sessionToken: ctx.sessionToken,      // ebenfalls aus M17
//   })
//
//   const result = await agentComplete({
//     messages: [{ role: 'user', content: 'Summarize this layout: ...' }],
//     responseFormat: { type: 'json_schema', schema: zodToJsonSchema(MySchema) },
//     maxTokens: 200,
//     cacheRetention: 'short',
//   })
//
//   if (result.error) handleError(result.error)
//   else MySchema.parse(JSON.parse(result.text))  // defense-in-depth
import { AgentCompleteRequestSchema, AgentCompleteResponseSchema, } from './types.js';
export class AgentCompleteError extends Error {
    code;
    httpStatus;
    cause;
    constructor(code, message, httpStatus, cause) {
        super(message);
        this.code = code;
        this.httpStatus = httpStatus;
        this.cause = cause;
        this.name = 'AgentCompleteError';
    }
}
/**
 * Factory for typed `agent.complete` caller. Validates request/response via
 * the canonical schemas + wraps transport errors as `AgentCompleteError`.
 *
 * Drift #103 canonical-error-shape is preserved through V8's pass-through
 * dispatcher — server-side errors land in `response.error.{code,message,retryable}`,
 * NOT thrown. Throws only for transport-failures + schema-mismatches.
 */
export function createAgentComplete(opts) {
    // Normalize endpoint: accept both `.../call-tool` and `.../mcp/v1` shapes
    const baseEndpoint = opts.bridgeEndpoint.replace(/\/call-tool\/?$/, '').replace(/\/$/, '');
    const callToolUrl = `${baseEndpoint}/call-tool`;
    const fetchImpl = opts.fetch ?? globalThis.fetch;
    return async (req) => {
        const parsed = AgentCompleteRequestSchema.safeParse(req);
        if (!parsed.success) {
            throw new AgentCompleteError('invalid_request', `agent.complete request validation failed: ${parsed.error.issues
                .map((i) => `${i.path.join('.')}: ${i.message}`)
                .join('; ')}`);
        }
        const headers = {
            Authorization: `Bearer ${opts.sessionToken}`,
            'Content-Type': 'application/json',
        };
        if (opts.callerId)
            headers['x-caller-id'] = opts.callerId;
        if (opts.requestId)
            headers['X-Request-Id'] = opts.requestId;
        let res;
        try {
            res = await fetchImpl(callToolUrl, {
                method: 'POST',
                headers,
                body: JSON.stringify({ tool: 'agent.complete', arguments: parsed.data }),
            });
        }
        catch (err) {
            throw new AgentCompleteError('transport_failure', `agent.complete transport failure: ${err.message}`, undefined, err);
        }
        if (!res.ok) {
            // V8/v8-fam Drift #103 canonical-error: try to extract structured body
            let bodyText = '';
            try {
                bodyText = await res.text();
            }
            catch {
                // ignore
            }
            throw new AgentCompleteError('http_error', `agent.complete HTTP ${res.status}: ${bodyText || res.statusText}`, res.status);
        }
        let body;
        try {
            body = await res.json();
        }
        catch (err) {
            throw new AgentCompleteError('invalid_response', `agent.complete response is not valid JSON: ${err.message}`, res.status, err);
        }
        const result = AgentCompleteResponseSchema.safeParse(body);
        if (!result.success) {
            throw new AgentCompleteError('invalid_response', `agent.complete response schema mismatch: ${result.error.issues
                .map((i) => `${i.path.join('.')}: ${i.message}`)
                .join('; ')}`, res.status);
        }
        return result.data;
    };
}
/**
 * Convenience helper: when you just want the text (most common case).
 * Throws if `result.error` is set OR `result.text` is empty.
 */
export async function agentCompleteText(client, req) {
    const result = await client(req);
    if (result.error) {
        throw new AgentCompleteError('invalid_response', `agent.complete returned error envelope: ${result.error.code} — ${result.error.message}`);
    }
    return result.text;
}
//# sourceMappingURL=client.js.map