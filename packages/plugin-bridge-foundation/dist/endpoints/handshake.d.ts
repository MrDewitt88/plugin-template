import type { Context } from 'hono';
import { type HostKeyRegistry } from '../auth/host-keys.js';
import { type PluginManifest } from '../types.js';
export declare function handshakeHandler(manifest: PluginManifest, registry: HostKeyRegistry): (c: Context) => Promise<(Response & import("hono").TypedResponse<{
    error: {
        code: string;
        message: string;
    };
}, 400, "json">) | (Response & import("hono").TypedResponse<{
    plugin_id: string;
    version: string;
    manifest: {
        name: {
            de?: string | undefined;
            en?: string | undefined;
        };
        description: {
            de?: string | undefined;
            en?: string | undefined;
        };
        id: string;
        version: string;
        distribution: {
            type: "external-service" | "embedded";
            service_endpoint?: string | undefined;
            marketplace_url?: string | undefined;
        };
        compatibility: {
            apps: string[];
            min_app_version: string;
        };
        provides: {
            scopes_required: string[];
            routes: {
                path: string;
                component_type: "web-component" | "iframe";
                service_endpoint: string;
            }[];
            mcp_tools: (string | {
                name: string;
                description?: string | undefined;
                input_schema?: {
                    [x: string]: import("hono/utils/types").JSONValue;
                } | undefined;
                output_schema?: {
                    [x: string]: import("hono/utils/types").JSONValue;
                } | undefined;
                scopes_required?: string[] | undefined;
            })[];
            module_extensions: {
                module: string;
                capability: string;
                hook_endpoints: {
                    [x: string]: string;
                };
            }[];
        };
        ui?: {
            sidebar_entry?: {
                icon: string;
                label_key: string;
                sort_order: number;
            } | undefined;
        } | undefined;
        vendor?: string | undefined;
        license?: string | undefined;
        homepage?: string | undefined;
    };
    capabilities_acknowledged: string[];
    health: string;
    host_record_status: {
        schema_version: number;
        plugin_current_schema: number;
        is_first_register: boolean;
        reregister_recommended: boolean;
        missing_optional_fields: string[];
        reregister_loop_detected?: boolean | undefined;
    };
}, import("hono/utils/http-status").ContentfulStatusCode, "json">)>;
//# sourceMappingURL=handshake.d.ts.map