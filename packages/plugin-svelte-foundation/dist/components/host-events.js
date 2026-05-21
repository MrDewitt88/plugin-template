// Plugin → Host CustomEvent dispatch-Helpers.
// Spec-Reference: V8 docs/PLUGIN-KIARA-INTEGRATION.md §2.3 +
// PLUGIN-BRIDGE-PROTOCOL.md §"Plugin → Host Events"
//
// Alle Events sind `bubbles: true, composed: true` — Pflicht damit sie
// Shadow-DOM-Boundary crossen können.
/**
 * Dispatch plugin:navigate von einem Source-Element. Host catched + routet
 * zu `/plugins/<plugin_id><route_path>`.
 */
export function dispatchNavigate(source, detail) {
    return source.dispatchEvent(new CustomEvent('plugin:navigate', {
        detail,
        bubbles: true,
        composed: true,
    }));
}
/**
 * Dispatch plugin:refresh — Host invalidates loads / re-fetcht sidebar etc.
 */
export function dispatchRefresh(source, detail = {}) {
    return source.dispatchEvent(new CustomEvent('plugin:refresh', {
        detail,
        bubbles: true,
        composed: true,
    }));
}
/**
 * Dispatch plugin:error — Host loggt + optional Toast.
 */
export function dispatchError(source, detail) {
    return source.dispatchEvent(new CustomEvent('plugin:error', {
        detail,
        bubbles: true,
        composed: true,
    }));
}
/**
 * Dispatch plugin:ask-kiara — Host opens Kiara-Dialog mit Plugin-Context.
 * Spec-Reference: V8 PLUGIN-KIARA-INTEGRATION.md §2.1 PluginAskKiaraDetail.
 *
 * Pflicht-Felder: context + capabilities[]. Plus optional document_id /
 * title / selection / full_content / suggested_prompt.
 *
 * MAX_CONTENT_BYTES = 50000 — Plugin trimmt selber (Spec §2.2).
 */
export function dispatchAskKiara(source, detail) {
    return source.dispatchEvent(new CustomEvent('plugin:ask-kiara', {
        detail,
        bubbles: true,
        composed: true,
    }));
}
export const MAX_CONTENT_BYTES = 50_000;
/**
 * UTF-8-safe trim auf max-bytes. Cut nur an code-point-boundaries (kein
 * broken-multi-byte-char). Returnt { text, truncated }.
 *
 * Plugin nutzt das vor dispatchAskKiara() für full_content.
 */
export function trimToMaxBytes(text, max = MAX_CONTENT_BYTES) {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder('utf-8', { fatal: false });
    const bytes = encoder.encode(text);
    if (bytes.byteLength <= max)
        return { text, truncated: false };
    // Trim + decode mit `stream: true` → ignoriert incomplete trailing seq
    const trimmed = decoder.decode(bytes.slice(0, max), { stream: true });
    return { text: trimmed, truncated: true };
}
//# sourceMappingURL=host-events.js.map