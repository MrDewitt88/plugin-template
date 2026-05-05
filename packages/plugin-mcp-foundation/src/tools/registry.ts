// Tool-Registry — Plugin-Provider registriert Tools aus manifest.provides
// .mcp_tools (mixed-form: string ODER object). Registry validiert + dedup'd
// + bietet Lookup für execute-tool-Dispatcher.

import { McpToolEntrySchema, normalizeMcpToolEntry, type McpToolEntry, type NormalizedTool } from './types.js'

export class ToolRegistryError extends Error {
  constructor(
    public readonly code: 'duplicate_tool' | 'invalid_entry' | 'tool_not_found',
    message: string,
  ) {
    super(message)
    this.name = 'ToolRegistryError'
  }
}

export class ToolRegistry {
  private readonly tools = new Map<string, NormalizedTool>()

  /**
   * Bulk-register aus manifest.provides.mcp_tools.
   * Validiert jeden Entry + de-dup'd nach name. Wirft bei duplicate.
   */
  registerFromManifest(entries: McpToolEntry[]): void {
    for (const entry of entries) {
      const parsed = McpToolEntrySchema.safeParse(entry)
      if (!parsed.success) {
        const issues = parsed.error.issues.map((i) => i.message).join('; ')
        throw new ToolRegistryError('invalid_entry', `invalid mcp_tool entry: ${issues}`)
      }
      const tool = normalizeMcpToolEntry(parsed.data)
      if (this.tools.has(tool.name)) {
        throw new ToolRegistryError(
          'duplicate_tool',
          `duplicate tool-name: ${tool.name}`,
        )
      }
      this.tools.set(tool.name, tool)
    }
  }

  /**
   * Single-tool register (für programmatic Setup, Tests).
   */
  register(entry: McpToolEntry): NormalizedTool {
    this.registerFromManifest([entry])
    const tool = this.tools.get(typeof entry === 'string' ? entry : entry.name)
    if (!tool) throw new ToolRegistryError('invalid_entry', 'register-failure')
    return tool
  }

  /**
   * Lookup tool by name. Returns null wenn nicht registriert.
   */
  get(name: string): NormalizedTool | null {
    return this.tools.get(name) ?? null
  }

  /**
   * List alle registered tools.
   */
  list(): NormalizedTool[] {
    return Array.from(this.tools.values())
  }

  /**
   * Has-check.
   */
  has(name: string): boolean {
    return this.tools.has(name)
  }

  /**
   * Clear registry (für tests + reload).
   */
  clear(): void {
    this.tools.clear()
  }
}
