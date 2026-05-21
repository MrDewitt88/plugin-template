import { z } from 'zod';
/**
 * JSON-Schema-Draft-7-Subset für input_schema/output_schema. Plugin-
 * Provider nutzt das für Tool-Args-Validation. Phase-3 Standard
 * (siehe PROTOCOL.md §3 JSON-Schema-Subset).
 */
export declare const JsonSchemaDraft7SubsetSchema: z.ZodType<unknown>;
/**
 * mcp_tool Extended-Form-Entry. Object-shape mit optional input/output
 * schema + per-tool scopes_required.
 */
export declare const ExtendedMcpToolSchema: z.ZodObject<{
    name: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    input_schema: z.ZodOptional<z.ZodType<unknown, z.ZodTypeDef, unknown>>;
    output_schema: z.ZodOptional<z.ZodType<unknown, z.ZodTypeDef, unknown>>;
    scopes_required: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    name: string;
    description?: string | undefined;
    input_schema?: unknown;
    output_schema?: unknown;
    scopes_required?: string[] | undefined;
}, {
    name: string;
    description?: string | undefined;
    input_schema?: unknown;
    output_schema?: unknown;
    scopes_required?: string[] | undefined;
}>;
export type ExtendedMcpTool = z.infer<typeof ExtendedMcpToolSchema>;
/**
 * mcp_tools-Entry: backward-compat string-form (Phase-1) ODER
 * Extended-Form-Object (Phase-3). Beide Formen validieren tool-name
 * via TOOL_NAME_RE (snake_case + dot-namespace, kein uppercase/dash).
 */
export declare const McpToolEntrySchema: z.ZodUnion<[z.ZodString, z.ZodObject<{
    name: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    input_schema: z.ZodOptional<z.ZodType<unknown, z.ZodTypeDef, unknown>>;
    output_schema: z.ZodOptional<z.ZodType<unknown, z.ZodTypeDef, unknown>>;
    scopes_required: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    name: string;
    description?: string | undefined;
    input_schema?: unknown;
    output_schema?: unknown;
    scopes_required?: string[] | undefined;
}, {
    name: string;
    description?: string | undefined;
    input_schema?: unknown;
    output_schema?: unknown;
    scopes_required?: string[] | undefined;
}>]>;
export type McpToolEntry = z.infer<typeof McpToolEntrySchema>;
/**
 * Normalized Form: alle Entries zu Extended-Form ge-upgraded für
 * Registry-Lookup. String-form wird zu `{ name }`-only-object.
 */
export interface NormalizedTool {
    name: string;
    description: string | undefined;
    input_schema: Record<string, unknown> | undefined;
    output_schema: Record<string, unknown> | undefined;
    scopes_required: string[];
}
/**
 * Normalize entry zu kanonischer Form. String → `{ name, ... undefined }`,
 * Object → as-is mit defaults.
 */
export declare function normalizeMcpToolEntry(entry: McpToolEntry): NormalizedTool;
//# sourceMappingURL=types.d.ts.map