import { z } from 'zod'
import type { BridgeAuthContext } from '../types.js'

export const MCP_UI_MIME_TYPE = 'text/html;profile=mcp-app' as const
export const MCP_UI_HTML_MAX_BYTES = 512 * 1024
export const MCP_UI_METADATA_MAX_BYTES = 8 * 1024
export const MCP_UI_RESOURCES_MAX = 128
export const MCP_UI_LIST_PATH = '/plugin-bridge/v1/resources/list' as const
export const MCP_UI_READ_PATH = '/plugin-bridge/v1/resources/read' as const

// Exact registry keys only. Never resolve a caller-supplied URI as a file or URL.
export const McpUiUriSchema = z
  .string()
  .min(6)
  .max(2_048)
  .startsWith('ui://')
  .refine((value) => !/[\s\u0000-\u001f\u007f]/u.test(value), 'invalid UI resource URI')

const domains = z.array(z.string().min(1).max(2_048)).max(32)
export const McpUiResourceMetaSchema = z
  .object({
    ui: z
      .object({
        csp: z
          .object({
            connectDomains: domains.optional(),
            resourceDomains: domains.optional(),
            frameDomains: domains.optional(),
            baseUriDomains: domains.optional(),
          })
          .strict()
          .optional(),
        permissions: z
          .object({
            camera: z.object({}).strict().optional(),
            microphone: z.object({}).strict().optional(),
            geolocation: z.object({}).strict().optional(),
            clipboardWrite: z.object({}).strict().optional(),
          })
          .strict()
          .optional(),
        domain: z.string().min(1).max(2_048).optional(),
        prefersBorder: z.boolean().optional(),
      })
      .passthrough(),
  })
  .passthrough()
  .superRefine((value, ctx) => {
    try {
      if (new TextEncoder().encode(JSON.stringify(value)).byteLength > MCP_UI_METADATA_MAX_BYTES) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'UI metadata exceeds byte limit' })
      }
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'UI metadata must be JSON serializable',
      })
    }
  })
export type McpUiResourceMeta = z.infer<typeof McpUiResourceMetaSchema>

export const McpUiResourceSchema = z
  .object({
    uri: McpUiUriSchema,
    name: z.string().min(1).max(256),
    title: z.string().min(1).max(256).optional(),
    description: z.string().max(4_096).optional(),
    mimeType: z.literal(MCP_UI_MIME_TYPE).default(MCP_UI_MIME_TYPE),
    _meta: McpUiResourceMetaSchema.optional(),
  })
  .strict()
export type McpUiResource = z.infer<typeof McpUiResourceSchema>

export const ListMcpUiResourcesRequestSchema = z.object({}).strict()
export const ListMcpUiResourcesResponseSchema = z
  .object({
    resources: z.array(McpUiResourceSchema).max(MCP_UI_RESOURCES_MAX),
  })
  .strict()
export type ListMcpUiResourcesResponse = z.infer<typeof ListMcpUiResourcesResponseSchema>

export const ReadMcpUiResourceRequestSchema = z.object({ uri: McpUiUriSchema }).strict()
export type ReadMcpUiResourceRequest = z.infer<typeof ReadMcpUiResourceRequestSchema>
export const ReadMcpUiResourceResponseSchema = z
  .object({
    contents: z
      .array(
        z
          .object({
            uri: McpUiUriSchema,
            mimeType: z.literal(MCP_UI_MIME_TYPE),
            text: z
              .string()
              .min(1)
              .max(MCP_UI_HTML_MAX_BYTES)
              .refine(
                (value) => new TextEncoder().encode(value).byteLength <= MCP_UI_HTML_MAX_BYTES,
                'UI HTML exceeds byte limit',
              ),
            _meta: McpUiResourceMetaSchema.optional(),
          })
          .strict(),
      )
      .length(1),
  })
  .strict()
export type ReadMcpUiResourceResponse = z.infer<typeof ReadMcpUiResourceResponseSchema>

export const McpUiDiscoverySchema = z
  .object({
    version: z.literal(1),
    mime_types: z.array(z.literal(MCP_UI_MIME_TYPE)).length(1),
    resources_list_endpoint: z.literal(MCP_UI_LIST_PATH),
    resources_read_endpoint: z.literal(MCP_UI_READ_PATH),
  })
  .strict()
export type McpUiDiscovery = z.infer<typeof McpUiDiscoverySchema>

/** Provider-owned metadata and HTML. The host remains responsible for isolation. */
export interface McpUiResourceDefinition {
  resource: z.input<typeof McpUiResourceSchema>
  /** Unioned with the plugin-wide floor; always enforced, also on discovery. */
  scopesRequired?: readonly string[]
  /** Receives identity exclusively from the verified token, never the request body. */
  read: (ctx: BridgeAuthContext) => string | Promise<string>
}
