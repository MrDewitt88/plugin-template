// Tool-Registry — Plugin-Provider registriert Tools aus manifest.provides
// .mcp_tools (mixed-form: string ODER object). Registry validiert + dedup'd
// + bietet Lookup für execute-tool-Dispatcher.
import { McpToolEntrySchema, normalizeMcpToolEntry } from './types.js';
export class ToolRegistryError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = 'ToolRegistryError';
    }
}
export class ToolRegistry {
    tools = new Map();
    /**
     * Bulk-register aus manifest.provides.mcp_tools.
     * Validiert jeden Entry + de-dup'd nach name. Wirft bei duplicate.
     */
    registerFromManifest(entries) {
        for (const entry of entries) {
            const parsed = McpToolEntrySchema.safeParse(entry);
            if (!parsed.success) {
                const issues = parsed.error.issues.map((i) => i.message).join('; ');
                throw new ToolRegistryError('invalid_entry', `invalid mcp_tool entry: ${issues}`);
            }
            const tool = normalizeMcpToolEntry(parsed.data);
            if (this.tools.has(tool.name)) {
                throw new ToolRegistryError('duplicate_tool', `duplicate tool-name: ${tool.name}`);
            }
            this.tools.set(tool.name, tool);
        }
    }
    /**
     * Single-tool register (für programmatic Setup, Tests).
     */
    register(entry) {
        this.registerFromManifest([entry]);
        const tool = this.tools.get(typeof entry === 'string' ? entry : entry.name);
        if (!tool)
            throw new ToolRegistryError('invalid_entry', 'register-failure');
        return tool;
    }
    /**
     * Lookup tool by name. Returns null wenn nicht registriert.
     */
    get(name) {
        return this.tools.get(name) ?? null;
    }
    /**
     * List alle registered tools.
     */
    list() {
        return Array.from(this.tools.values());
    }
    /**
     * Has-check.
     */
    has(name) {
        return this.tools.has(name);
    }
    /**
     * Clear registry (für tests + reload).
     */
    clear() {
        this.tools.clear();
    }
}
//# sourceMappingURL=registry.js.map