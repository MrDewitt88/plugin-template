import { Hono } from 'hono';
import { HostKeyRegistry } from './auth/index.js';
import { type StaticUiHandlerOptions } from './endpoints/static-ui.js';
import { MetricsRegistry, type Logger } from './observability/index.js';
import type { BridgeTokenClaims, HookHandler, PluginManifest, RenderUiHandler, ToolHandler } from './types.js';
export type BridgeEnv = {
    Variables: {
        claims: BridgeTokenClaims;
        request_id: string;
    };
};
export interface BridgeAppOptions {
    manifest: PluginManifest;
    registry: HostKeyRegistry;
    /** map of tool_name → handler */
    toolHandlers: Record<string, ToolHandler>;
    /** route_path-pattern handler — Plugin-Provider matcht selbst */
    renderUi?: RenderUiHandler;
    /** map of `${module}.${capability}.${hook_name}` → handler */
    hookHandlers?: Record<string, HookHandler>;
    /** Custom CORS origin-list. Default '*'. */
    corsOrigin?: string | string[];
    /** Optional: fixed plugin-version-string für /health.version (default manifest.version) */
    pluginVersion?: string;
    /**
     * v0.2.0 — Observability opt-ins. Wenn provided wired Foundation:
     *  - HTTP-request-counter (method, path, status)
     *  - /metrics endpoint (unauth, Prometheus exposition-format 0.0.4)
     *  - HTTP-access-logs via Logger
     * Wenn weggelassen: kein observability-wiring (backward-compat mit v0.1.x).
     */
    observability?: BridgeObservabilityOptions;
    /**
     * v0.2.0 — Static UI serving. Wenn provided mounted Foundation `urlPrefix`
     * (default '/static/ui') als unauth file-server gegen `staticDir` mit
     * content-type-detection, immutable cache-control, path-traversal-safety.
     */
    staticUi?: StaticUiHandlerOptions;
}
export interface BridgeObservabilityOptions {
    /** MetricsRegistry — Foundation registriert HTTP-counter + uptime + registry-size. */
    registry?: MetricsRegistry;
    /** Logger für HTTP-access-logs (1 line per request). */
    logger?: Logger;
    /** Default true wenn registry provided. /metrics-endpoint at `/metrics` (unauth, top-level). */
    exposeMetricsEndpoint?: boolean;
}
export declare function createBridgeApp(opts: BridgeAppOptions): Hono<BridgeEnv>;
//# sourceMappingURL=server.d.ts.map