import { z } from 'zod';
export declare const PluginI18nStringSchema: z.ZodObject<{
    de: z.ZodOptional<z.ZodString>;
    en: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    de?: string | undefined;
    en?: string | undefined;
}, {
    de?: string | undefined;
    en?: string | undefined;
}>;
export type PluginI18nString = z.infer<typeof PluginI18nStringSchema>;
export declare const PluginRouteSchema: z.ZodObject<{
    path: z.ZodString;
    component_type: z.ZodEnum<["web-component", "iframe"]>;
    service_endpoint: z.ZodString;
}, "strip", z.ZodTypeAny, {
    path: string;
    component_type: "web-component" | "iframe";
    service_endpoint: string;
}, {
    path: string;
    component_type: "web-component" | "iframe";
    service_endpoint: string;
}>;
export type PluginRoute = z.infer<typeof PluginRouteSchema>;
export declare const PluginMcpToolEntrySchema: z.ZodUnion<[z.ZodString, z.ZodObject<{
    name: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    input_schema: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    output_schema: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    scopes_required: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    name: string;
    description?: string | undefined;
    input_schema?: Record<string, unknown> | undefined;
    output_schema?: Record<string, unknown> | undefined;
    scopes_required?: string[] | undefined;
}, {
    name: string;
    description?: string | undefined;
    input_schema?: Record<string, unknown> | undefined;
    output_schema?: Record<string, unknown> | undefined;
    scopes_required?: string[] | undefined;
}>]>;
export type PluginMcpToolEntry = z.infer<typeof PluginMcpToolEntrySchema>;
export declare const PluginModuleExtensionSchema: z.ZodObject<{
    module: z.ZodString;
    capability: z.ZodString;
    hook_endpoints: z.ZodRecord<z.ZodString, z.ZodString>;
}, "strip", z.ZodTypeAny, {
    module: string;
    capability: string;
    hook_endpoints: Record<string, string>;
}, {
    module: string;
    capability: string;
    hook_endpoints: Record<string, string>;
}>;
export type PluginModuleExtension = z.infer<typeof PluginModuleExtensionSchema>;
export declare const PluginManifestSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodObject<{
        de: z.ZodOptional<z.ZodString>;
        en: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        de?: string | undefined;
        en?: string | undefined;
    }, {
        de?: string | undefined;
        en?: string | undefined;
    }>;
    description: z.ZodObject<{
        de: z.ZodOptional<z.ZodString>;
        en: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        de?: string | undefined;
        en?: string | undefined;
    }, {
        de?: string | undefined;
        en?: string | undefined;
    }>;
    version: z.ZodString;
    distribution: z.ZodObject<{
        type: z.ZodEnum<["external-service", "embedded"]>;
        service_endpoint: z.ZodOptional<z.ZodString>;
        marketplace_url: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        type: "external-service" | "embedded";
        service_endpoint?: string | undefined;
        marketplace_url?: string | undefined;
    }, {
        type: "external-service" | "embedded";
        service_endpoint?: string | undefined;
        marketplace_url?: string | undefined;
    }>;
    compatibility: z.ZodObject<{
        apps: z.ZodArray<z.ZodString, "many">;
        min_app_version: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        apps: string[];
        min_app_version: string;
    }, {
        apps: string[];
        min_app_version: string;
    }>;
    provides: z.ZodObject<{
        routes: z.ZodDefault<z.ZodArray<z.ZodObject<{
            path: z.ZodString;
            component_type: z.ZodEnum<["web-component", "iframe"]>;
            service_endpoint: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            path: string;
            component_type: "web-component" | "iframe";
            service_endpoint: string;
        }, {
            path: string;
            component_type: "web-component" | "iframe";
            service_endpoint: string;
        }>, "many">>;
        mcp_tools: z.ZodDefault<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodObject<{
            name: z.ZodString;
            description: z.ZodOptional<z.ZodString>;
            input_schema: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
            output_schema: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
            scopes_required: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, "strip", z.ZodTypeAny, {
            name: string;
            description?: string | undefined;
            input_schema?: Record<string, unknown> | undefined;
            output_schema?: Record<string, unknown> | undefined;
            scopes_required?: string[] | undefined;
        }, {
            name: string;
            description?: string | undefined;
            input_schema?: Record<string, unknown> | undefined;
            output_schema?: Record<string, unknown> | undefined;
            scopes_required?: string[] | undefined;
        }>]>, "many">>;
        module_extensions: z.ZodDefault<z.ZodArray<z.ZodObject<{
            module: z.ZodString;
            capability: z.ZodString;
            hook_endpoints: z.ZodRecord<z.ZodString, z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            module: string;
            capability: string;
            hook_endpoints: Record<string, string>;
        }, {
            module: string;
            capability: string;
            hook_endpoints: Record<string, string>;
        }>, "many">>;
        scopes_required: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        scopes_required: string[];
        routes: {
            path: string;
            component_type: "web-component" | "iframe";
            service_endpoint: string;
        }[];
        mcp_tools: (string | {
            name: string;
            description?: string | undefined;
            input_schema?: Record<string, unknown> | undefined;
            output_schema?: Record<string, unknown> | undefined;
            scopes_required?: string[] | undefined;
        })[];
        module_extensions: {
            module: string;
            capability: string;
            hook_endpoints: Record<string, string>;
        }[];
    }, {
        scopes_required?: string[] | undefined;
        routes?: {
            path: string;
            component_type: "web-component" | "iframe";
            service_endpoint: string;
        }[] | undefined;
        mcp_tools?: (string | {
            name: string;
            description?: string | undefined;
            input_schema?: Record<string, unknown> | undefined;
            output_schema?: Record<string, unknown> | undefined;
            scopes_required?: string[] | undefined;
        })[] | undefined;
        module_extensions?: {
            module: string;
            capability: string;
            hook_endpoints: Record<string, string>;
        }[] | undefined;
    }>;
    ui: z.ZodOptional<z.ZodObject<{
        sidebar_entry: z.ZodOptional<z.ZodObject<{
            icon: z.ZodString;
            label_key: z.ZodString;
            sort_order: z.ZodDefault<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            icon: string;
            label_key: string;
            sort_order: number;
        }, {
            icon: string;
            label_key: string;
            sort_order?: number | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        sidebar_entry?: {
            icon: string;
            label_key: string;
            sort_order: number;
        } | undefined;
    }, {
        sidebar_entry?: {
            icon: string;
            label_key: string;
            sort_order?: number | undefined;
        } | undefined;
    }>>;
    vendor: z.ZodOptional<z.ZodString>;
    license: z.ZodOptional<z.ZodString>;
    homepage: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
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
            input_schema?: Record<string, unknown> | undefined;
            output_schema?: Record<string, unknown> | undefined;
            scopes_required?: string[] | undefined;
        })[];
        module_extensions: {
            module: string;
            capability: string;
            hook_endpoints: Record<string, string>;
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
}, {
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
        scopes_required?: string[] | undefined;
        routes?: {
            path: string;
            component_type: "web-component" | "iframe";
            service_endpoint: string;
        }[] | undefined;
        mcp_tools?: (string | {
            name: string;
            description?: string | undefined;
            input_schema?: Record<string, unknown> | undefined;
            output_schema?: Record<string, unknown> | undefined;
            scopes_required?: string[] | undefined;
        })[] | undefined;
        module_extensions?: {
            module: string;
            capability: string;
            hook_endpoints: Record<string, string>;
        }[] | undefined;
    };
    ui?: {
        sidebar_entry?: {
            icon: string;
            label_key: string;
            sort_order?: number | undefined;
        } | undefined;
    } | undefined;
    vendor?: string | undefined;
    license?: string | undefined;
    homepage?: string | undefined;
}>;
export type PluginManifest = z.infer<typeof PluginManifestSchema>;
export interface BridgeTokenClaims {
    iss: string;
    sub: string;
    jti: string;
    iat: number;
    exp: number;
    plugin_id: string;
    host_id: string;
    tenant_id: string;
    user_id: string;
    scopes: string[];
}
export type HostKeyStatus = 'pending' | 'active' | 'rejected';
export interface HostKeyRecord {
    host_id: string;
    public_key_pem: string;
    status: HostKeyStatus;
    fingerprint: string;
    registered_at: string;
    approved_at: string | null;
}
export declare const PLUGIN_REGISTRATION_SCHEMA_VERSION: 1;
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
export declare const BASELINE_OPTIONAL_REGISTER_FIELDS: readonly ["host_version", "relay_url"];
export declare const HostRecordStatusSchema: z.ZodObject<{
    schema_version: z.ZodNumber;
    plugin_current_schema: z.ZodNumber;
    is_first_register: z.ZodBoolean;
    reregister_recommended: z.ZodBoolean;
    missing_optional_fields: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    reregister_loop_detected: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    schema_version: number;
    plugin_current_schema: number;
    is_first_register: boolean;
    reregister_recommended: boolean;
    missing_optional_fields: string[];
    reregister_loop_detected?: boolean | undefined;
}, {
    schema_version: number;
    plugin_current_schema: number;
    is_first_register: boolean;
    reregister_recommended: boolean;
    missing_optional_fields?: string[] | undefined;
    reregister_loop_detected?: boolean | undefined;
}>;
export type HostRecordStatus = z.infer<typeof HostRecordStatusSchema>;
export declare const HandshakeRequestSchema: z.ZodObject<{
    plugin_id: z.ZodString;
    host_id: z.ZodString;
    host_version: z.ZodString;
    tenant_id: z.ZodString;
    user_id: z.ZodString;
}, "strip", z.ZodTypeAny, {
    host_version: string;
    plugin_id: string;
    host_id: string;
    tenant_id: string;
    user_id: string;
}, {
    host_version: string;
    plugin_id: string;
    host_id: string;
    tenant_id: string;
    user_id: string;
}>;
export type HandshakeRequest = z.infer<typeof HandshakeRequestSchema>;
export declare const HandshakeResponseSchema: z.ZodObject<{
    plugin_id: z.ZodString;
    version: z.ZodString;
    manifest: z.ZodObject<{
        id: z.ZodString;
        name: z.ZodObject<{
            de: z.ZodOptional<z.ZodString>;
            en: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            de?: string | undefined;
            en?: string | undefined;
        }, {
            de?: string | undefined;
            en?: string | undefined;
        }>;
        description: z.ZodObject<{
            de: z.ZodOptional<z.ZodString>;
            en: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            de?: string | undefined;
            en?: string | undefined;
        }, {
            de?: string | undefined;
            en?: string | undefined;
        }>;
        version: z.ZodString;
        distribution: z.ZodObject<{
            type: z.ZodEnum<["external-service", "embedded"]>;
            service_endpoint: z.ZodOptional<z.ZodString>;
            marketplace_url: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            type: "external-service" | "embedded";
            service_endpoint?: string | undefined;
            marketplace_url?: string | undefined;
        }, {
            type: "external-service" | "embedded";
            service_endpoint?: string | undefined;
            marketplace_url?: string | undefined;
        }>;
        compatibility: z.ZodObject<{
            apps: z.ZodArray<z.ZodString, "many">;
            min_app_version: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            apps: string[];
            min_app_version: string;
        }, {
            apps: string[];
            min_app_version: string;
        }>;
        provides: z.ZodObject<{
            routes: z.ZodDefault<z.ZodArray<z.ZodObject<{
                path: z.ZodString;
                component_type: z.ZodEnum<["web-component", "iframe"]>;
                service_endpoint: z.ZodString;
            }, "strip", z.ZodTypeAny, {
                path: string;
                component_type: "web-component" | "iframe";
                service_endpoint: string;
            }, {
                path: string;
                component_type: "web-component" | "iframe";
                service_endpoint: string;
            }>, "many">>;
            mcp_tools: z.ZodDefault<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodObject<{
                name: z.ZodString;
                description: z.ZodOptional<z.ZodString>;
                input_schema: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
                output_schema: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
                scopes_required: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            }, "strip", z.ZodTypeAny, {
                name: string;
                description?: string | undefined;
                input_schema?: Record<string, unknown> | undefined;
                output_schema?: Record<string, unknown> | undefined;
                scopes_required?: string[] | undefined;
            }, {
                name: string;
                description?: string | undefined;
                input_schema?: Record<string, unknown> | undefined;
                output_schema?: Record<string, unknown> | undefined;
                scopes_required?: string[] | undefined;
            }>]>, "many">>;
            module_extensions: z.ZodDefault<z.ZodArray<z.ZodObject<{
                module: z.ZodString;
                capability: z.ZodString;
                hook_endpoints: z.ZodRecord<z.ZodString, z.ZodString>;
            }, "strip", z.ZodTypeAny, {
                module: string;
                capability: string;
                hook_endpoints: Record<string, string>;
            }, {
                module: string;
                capability: string;
                hook_endpoints: Record<string, string>;
            }>, "many">>;
            scopes_required: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        }, "strip", z.ZodTypeAny, {
            scopes_required: string[];
            routes: {
                path: string;
                component_type: "web-component" | "iframe";
                service_endpoint: string;
            }[];
            mcp_tools: (string | {
                name: string;
                description?: string | undefined;
                input_schema?: Record<string, unknown> | undefined;
                output_schema?: Record<string, unknown> | undefined;
                scopes_required?: string[] | undefined;
            })[];
            module_extensions: {
                module: string;
                capability: string;
                hook_endpoints: Record<string, string>;
            }[];
        }, {
            scopes_required?: string[] | undefined;
            routes?: {
                path: string;
                component_type: "web-component" | "iframe";
                service_endpoint: string;
            }[] | undefined;
            mcp_tools?: (string | {
                name: string;
                description?: string | undefined;
                input_schema?: Record<string, unknown> | undefined;
                output_schema?: Record<string, unknown> | undefined;
                scopes_required?: string[] | undefined;
            })[] | undefined;
            module_extensions?: {
                module: string;
                capability: string;
                hook_endpoints: Record<string, string>;
            }[] | undefined;
        }>;
        ui: z.ZodOptional<z.ZodObject<{
            sidebar_entry: z.ZodOptional<z.ZodObject<{
                icon: z.ZodString;
                label_key: z.ZodString;
                sort_order: z.ZodDefault<z.ZodNumber>;
            }, "strip", z.ZodTypeAny, {
                icon: string;
                label_key: string;
                sort_order: number;
            }, {
                icon: string;
                label_key: string;
                sort_order?: number | undefined;
            }>>;
        }, "strip", z.ZodTypeAny, {
            sidebar_entry?: {
                icon: string;
                label_key: string;
                sort_order: number;
            } | undefined;
        }, {
            sidebar_entry?: {
                icon: string;
                label_key: string;
                sort_order?: number | undefined;
            } | undefined;
        }>>;
        vendor: z.ZodOptional<z.ZodString>;
        license: z.ZodOptional<z.ZodString>;
        homepage: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
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
                input_schema?: Record<string, unknown> | undefined;
                output_schema?: Record<string, unknown> | undefined;
                scopes_required?: string[] | undefined;
            })[];
            module_extensions: {
                module: string;
                capability: string;
                hook_endpoints: Record<string, string>;
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
    }, {
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
            scopes_required?: string[] | undefined;
            routes?: {
                path: string;
                component_type: "web-component" | "iframe";
                service_endpoint: string;
            }[] | undefined;
            mcp_tools?: (string | {
                name: string;
                description?: string | undefined;
                input_schema?: Record<string, unknown> | undefined;
                output_schema?: Record<string, unknown> | undefined;
                scopes_required?: string[] | undefined;
            })[] | undefined;
            module_extensions?: {
                module: string;
                capability: string;
                hook_endpoints: Record<string, string>;
            }[] | undefined;
        };
        ui?: {
            sidebar_entry?: {
                icon: string;
                label_key: string;
                sort_order?: number | undefined;
            } | undefined;
        } | undefined;
        vendor?: string | undefined;
        license?: string | undefined;
        homepage?: string | undefined;
    }>;
    capabilities_acknowledged: z.ZodArray<z.ZodEnum<["routes", "mcp_tools", "module_extensions"]>, "many">;
    health: z.ZodEnum<["ok", "degraded", "unhealthy"]>;
    host_record_status: z.ZodObject<{
        schema_version: z.ZodNumber;
        plugin_current_schema: z.ZodNumber;
        is_first_register: z.ZodBoolean;
        reregister_recommended: z.ZodBoolean;
        missing_optional_fields: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        reregister_loop_detected: z.ZodOptional<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        schema_version: number;
        plugin_current_schema: number;
        is_first_register: boolean;
        reregister_recommended: boolean;
        missing_optional_fields: string[];
        reregister_loop_detected?: boolean | undefined;
    }, {
        schema_version: number;
        plugin_current_schema: number;
        is_first_register: boolean;
        reregister_recommended: boolean;
        missing_optional_fields?: string[] | undefined;
        reregister_loop_detected?: boolean | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    version: string;
    plugin_id: string;
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
                input_schema?: Record<string, unknown> | undefined;
                output_schema?: Record<string, unknown> | undefined;
                scopes_required?: string[] | undefined;
            })[];
            module_extensions: {
                module: string;
                capability: string;
                hook_endpoints: Record<string, string>;
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
    capabilities_acknowledged: ("routes" | "mcp_tools" | "module_extensions")[];
    health: "ok" | "degraded" | "unhealthy";
    host_record_status: {
        schema_version: number;
        plugin_current_schema: number;
        is_first_register: boolean;
        reregister_recommended: boolean;
        missing_optional_fields: string[];
        reregister_loop_detected?: boolean | undefined;
    };
}, {
    version: string;
    plugin_id: string;
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
            scopes_required?: string[] | undefined;
            routes?: {
                path: string;
                component_type: "web-component" | "iframe";
                service_endpoint: string;
            }[] | undefined;
            mcp_tools?: (string | {
                name: string;
                description?: string | undefined;
                input_schema?: Record<string, unknown> | undefined;
                output_schema?: Record<string, unknown> | undefined;
                scopes_required?: string[] | undefined;
            })[] | undefined;
            module_extensions?: {
                module: string;
                capability: string;
                hook_endpoints: Record<string, string>;
            }[] | undefined;
        };
        ui?: {
            sidebar_entry?: {
                icon: string;
                label_key: string;
                sort_order?: number | undefined;
            } | undefined;
        } | undefined;
        vendor?: string | undefined;
        license?: string | undefined;
        homepage?: string | undefined;
    };
    capabilities_acknowledged: ("routes" | "mcp_tools" | "module_extensions")[];
    health: "ok" | "degraded" | "unhealthy";
    host_record_status: {
        schema_version: number;
        plugin_current_schema: number;
        is_first_register: boolean;
        reregister_recommended: boolean;
        missing_optional_fields?: string[] | undefined;
        reregister_loop_detected?: boolean | undefined;
    };
}>;
export type HandshakeResponse = z.infer<typeof HandshakeResponseSchema>;
export declare const RegisterHostRequestSchema: z.ZodEffects<z.ZodObject<{
    host_id: z.ZodString;
    public_key_pem: z.ZodOptional<z.ZodString>;
    public_key: z.ZodOptional<z.ZodString>;
    host_version: z.ZodOptional<z.ZodString>;
    relay_url: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    host_id: string;
    host_version?: string | undefined;
    relay_url?: string | undefined;
    public_key_pem?: string | undefined;
    public_key?: string | undefined;
}, {
    host_id: string;
    host_version?: string | undefined;
    relay_url?: string | undefined;
    public_key_pem?: string | undefined;
    public_key?: string | undefined;
}>, {
    host_id: string;
    host_version?: string | undefined;
    relay_url?: string | undefined;
    public_key_pem?: string | undefined;
    public_key?: string | undefined;
}, {
    host_id: string;
    host_version?: string | undefined;
    relay_url?: string | undefined;
    public_key_pem?: string | undefined;
    public_key?: string | undefined;
}>;
export type RegisterHostRequest = z.infer<typeof RegisterHostRequestSchema>;
/**
 * Drift-resolution helper: prefer `public_key_pem` (canonical-target), fall back to
 * `public_key` (legacy Theseus/MarkView/V8). Returns the PEM string. Throws if both
 * missing (should never happen — schema enforces via .refine).
 */
export declare function extractPublicKeyPem(req: RegisterHostRequest): string;
export declare const RegisterHostResponseSchema: z.ZodObject<{
    host_id: z.ZodString;
    status: z.ZodEnum<["pending", "active", "rejected"]>;
    fingerprint: z.ZodString;
    registered_at: z.ZodString;
    host_record_status: z.ZodObject<{
        schema_version: z.ZodNumber;
        plugin_current_schema: z.ZodNumber;
        is_first_register: z.ZodBoolean;
        reregister_recommended: z.ZodBoolean;
        missing_optional_fields: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        reregister_loop_detected: z.ZodOptional<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        schema_version: number;
        plugin_current_schema: number;
        is_first_register: boolean;
        reregister_recommended: boolean;
        missing_optional_fields: string[];
        reregister_loop_detected?: boolean | undefined;
    }, {
        schema_version: number;
        plugin_current_schema: number;
        is_first_register: boolean;
        reregister_recommended: boolean;
        missing_optional_fields?: string[] | undefined;
        reregister_loop_detected?: boolean | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    status: "pending" | "active" | "rejected";
    host_id: string;
    host_record_status: {
        schema_version: number;
        plugin_current_schema: number;
        is_first_register: boolean;
        reregister_recommended: boolean;
        missing_optional_fields: string[];
        reregister_loop_detected?: boolean | undefined;
    };
    fingerprint: string;
    registered_at: string;
}, {
    status: "pending" | "active" | "rejected";
    host_id: string;
    host_record_status: {
        schema_version: number;
        plugin_current_schema: number;
        is_first_register: boolean;
        reregister_recommended: boolean;
        missing_optional_fields?: string[] | undefined;
        reregister_loop_detected?: boolean | undefined;
    };
    fingerprint: string;
    registered_at: string;
}>;
export type RegisterHostResponse = z.infer<typeof RegisterHostResponseSchema>;
export declare const HealthResponseSchema: z.ZodObject<{
    status: z.ZodEnum<["ok", "degraded", "unhealthy"]>;
    version: z.ZodString;
    last_active: z.ZodOptional<z.ZodString>;
    manifest_hash: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    status: "ok" | "degraded" | "unhealthy";
    version: string;
    last_active?: string | undefined;
    manifest_hash?: string | undefined;
}, {
    status: "ok" | "degraded" | "unhealthy";
    version: string;
    last_active?: string | undefined;
    manifest_hash?: string | undefined;
}>;
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
export declare const ExecuteToolRequestSchema: z.ZodObject<{
    tool_name: z.ZodString;
    arguments: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    actor_class: z.ZodOptional<z.ZodNullable<z.ZodEnum<["user", "kiara"]>>>;
    tenant_id: z.ZodString;
    user_id: z.ZodString;
}, "strip", z.ZodTypeAny, {
    tenant_id: string;
    user_id: string;
    tool_name: string;
    arguments: Record<string, unknown>;
    actor_class?: "user" | "kiara" | null | undefined;
}, {
    tenant_id: string;
    user_id: string;
    tool_name: string;
    arguments?: Record<string, unknown> | undefined;
    actor_class?: "user" | "kiara" | null | undefined;
}>;
export type ExecuteToolRequest = z.infer<typeof ExecuteToolRequestSchema>;
export declare const ExecuteToolResponseSchema: z.ZodDiscriminatedUnion<"ok", [z.ZodObject<{
    ok: z.ZodLiteral<true>;
    result: z.ZodUnknown;
}, "strip", z.ZodTypeAny, {
    ok: true;
    result?: unknown;
}, {
    ok: true;
    result?: unknown;
}>, z.ZodObject<{
    ok: z.ZodLiteral<false>;
    error: z.ZodObject<{
        code: z.ZodString;
        message: z.ZodString;
        details: z.ZodOptional<z.ZodUnknown>;
    }, "strip", z.ZodTypeAny, {
        code: string;
        message: string;
        details?: unknown;
    }, {
        code: string;
        message: string;
        details?: unknown;
    }>;
}, "strip", z.ZodTypeAny, {
    ok: false;
    error: {
        code: string;
        message: string;
        details?: unknown;
    };
}, {
    ok: false;
    error: {
        code: string;
        message: string;
        details?: unknown;
    };
}>]>;
export type ExecuteToolResponse = z.infer<typeof ExecuteToolResponseSchema>;
export declare const RenderUiRequestSchema: z.ZodObject<{
    route_path: z.ZodString;
    tenant_id: z.ZodString;
    user_id: z.ZodString;
    context: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    tenant_id: string;
    user_id: string;
    route_path: string;
    context: Record<string, unknown>;
}, {
    tenant_id: string;
    user_id: string;
    route_path: string;
    context?: Record<string, unknown> | undefined;
}>;
export type RenderUiRequest = z.infer<typeof RenderUiRequestSchema>;
export declare const RenderUiResponseSchema: z.ZodObject<{
    html: z.ZodString;
    scripts: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    styles: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    html: string;
    scripts: string[];
    styles: string[];
}, {
    html: string;
    scripts?: string[] | undefined;
    styles?: string[] | undefined;
}>;
export type RenderUiResponse = z.infer<typeof RenderUiResponseSchema>;
export declare const InvokeHookRequestSchema: z.ZodObject<{
    module: z.ZodString;
    capability: z.ZodString;
    hook_name: z.ZodString;
    payload: z.ZodUnknown;
    tenant_id: z.ZodString;
    user_id: z.ZodString;
}, "strip", z.ZodTypeAny, {
    module: string;
    capability: string;
    tenant_id: string;
    user_id: string;
    hook_name: string;
    payload?: unknown;
}, {
    module: string;
    capability: string;
    tenant_id: string;
    user_id: string;
    hook_name: string;
    payload?: unknown;
}>;
export type InvokeHookRequest = z.infer<typeof InvokeHookRequestSchema>;
export declare const InvokeHookResponseSchema: z.ZodDiscriminatedUnion<"ok", [z.ZodObject<{
    ok: z.ZodLiteral<true>;
    result: z.ZodUnknown;
}, "strip", z.ZodTypeAny, {
    ok: true;
    result?: unknown;
}, {
    ok: true;
    result?: unknown;
}>, z.ZodObject<{
    ok: z.ZodLiteral<false>;
    error: z.ZodObject<{
        code: z.ZodString;
        message: z.ZodString;
        details: z.ZodOptional<z.ZodUnknown>;
    }, "strip", z.ZodTypeAny, {
        code: string;
        message: string;
        details?: unknown;
    }, {
        code: string;
        message: string;
        details?: unknown;
    }>;
}, "strip", z.ZodTypeAny, {
    ok: false;
    error: {
        code: string;
        message: string;
        details?: unknown;
    };
}, {
    ok: false;
    error: {
        code: string;
        message: string;
        details?: unknown;
    };
}>]>;
export type InvokeHookResponse = z.infer<typeof InvokeHookResponseSchema>;
export interface BridgeAuthContext {
    pluginId: string;
    hostId: string;
    tenantId: string;
    userId: string;
    scopes: string[];
    jti: string;
}
export type ToolHandler = (args: Record<string, unknown>, ctx: BridgeAuthContext & {
    actorClass: 'user' | 'kiara' | null;
}) => Promise<unknown>;
export type HookHandler = (payload: unknown, ctx: BridgeAuthContext & {
    module: string;
    capability: string;
    hookName: string;
}) => Promise<unknown>;
export type RenderUiHandler = (routePath: string, ctx: BridgeAuthContext & {
    context: Record<string, unknown>;
}) => Promise<RenderUiResponse>;
//# sourceMappingURL=types.d.ts.map