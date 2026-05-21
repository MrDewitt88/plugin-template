import type { NormalizedTool } from '../tools/types.js';
export interface ScopeCheckOptions {
    /** plugin-wide scopes_required aus manifest.provides.scopes_required. */
    pluginWideScopes: string[];
    /** scopes des callers (aus JWT-claim). */
    callerScopes: string[];
    /** tool, der gerufen werden soll. */
    tool: NormalizedTool;
}
export interface ScopeCheckResult {
    ok: boolean;
    /** missing scopes — präzise message für error-response. */
    missing: string[];
    /** required = plugin-wide ∪ tool-specific (deduped). */
    required: string[];
}
/**
 * Berechnet required-set + checkt ob caller-scopes ALL davon enthält.
 *
 * Wildcard-Convention: `mcp.plugin.*` matcht alle scopes mit prefix
 * `mcp.plugin.` — V8s admin-cookie-Convention. Plugin-Foundation
 * implementiert die Wildcard-Logic damit Plugin-Provider nicht selbst
 * basteln müssen.
 */
export declare function checkScopes(opts: ScopeCheckOptions): ScopeCheckResult;
//# sourceMappingURL=scope-check.d.ts.map