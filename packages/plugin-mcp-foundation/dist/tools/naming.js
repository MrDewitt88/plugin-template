// Tool-Naming-Convention für Plugin-MCP-Tools.
// Reference: V8 docs/PLUGIN-BRIDGE-PROTOCOL.md §"Tool-Naming-Convention"
//
// Plugin manifest declared bare names (e.g. `documents.create`).
// Host-Side (V8/Theseus) synthesizes namespaced names mit
// plugin-id-prefix (e.g. `markview.documents.create`) für ihre eigene
// MCP-Pipeline.
//
// Diese Foundation bleibt bei bare-names — Host macht die Synthesis
// in seinem `loadPluginToolsForTenant`-equivalent.
const BARE_NAME_RE = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/;
/**
 * Validate bare-name (manifest-form). Disallowed: starts with digit,
 * uppercase, dashes, leading/trailing dots, double-dots. Strict snake_
 * case mit dot-namespace-separator.
 *
 * Examples valid: `list`, `documents.create`, `agent.tools.list_models`
 * Examples invalid: `Documents.Create`, `123.go`, `.list`, `list.`,
 *                   `a..b`, `a-b`
 */
export function isValidBareName(name) {
    return BARE_NAME_RE.test(name);
}
export class ToolNamingError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = 'ToolNamingError';
    }
}
const PLUGIN_ID_RE = /^[a-z][a-z0-9-]*[a-z0-9]$/;
/**
 * Synthesize host-side namespaced tool-name aus (plugin_id, bare_name).
 * Returnt z.B. `markview.documents.create`. Wirft bei invalid inputs.
 *
 * Plugin-Provider importiert das NICHT direkt — host-side wird das
 * in V8s/Theseus' tool-loader benutzt. Wird hier exportiert damit
 * Cross-Repo-Tests + Custom-Hosts es teilen können.
 */
export function synthesizeNamespacedName(pluginId, bareName) {
    if (!PLUGIN_ID_RE.test(pluginId)) {
        throw new ToolNamingError('invalid_plugin_id', `plugin_id must be kebab-case: ${pluginId}`);
    }
    if (!isValidBareName(bareName)) {
        throw new ToolNamingError('invalid_bare_name', `tool bare-name must be snake_case + dot-namespace: ${bareName}`);
    }
    return `${pluginId}.${bareName}`;
}
/**
 * Inverse: parse namespaced name → (plugin_id, bare_name). Returnt null
 * wenn name nicht namespaced ist (kein dot oder kein valid plugin_id-
 * prefix).
 *
 * Host-Side useful für tool-routing zurück zum richtigen Plugin.
 */
export function parseNamespacedName(namespaced) {
    const dot = namespaced.indexOf('.');
    if (dot < 0)
        return null;
    const pluginId = namespaced.slice(0, dot);
    const bareName = namespaced.slice(dot + 1);
    if (!PLUGIN_ID_RE.test(pluginId))
        return null;
    if (!isValidBareName(bareName))
        return null;
    return { pluginId, bareName };
}
//# sourceMappingURL=naming.js.map