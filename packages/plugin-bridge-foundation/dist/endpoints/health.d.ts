import type { Context } from 'hono';
export interface HealthHandlerOptions {
    pluginVersion: string;
    manifestHash: string;
    /** Optional dynamic-status-callback. Default 'ok'. */
    statusFn?: () => 'ok' | 'degraded' | 'unhealthy';
    /** Optional last-active-timestamp. */
    lastActiveFn?: () => string | undefined;
}
export declare function healthHandler(opts: HealthHandlerOptions): (c: Context) => Promise<Response & import("hono").TypedResponse<{
    [x: string]: import("hono/utils/types").JSONValue;
}, import("hono/utils/http-status").ContentfulStatusCode, "json">>;
//# sourceMappingURL=health.d.ts.map