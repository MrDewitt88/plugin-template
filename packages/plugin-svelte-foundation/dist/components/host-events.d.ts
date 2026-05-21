export interface PluginNavigateDetail {
    route_path: string;
}
export interface PluginRefreshDetail {
    scope?: string;
}
export interface PluginErrorDetail {
    code: string;
    message: string;
}
export interface PluginAskKiaraDetail {
    context: string;
    document_id?: string;
    document_title?: string;
    selection?: string;
    cursor_offset?: number;
    full_content?: string;
    full_content_truncated?: boolean;
    suggested_prompt?: string;
    capabilities: string[];
}
/**
 * Dispatch plugin:navigate von einem Source-Element. Host catched + routet
 * zu `/plugins/<plugin_id><route_path>`.
 */
export declare function dispatchNavigate(source: EventTarget, detail: PluginNavigateDetail): boolean;
/**
 * Dispatch plugin:refresh — Host invalidates loads / re-fetcht sidebar etc.
 */
export declare function dispatchRefresh(source: EventTarget, detail?: PluginRefreshDetail): boolean;
/**
 * Dispatch plugin:error — Host loggt + optional Toast.
 */
export declare function dispatchError(source: EventTarget, detail: PluginErrorDetail): boolean;
/**
 * Dispatch plugin:ask-kiara — Host opens Kiara-Dialog mit Plugin-Context.
 * Spec-Reference: V8 PLUGIN-KIARA-INTEGRATION.md §2.1 PluginAskKiaraDetail.
 *
 * Pflicht-Felder: context + capabilities[]. Plus optional document_id /
 * title / selection / full_content / suggested_prompt.
 *
 * MAX_CONTENT_BYTES = 50000 — Plugin trimmt selber (Spec §2.2).
 */
export declare function dispatchAskKiara(source: EventTarget, detail: PluginAskKiaraDetail): boolean;
export declare const MAX_CONTENT_BYTES = 50000;
/**
 * UTF-8-safe trim auf max-bytes. Cut nur an code-point-boundaries (kein
 * broken-multi-byte-char). Returnt { text, truncated }.
 *
 * Plugin nutzt das vor dispatchAskKiara() für full_content.
 */
export declare function trimToMaxBytes(text: string, max?: number): {
    text: string;
    truncated: boolean;
};
//# sourceMappingURL=host-events.d.ts.map