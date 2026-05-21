/**
 * Validate bare-name (manifest-form). Disallowed: starts with digit,
 * uppercase, dashes, leading/trailing dots, double-dots. Strict snake_
 * case mit dot-namespace-separator.
 *
 * Examples valid: `list`, `documents.create`, `agent.tools.list_models`
 * Examples invalid: `Documents.Create`, `123.go`, `.list`, `list.`,
 *                   `a..b`, `a-b`
 */
export declare function isValidBareName(name: string): boolean;
export declare class ToolNamingError extends Error {
    readonly code: 'invalid_bare_name' | 'invalid_plugin_id';
    constructor(code: 'invalid_bare_name' | 'invalid_plugin_id', message: string);
}
/**
 * Synthesize host-side namespaced tool-name aus (plugin_id, bare_name).
 * Returnt z.B. `markview.documents.create`. Wirft bei invalid inputs.
 *
 * Plugin-Provider importiert das NICHT direkt — host-side wird das
 * in V8s/Theseus' tool-loader benutzt. Wird hier exportiert damit
 * Cross-Repo-Tests + Custom-Hosts es teilen können.
 */
export declare function synthesizeNamespacedName(pluginId: string, bareName: string): string;
/**
 * Inverse: parse namespaced name → (plugin_id, bare_name). Returnt null
 * wenn name nicht namespaced ist (kein dot oder kein valid plugin_id-
 * prefix).
 *
 * Host-Side useful für tool-routing zurück zum richtigen Plugin.
 */
export declare function parseNamespacedName(namespaced: string): {
    pluginId: string;
    bareName: string;
} | null;
//# sourceMappingURL=naming.d.ts.map