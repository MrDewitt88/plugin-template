// OBSERVED_BRIDGE_ATTRS — die 7 Standard-Attrs die Plugin-Hosts auf
// Plugin-Custom-Elements setzen (siehe V8 PR 26 + Theseus L5/L7).
//
// Plus theme als 8. Cross-Repo-Convention (siehe MarkView 26aca39 +
// Theseus 8444360 + V8 cbc80ec).
export const OBSERVED_BRIDGE_ATTRS = [
    'bridge-token',
    'bridge-endpoint',
    'host-id',
    'tenant-id',
    'user-id',
    'user-locale',
    'actor-class',
    'theme',
];
/**
 * Helper für Svelte 5 customElement long-form props-Mapping.
 * Reference: Drift #7 (short-form `customElement="tag"` deriviert
 * observedAttributes als lowercase, NOT kebab-case).
 *
 * Usage in Plugin-Component:
 *   <svelte:options
 *     customElement={{
 *       tag: 'plugin-myplugin-foo',
 *       shadow: 'open',
 *       props: {
 *         ...bridgeAttrPropsMapping(),
 *         documentId: { attribute: 'document-id' },  // component-specific
 *       },
 *     }}
 *   />
 */
export function bridgeAttrPropsMapping() {
    return {
        bridgeToken: { attribute: 'bridge-token' },
        bridgeEndpoint: { attribute: 'bridge-endpoint' },
        hostId: { attribute: 'host-id' },
        tenantId: { attribute: 'tenant-id' },
        userId: { attribute: 'user-id' },
        userLocale: { attribute: 'user-locale' },
        actorClass: { attribute: 'actor-class' },
        theme: { attribute: 'theme' },
    };
}
/**
 * Validate + parse bridge-attrs aus dem Component-context. Returnt null
 * wenn Pflicht-Attrs fehlen — Component sollte dann error-state rendern
 * ("Bridge-Credentials wurden vom Host nicht gesetzt").
 */
export function readBridgeAttrs(getter) {
    const required = ['bridge-token', 'bridge-endpoint', 'host-id', 'tenant-id', 'user-id'];
    for (const attr of required) {
        const v = getter(attr);
        if (typeof v !== 'string' || v.length === 0)
            return null;
    }
    const actorClassRaw = getter('actor-class');
    const actorClass = actorClassRaw === 'kiara' || actorClassRaw === 'agent' ? actorClassRaw : 'user';
    const themeRaw = getter('theme');
    const theme = themeRaw === 'dark' || themeRaw === 'light' || themeRaw === 'auto' ? themeRaw : 'auto';
    return {
        bridgeToken: getter('bridge-token'),
        bridgeEndpoint: getter('bridge-endpoint'),
        hostId: getter('host-id'),
        tenantId: getter('tenant-id'),
        userId: getter('user-id'),
        userLocale: getter('user-locale') ?? 'en',
        actorClass,
        theme,
    };
}
//# sourceMappingURL=bridge-attrs.js.map