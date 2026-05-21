export interface TemplateContext {
    pluginName: string;
    pluginNameCamel: string;
    pluginNamePascal: string;
    pluginPrefix: string;
    hosts: string[];
    features: string[];
    year: string;
}
export declare function buildContext(opts: {
    pluginName: string;
    hosts: string[];
    features: string[];
}): TemplateContext;
/**
 * Render template string mit context. Replaces:
 *   {{pluginName}}, {{pluginNameCamel}}, {{pluginNamePascal}}, {{pluginPrefix}}
 *   {{year}}
 *   {{hosts}} → comma-separated list
 *   {{features}} → comma-separated list
 *
 * Plus conditional sections:
 *   {{#if features.storage}}...{{/if}}
 *   {{#if features.svelte}}...{{/if}}
 *   {{#if features.mcp}}...{{/if}}
 *
 * (Simple, kein full mustache — Foundation-Templates haben minimal
 * conditional-needs.)
 */
export declare function render(template: string, ctx: TemplateContext): string;
//# sourceMappingURL=render.d.ts.map