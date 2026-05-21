// Simple template-rendering: replace {{placeholder}} mit values.
// Pure-function, testbar.
export function buildContext(opts) {
    const camel = opts.pluginName.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const pascal = camel.charAt(0).toUpperCase() + camel.slice(1);
    // Prefix: erste Buchstaben jedes segments (my-plugin → mp, kanban → k, ...)
    const prefix = opts.pluginName
        .split('-')
        .map((s) => s.charAt(0))
        .join('');
    return {
        pluginName: opts.pluginName,
        pluginNameCamel: camel,
        pluginNamePascal: pascal,
        pluginPrefix: prefix,
        hosts: opts.hosts,
        features: opts.features,
        year: String(new Date().getFullYear()),
    };
}
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
export function render(template, ctx) {
    let result = template;
    // Conditional sections — process erst (sonst confusion mit value-replacements)
    for (const feature of ['bridge', 'storage', 'svelte', 'mcp']) {
        const has = ctx.features.includes(feature);
        const re = new RegExp(`\\{\\{#if features\\.${feature}\\}\\}([\\s\\S]*?)\\{\\{/if\\}\\}`, 'g');
        result = result.replace(re, has ? '$1' : '');
    }
    // Simple value replacements
    result = result
        .replace(/\{\{pluginName\}\}/g, ctx.pluginName)
        .replace(/\{\{pluginNameCamel\}\}/g, ctx.pluginNameCamel)
        .replace(/\{\{pluginNamePascal\}\}/g, ctx.pluginNamePascal)
        .replace(/\{\{pluginPrefix\}\}/g, ctx.pluginPrefix)
        .replace(/\{\{hosts\}\}/g, ctx.hosts.join(', '))
        .replace(/\{\{features\}\}/g, ctx.features.join(', '))
        .replace(/\{\{year\}\}/g, ctx.year);
    return result;
}
//# sourceMappingURL=render.js.map