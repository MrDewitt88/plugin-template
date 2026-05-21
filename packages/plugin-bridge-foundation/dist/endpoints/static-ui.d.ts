import type { Context } from 'hono';
export interface StaticUiHandlerOptions {
    /**
     * Absolute filesystem-path zum dist/ui directory. Alle requested files
     * MÜSSEN unter diesem root liegen (path-traversal protection).
     */
    staticDir: string;
    /**
     * URL-prefix unter dem die Handler-Route mount'd wird. Default '/static/ui'.
     * Pflicht: muss matched zu wie createBridgeApp das Endpoint einbindet.
     */
    urlPrefix?: string;
    /**
     * Cache-Control header. Default 'public, max-age=31536000, immutable' —
     * geeignet für content-hashed esbuild-bundles (file.MAUBSVBY.js). Wenn
     * du non-hashed assets ausliefst, override auf 'no-cache' oder kürzerer max-age.
     */
    cacheControl?: string;
    /**
     * Optional 404-handler wenn file fehlt. Default: Drift #103-canonical
     * `{error:{code:'not_found',message:'…'}}`.
     */
    onNotFound?: (c: Context, requestedPath: string) => Response | Promise<Response>;
}
export declare function staticUiHandler(opts: StaticUiHandlerOptions): (c: Context) => Promise<Response>;
//# sourceMappingURL=static-ui.d.ts.map