// Shared types für Plugin-Bridge-Foundation. Spec-Reference:
// MrDewitt88/TeamMindV8 docs/PLUGIN-BRIDGE-PROTOCOL.md
//
// Wire-Convention: snake_case auf der Wire, camelCase TypeScript-internal.
// Translation passiert im Endpoint-Handler.
import { z } from 'zod';
// --- Manifest ---
export const PluginI18nStringSchema = z.object({
    de: z.string().optional(),
    en: z.string().optional(),
});
export const PluginRouteSchema = z.object({
    path: z.string().min(1),
    component_type: z.enum(['web-component', 'iframe']),
    service_endpoint: z.string().min(1),
});
export const PluginMcpToolEntrySchema = z.union([
    z.string().min(1),
    z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        input_schema: z.record(z.unknown()).optional(),
        output_schema: z.record(z.unknown()).optional(),
        scopes_required: z.array(z.string()).optional(),
    }),
]);
export const PluginModuleExtensionSchema = z.object({
    module: z.string().min(1),
    capability: z.string().min(1),
    hook_endpoints: z.record(z.string()),
});
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
});
// --- Drift #206: Schema-Drift Signaling im Handshake ---
//
// Plugins evolve manifest/registration-schemas additively (z.B. neue optional
// fields wie host_metadata). Hosts die pre-Field-Addition registriert haben
// bleiben sonst dauerhaft stale. host_record_status signalisiert dem Host wo
// er steht und ob er re-registrieren sollte.
//
// Block ist ALWAYS-PRESENT — auch bei first-register und bei schon-current
// records — damit der Vertrag symmetrisch bleibt und Host nie zwischen
// 'kein Block' vs 'Block-mit-current' raten muss.
//
// Source-of-Truth Cross-Repo: oracle/plug-ea adopted symmetric contract
// (chatbus msg #246), plug-elec etmind-bridge auth/host-registry.ts:48-68.
export const PLUGIN_REGISTRATION_SCHEMA_VERSION = 1;
/**
 * Optional fields die ein Host bei register-host mitschicken KANN. Wenn fehlend
 * → in missing_optional_fields[] und reregister_recommended=true.
 *
 * v0.2.0 baseline:
 *  - host_version: host's app-version (für Capability-gating)
 *  - relay_url: WebSocket-Endpoint für Pfad-C-Collab (markview) /
 *    Reverse-Call-Channel (plug-elec 'reverse_call_url'). Optional aber
 *    cross-repo-etabliert genug für baseline-Aufnahme (msg #237 markview,
 *    msg #242 plug-elec).
 *
 * Erweiterungen pro Plugin-Provider via BridgeAppOptions.optionalRegisterFields.
 */
export const BASELINE_OPTIONAL_REGISTER_FIELDS = ['host_version', 'relay_url'];
export const HostRecordStatusSchema = z.object({
    schema_version: z.number().int().min(1),
    plugin_current_schema: z.number().int().min(1),
    is_first_register: z.boolean(),
    reregister_recommended: z.boolean(),
    missing_optional_fields: z.array(z.string()).default([]),
    // v0.2.3 — Defensive Cross-Host guard. True wenn dieselbe
    // {host_id, missing_optional_fields}-Tuple in den letzten N Minuten
    // ≥M-mal re-registriert wurde ohne dass die fields populated wurden.
    // Plugin-handler kann entscheiden ob 429 zurück oder nur warn-log.
    // Source: plug-elec DM #350 (V8-Bug C.1 supply-without-skip endless loop).
    reregister_loop_detected: z.boolean().optional(),
});
// --- Bridge-Endpoint Request/Response Schemas ---
export const HandshakeRequestSchema = z.object({
    plugin_id: z.string().min(1),
    host_id: z.string().min(1),
    host_version: z.string().min(1),
    tenant_id: z.string().uuid(),
    user_id: z.string().uuid(),
});
export const HandshakeResponseSchema = z.object({
    plugin_id: z.string(),
    version: z.string(),
    manifest: PluginManifestSchema,
    capabilities_acknowledged: z.array(z.enum(['routes', 'mcp_tools', 'module_extensions'])),
    health: z.enum(['ok', 'degraded', 'unhealthy']),
    // Drift #206 — symmetric, always-present
    host_record_status: HostRecordStatusSchema,
});
// --- register-host Request/Response ---
//
// Bootstrap-Endpoint — Host posted seinen Public-Key zur Plugin-Bridge bevor
// JWT-Auth funktional ist. Drift #12: idempotent — same key preserves status.
// v0.3.1 dual-read for ecosystem-wide drift-resolution (V8 msg #483 + markview msg #485):
// `public_key` is V8/Theseus/MarkView-canonical, `public_key_pem` is plug-tmpl-Foundation-canonical.
// Foundation accepts BOTH, prefers `public_key_pem` (deskriptiver Name) wenn beide present.
// Long-term Ecosystem konvergiert auf `public_key_pem` (markview msg #485 vote).
export const RegisterHostRequestSchema = z
    .object({
    host_id: z.string().min(1),
    public_key_pem: z.string().min(1).optional(),
    public_key: z.string().min(1).optional(),
    // Optional fields — wenn fehlend → in host_record_status.missing_optional_fields
    host_version: z.string().optional(),
    // v0.2.0 — Pfad-C-Collab / reverse-call-channel (markview, plug-elec)
    relay_url: z.string().url().optional(),
})
    .refine((data) => data.public_key_pem !== undefined || data.public_key !== undefined, {
    message: 'either public_key_pem or public_key required',
    path: ['public_key_pem'],
});
/**
 * Drift-resolution helper: prefer `public_key_pem` (canonical-target), fall back to
 * `public_key` (legacy Theseus/MarkView/V8). Returns the PEM string. Throws if both
 * missing (should never happen — schema enforces via .refine).
 */
export function extractPublicKeyPem(req) {
    if (req.public_key_pem)
        return req.public_key_pem;
    if (req.public_key)
        return req.public_key;
    throw new Error('extractPublicKeyPem: neither public_key_pem nor public_key set (schema-bypass?)');
}
export const RegisterHostResponseSchema = z.object({
    host_id: z.string(),
    status: z.enum(['pending', 'active', 'rejected']),
    fingerprint: z.string(),
    registered_at: z.string(),
    // Drift #206 — symmetric, always-present
    host_record_status: HostRecordStatusSchema,
});
export const HealthResponseSchema = z.object({
    status: z.enum(['ok', 'degraded', 'unhealthy']),
    version: z.string().min(1),
    last_active: z.string().optional(),
    // Phase-3 V8/Theseus: Live-Re-Registration trigger via manifest_hash diff.
    // Optional — Plugin-Provider die kein hash senden → Host macht kein
    // automatisches Re-Register (backward-compat).
    manifest_hash: z.string().min(1).optional(),
});
export const ExecuteToolRequestSchema = z.object({
    tool_name: z.string().min(1),
    arguments: z.record(z.unknown()).default({}),
    actor_class: z.enum(['user', 'kiara']).nullable().optional(),
    tenant_id: z.string().uuid(),
    user_id: z.string().uuid(),
});
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
]);
export const RenderUiRequestSchema = z.object({
    route_path: z.string().regex(/^\//, 'route_path must start with /'),
    tenant_id: z.string().uuid(),
    user_id: z.string().uuid(),
    context: z.record(z.unknown()).default({}),
});
export const RenderUiResponseSchema = z.object({
    html: z.string(),
    scripts: z.array(z.string().min(1)).default([]),
    styles: z.array(z.string().min(1)).default([]),
});
export const InvokeHookRequestSchema = z.object({
    module: z.string().min(1),
    capability: z.string().min(1),
    hook_name: z.string().min(1),
    payload: z.unknown(),
    tenant_id: z.string().uuid(),
    user_id: z.string().uuid(),
});
export const InvokeHookResponseSchema = z.discriminatedUnion('ok', [
    z.object({ ok: z.literal(true), result: z.unknown() }),
    z.object({
        ok: z.literal(false),
        error: z.object({
            code: z.string(),
            message: z.string(),
            // v0.2.0 — Parity mit ExecuteToolResponseSchema (Drift #103 canonical)
            details: z.unknown().optional(),
        }),
    }),
]);
//# sourceMappingURL=types.js.map