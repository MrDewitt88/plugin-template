// Shared types für Plugin-Bridge-Foundation. Spec-Reference:
// MrDewitt88/TeamMindV8 docs/PLUGIN-BRIDGE-PROTOCOL.md
//
// Wire-Convention: snake_case auf der Wire, camelCase TypeScript-internal.
// Translation passiert im Endpoint-Handler.

import { z } from 'zod'

// --- Manifest ---

export const PluginI18nStringSchema = z.object({
  de: z.string().optional(),
  en: z.string().optional(),
})
export type PluginI18nString = z.infer<typeof PluginI18nStringSchema>

export const PluginRouteSchema = z.object({
  path: z.string().min(1),
  component_type: z.enum(['web-component', 'iframe']),
  service_endpoint: z.string().min(1),
})
export type PluginRoute = z.infer<typeof PluginRouteSchema>

export const PluginMcpToolEntrySchema = z.union([
  z.string().min(1),
  z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    input_schema: z.record(z.unknown()).optional(),
    output_schema: z.record(z.unknown()).optional(),
    scopes_required: z.array(z.string()).optional(),
  }),
])
export type PluginMcpToolEntry = z.infer<typeof PluginMcpToolEntrySchema>

export const PluginModuleExtensionSchema = z.object({
  module: z.string().min(1),
  capability: z.string().min(1),
  hook_endpoints: z.record(z.string()),
})
export type PluginModuleExtension = z.infer<typeof PluginModuleExtensionSchema>

export const PluginManifestSchema = z.object({
  id: z
    .string()
    .min(3)
    .max(64)
    .regex(/^[a-z][a-z0-9-]*[a-z0-9]$/, 'kebab-case 3-64 chars'),
  name: PluginI18nStringSchema,
  description: PluginI18nStringSchema,
  version: z.string().min(1),
  distribution: z.object({
    type: z.enum(['external-service', 'embedded']),
    service_endpoint: z.string().optional(),
    marketplace_url: z.string().optional(),
  }),
  compatibility: z.object({
    apps: z.array(z.string()).min(1),
    min_app_version: z.string().min(1),
  }),
  provides: z.object({
    routes: z.array(PluginRouteSchema).default([]),
    mcp_tools: z.array(PluginMcpToolEntrySchema).default([]),
    module_extensions: z.array(PluginModuleExtensionSchema).default([]),
    scopes_required: z.array(z.string()).default([]),
  }),
  ui: z
    .object({
      sidebar_entry: z
        .object({
          icon: z.string(),
          label_key: z.string(),
          sort_order: z.number().int().nonnegative().default(100),
        })
        .optional(),
    })
    .optional(),
  vendor: z.string().optional(),
  license: z.string().optional(),
  homepage: z.string().optional(),
})
export type PluginManifest = z.infer<typeof PluginManifestSchema>

// --- Bridge-Token (JWT) ---

export interface BridgeTokenClaims {
  iss: string
  sub: string // = pluginId
  jti: string
  iat: number
  exp: number
  plugin_id: string
  host_id: string
  tenant_id: string
  user_id: string
  scopes: string[]
}

// --- Host-Keys-Registry ---

export type HostKeyStatus = 'pending' | 'active' | 'rejected'

export interface HostKeyRecord {
  host_id: string
  public_key_pem: string
  status: HostKeyStatus
  fingerprint: string
  registered_at: string
  approved_at: string | null
}

// --- Bridge-Endpoint Request/Response Schemas ---

export const HandshakeRequestSchema = z.object({
  plugin_id: z.string().min(1),
  host_id: z.string().min(1),
  host_version: z.string().min(1),
  tenant_id: z.string().uuid(),
  user_id: z.string().uuid(),
})
export type HandshakeRequest = z.infer<typeof HandshakeRequestSchema>

export const HandshakeResponseSchema = z.object({
  plugin_id: z.string(),
  version: z.string(),
  manifest: PluginManifestSchema,
  capabilities_acknowledged: z.array(z.enum(['routes', 'mcp_tools', 'module_extensions'])),
  health: z.enum(['ok', 'degraded', 'unhealthy']),
})
export type HandshakeResponse = z.infer<typeof HandshakeResponseSchema>

export const HealthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded', 'unhealthy']),
  version: z.string().min(1),
  last_active: z.string().optional(),
  // Phase-3 V8/Theseus: Live-Re-Registration trigger via manifest_hash diff.
  // Optional — Plugin-Provider die kein hash senden → Host macht kein
  // automatisches Re-Register (backward-compat).
  manifest_hash: z.string().min(1).optional(),
})
export type HealthResponse = z.infer<typeof HealthResponseSchema>

export const ExecuteToolRequestSchema = z.object({
  tool_name: z.string().min(1),
  arguments: z.record(z.unknown()).default({}),
  actor_class: z.enum(['user', 'kiara']).nullable().optional(),
  tenant_id: z.string().uuid(),
  user_id: z.string().uuid(),
})
export type ExecuteToolRequest = z.infer<typeof ExecuteToolRequestSchema>

export const ExecuteToolResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), result: z.unknown() }),
  z.object({
    ok: z.literal(false),
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
    }),
  }),
])
export type ExecuteToolResponse = z.infer<typeof ExecuteToolResponseSchema>

export const RenderUiRequestSchema = z.object({
  route_path: z.string().regex(/^\//, 'route_path must start with /'),
  tenant_id: z.string().uuid(),
  user_id: z.string().uuid(),
  context: z.record(z.unknown()).default({}),
})
export type RenderUiRequest = z.infer<typeof RenderUiRequestSchema>

export const RenderUiResponseSchema = z.object({
  html: z.string(),
  scripts: z.array(z.string().min(1)).default([]),
  styles: z.array(z.string().min(1)).default([]),
})
export type RenderUiResponse = z.infer<typeof RenderUiResponseSchema>

export const InvokeHookRequestSchema = z.object({
  module: z.string().min(1),
  capability: z.string().min(1),
  hook_name: z.string().min(1),
  payload: z.unknown(),
  tenant_id: z.string().uuid(),
  user_id: z.string().uuid(),
})
export type InvokeHookRequest = z.infer<typeof InvokeHookRequestSchema>

export const InvokeHookResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), result: z.unknown() }),
  z.object({
    ok: z.literal(false),
    error: z.object({
      code: z.string(),
      message: z.string(),
    }),
  }),
])
export type InvokeHookResponse = z.infer<typeof InvokeHookResponseSchema>

// --- Bridge-Auth-Context ---

export interface BridgeAuthContext {
  pluginId: string
  hostId: string
  tenantId: string
  userId: string
  scopes: string[]
  jti: string
}

// --- Tool/Hook-Handler-Signatures ---

export type ToolHandler = (
  args: Record<string, unknown>,
  ctx: BridgeAuthContext & { actorClass: 'user' | 'kiara' | null },
) => Promise<unknown>

export type HookHandler = (
  payload: unknown,
  ctx: BridgeAuthContext & { module: string; capability: string; hookName: string },
) => Promise<unknown>

export type RenderUiHandler = (
  routePath: string,
  ctx: BridgeAuthContext & { context: Record<string, unknown> },
) => Promise<RenderUiResponse>
