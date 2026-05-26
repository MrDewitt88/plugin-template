// @nexus-mindgarden/granite-test — Zod-enum auto-injection für system-prompts.
//
// v0.0.3+ feature per plug-elec msg #783 + plug-db msg #780 + mind-canva-
// interest (3-adopter signal). Cohort-2-pattern evidence: wiz-mind msg #761
// shows 0/3→3/3 schema-pass when enum-values explicit in system-prompt.
//
// Auto-derives enum-hints from Zod-schema introspection:
//
//   z.object({
//     kind_filter: z.enum(['STATIC', 'VERSIONED', 'EVENT']),
//     doc_type_filter: z.enum(['kb_card', 'wm_npc_memory']),
//   })
//
// produces system-prompt suffix:
//
//   Available kind_filter values: STATIC, VERSIONED, EVENT.
//   Available doc_type_filter values: kb_card, wm_npc_memory.
//
// Use-case: plug-db has 13 tools × ~3-5 enums each = ~50 enum-injection-
// savings vs manual prompt-engineering per tool.

import { z } from 'zod'

/**
 * Build a system-prompt suffix that lists all enum-values found in a
 * Zod-object schema. Recurses one-level into nested objects (for tools
 * with grouped parameters). Non-enum fields are silently ignored.
 *
 * @param parameters - Zod-schema (typically `z.object({...})`)
 * @returns Newline-joined enum-injection hints, or empty string if no enums
 */
export function buildEnumInjection(parameters: z.ZodTypeAny): string {
  const hints: string[] = []
  collectEnumHints(parameters, '', hints)
  return hints.join('\n')
}

/**
 * Build the canonical system-prompt enrichment for a tool-test.
 *
 * Three composable hints, joined by double-newlines:
 *
 * 1. **Enum-injection** (from Zod-schema `parameters`, plug-elec msg #783)
 * 2. **Schema-example** (from `expected_tool_args`, wiz-mind msg #761
 *    cohort-2 pattern: "To call X, use the exact shape: {...}")
 * 3. **No-text-leak directive** (from `permitDualEmission: false`,
 *    plug-elec ET-Mind hard-fail pattern + Oracle msg #831 text-leak)
 *
 * Plugin-authors typically don't call this directly — the runner invokes
 * it before each case-execution if `embedSchemaExample !== false`.
 */
export function buildSystemPromptEnrichment(opts: {
  /** Tool name for context (e.g. `'switchgear.aggregate'`). */
  tool: string
  /** Zod schema for tool args. If absent, enum-injection skipped. */
  parameters?: z.ZodTypeAny
  /** Expected args for this case. Used to emit "use this exact shape". */
  expectedToolArgs?: Record<string, unknown>
  /** If true, append no-text-leak directive (default true = strict). */
  enforceNoTextLeak?: boolean
}): string {
  const parts: string[] = []

  if (opts.parameters) {
    const enumInjection = buildEnumInjection(opts.parameters)
    if (enumInjection) parts.push(enumInjection)
  }

  if (opts.expectedToolArgs) {
    const shapeHint = `To call ${opts.tool}, use the exact shape: ${JSON.stringify(opts.expectedToolArgs)}`
    parts.push(shapeHint)
  }

  if (opts.enforceNoTextLeak !== false) {
    parts.push(
      `ALWAYS call the ${opts.tool} tool. NEVER describe the result in text — only the tool-call is the canonical answer. Prose alongside tool-call will be rejected.`,
    )
  }

  return parts.join('\n\n')
}

// --- Internals ---

function collectEnumHints(schema: z.ZodTypeAny, pathPrefix: string, hints: string[]): void {
  // Unwrap optional/nullable to get inner type
  let inner: z.ZodTypeAny = schema
  while (inner._def.typeName === 'ZodOptional' || inner._def.typeName === 'ZodNullable') {
    inner = (inner._def as { innerType: z.ZodTypeAny }).innerType
  }

  if (inner._def.typeName === 'ZodEnum') {
    const enumValues = (inner as z.ZodEnum<[string, ...string[]]>).options
    hints.push(`Available ${pathPrefix} values: ${enumValues.join(', ')}.`)
    return
  }

  if (inner._def.typeName === 'ZodObject') {
    const shape = (inner as z.ZodObject<z.ZodRawShape>).shape
    for (const [key, fieldSchema] of Object.entries(shape)) {
      const fieldPath = pathPrefix ? `${pathPrefix}.${key}` : key
      collectEnumHints(fieldSchema as z.ZodTypeAny, fieldPath, hints)
    }
    return
  }

  // ZodLiteral, ZodNativeEnum could also be handled — defer to v0.0.4 if requested
}
