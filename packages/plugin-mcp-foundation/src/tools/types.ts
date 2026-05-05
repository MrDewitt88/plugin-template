// MCP-Tool-Types — matched docs/PLUGIN-BRIDGE-PROTOCOL.md §"Phase-3
// Spec: mcp_tools Extended Form".
//
// Wire-Convention: snake_case auf der Wire. TypeScript-internal:
// snake_case beibehalten weil JSON-Schemas schon snake_case-Keys
// haben (input_schema/output_schema/scopes_required) — Translation
// hier wäre verwirrend.

import { z } from 'zod'

/**
 * JSON-Schema-Draft-7-Subset für input_schema/output_schema. Plugin-
 * Provider nutzt das für Tool-Args-Validation. Phase-3 Standard
 * (siehe PROTOCOL.md §3 JSON-Schema-Subset).
 */
export const JsonSchemaDraft7SubsetSchema: z.ZodType<unknown> = z
  .record(z.unknown())
  .refine((v) => typeof v === 'object' && v !== null, 'must be JSON object')

/**
 * mcp_tool Extended-Form-Entry. Object-shape mit optional input/output
 * schema + per-tool scopes_required.
 */
export const ExtendedMcpToolSchema = z.object({
  name: z
    .string()
    .min(3)
    .regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/, 'tool-name kebab/dot/snake_case'),
  description: z.string().optional(),
  input_schema: JsonSchemaDraft7SubsetSchema.optional(),
  output_schema: JsonSchemaDraft7SubsetSchema.optional(),
  scopes_required: z.array(z.string()).optional(),
})
export type ExtendedMcpTool = z.infer<typeof ExtendedMcpToolSchema>

// Naming-Regex matched für string-form UND object-form .name
const TOOL_NAME_RE = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/

/**
 * mcp_tools-Entry: backward-compat string-form (Phase-1) ODER
 * Extended-Form-Object (Phase-3). Beide Formen validieren tool-name
 * via TOOL_NAME_RE (snake_case + dot-namespace, kein uppercase/dash).
 */
export const McpToolEntrySchema = z.union([
  z.string().regex(TOOL_NAME_RE, 'tool-name snake_case + dot-namespace'),
  ExtendedMcpToolSchema,
])
export type McpToolEntry = z.infer<typeof McpToolEntrySchema>

/**
 * Normalized Form: alle Entries zu Extended-Form ge-upgraded für
 * Registry-Lookup. String-form wird zu `{ name }`-only-object.
 */
export interface NormalizedTool {
  name: string
  description: string | undefined
  input_schema: Record<string, unknown> | undefined
  output_schema: Record<string, unknown> | undefined
  scopes_required: string[]
}

/**
 * Normalize entry zu kanonischer Form. String → `{ name, ... undefined }`,
 * Object → as-is mit defaults.
 */
export function normalizeMcpToolEntry(entry: McpToolEntry): NormalizedTool {
  if (typeof entry === 'string') {
    return {
      name: entry,
      description: undefined,
      input_schema: undefined,
      output_schema: undefined,
      scopes_required: [],
    }
  }
  return {
    name: entry.name,
    description: entry.description,
    input_schema: entry.input_schema as Record<string, unknown> | undefined,
    output_schema: entry.output_schema as Record<string, unknown> | undefined,
    scopes_required: entry.scopes_required ?? [],
  }
}
