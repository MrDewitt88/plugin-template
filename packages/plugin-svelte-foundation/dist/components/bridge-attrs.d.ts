export declare const OBSERVED_BRIDGE_ATTRS: readonly ["bridge-token", "bridge-endpoint", "host-id", "tenant-id", "user-id", "user-locale", "actor-class", "theme"];
export type ObservedBridgeAttr = (typeof OBSERVED_BRIDGE_ATTRS)[number];
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
export declare function bridgeAttrPropsMapping(): Record<string, {
    attribute: string;
}>;
/**
 * BridgeAttrs reader für Components — extracts strongly-typed values
 * aus den HTML-attributes des Custom-Elements.
 */
export interface BridgeAttrs {
    bridgeToken: string;
    bridgeEndpoint: string;
    hostId: string;
    tenantId: string;
    userId: string;
    userLocale: string;
    actorClass: 'user' | 'kiara' | 'agent';
    theme: 'dark' | 'light' | 'auto';
}
/**
 * Validate + parse bridge-attrs aus dem Component-context. Returnt null
 * wenn Pflicht-Attrs fehlen — Component sollte dann error-state rendern
 * ("Bridge-Credentials wurden vom Host nicht gesetzt").
 */
export declare function readBridgeAttrs(getter: (name: string) => string | null): BridgeAttrs | null;
//# sourceMappingURL=bridge-attrs.d.ts.map