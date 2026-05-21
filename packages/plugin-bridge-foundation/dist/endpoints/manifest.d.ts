import type { Context } from 'hono';
import type { PluginManifest } from '../types.js';
export declare function manifestHandler(manifest: PluginManifest): (c: Context) => Promise<Response & import("hono").TypedResponse<{
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
}, import("hono/utils/http-status").ContentfulStatusCode, "json">>;
//# sourceMappingURL=manifest.d.ts.map