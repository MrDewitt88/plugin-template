import { type McpToolEntry, type NormalizedTool } from './types.js';
export declare class ToolRegistryError extends Error {
    readonly code: 'duplicate_tool' | 'invalid_entry' | 'tool_not_found';
    constructor(code: 'duplicate_tool' | 'invalid_entry' | 'tool_not_found', message: string);
}
export declare class ToolRegistry {
    private readonly tools;
    /**
     * Bulk-register aus manifest.provides.mcp_tools.
     * Validiert jeden Entry + de-dup'd nach name. Wirft bei duplicate.
     */
    registerFromManifest(entries: McpToolEntry[]): void;
    /**
     * Single-tool register (für programmatic Setup, Tests).
     */
    register(entry: McpToolEntry): NormalizedTool;
    /**
     * Lookup tool by name. Returns null wenn nicht registriert.
     */
    get(name: string): NormalizedTool | null;
    /**
     * List alle registered tools.
     */
    list(): NormalizedTool[];
    /**
     * Has-check.
     */
    has(name: string): boolean;
    /**
     * Clear registry (für tests + reload).
     */
    clear(): void;
}
//# sourceMappingURL=registry.d.ts.map