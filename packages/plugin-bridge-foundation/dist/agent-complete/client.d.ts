import { type AgentCompleteRequest, type AgentCompleteResponse } from './types.js';
export interface CreateAgentCompleteOptions {
    /**
     * Bridge endpoint from M17 guest-registration accept-response.
     * Typically `http://127.0.0.1:3100/mcp/v1/call-tool` (V8) oder `:3050` (v8-fam).
     * Foundation strips trailing `/call-tool` und re-appended.
     */
    bridgeEndpoint: string;
    /** Session-token (Bearer JWT) from M17 accept-response. */
    sessionToken: string;
    /**
     * Optional caller-id header for forensic-tracing. Foundation passes through
     * as `x-caller-id`. Useful for cross-repo debug (e.g. "mind-canva@v8-tenant-x").
     */
    callerId?: string;
    /**
     * Optional `X-Request-Id`. If not provided, host or Foundation generates a
     * UUIDv4 (siehe plug-tmpl v0.2.2 X-Request-Id middleware).
     */
    requestId?: string;
    /**
     * Custom fetch-impl. Default uses globalThis.fetch (Node 20+ / Browser).
     * Inject custom for tests or for fetch-instrumentation.
     */
    fetch?: typeof fetch;
}
export declare class AgentCompleteError extends Error {
    readonly code: 'invalid_request' | 'http_error' | 'invalid_response' | 'transport_failure';
    readonly httpStatus?: number | undefined;
    readonly cause?: unknown | undefined;
    constructor(code: 'invalid_request' | 'http_error' | 'invalid_response' | 'transport_failure', message: string, httpStatus?: number | undefined, cause?: unknown | undefined);
}
export type AgentCompleteFn = (req: AgentCompleteRequest) => Promise<AgentCompleteResponse>;
/**
 * Factory for typed `agent.complete` caller. Validates request/response via
 * the canonical schemas + wraps transport errors as `AgentCompleteError`.
 *
 * Drift #103 canonical-error-shape is preserved through V8's pass-through
 * dispatcher — server-side errors land in `response.error.{code,message,retryable}`,
 * NOT thrown. Throws only for transport-failures + schema-mismatches.
 */
export declare function createAgentComplete(opts: CreateAgentCompleteOptions): AgentCompleteFn;
/**
 * Convenience helper: when you just want the text (most common case).
 * Throws if `result.error` is set OR `result.text` is empty.
 */
export declare function agentCompleteText(client: AgentCompleteFn, req: AgentCompleteRequest): Promise<string>;
//# sourceMappingURL=client.d.ts.map