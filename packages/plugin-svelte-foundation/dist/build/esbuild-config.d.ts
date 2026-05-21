export interface PluginBundleOptions {
    /** Plugin-Component-Tag-Name, z.B. 'plugin-myplugin-foo'. Steht im html-output. */
    componentTag: string;
    /** Source-Entry, z.B. 'src/ui/foo.svelte' compiled. */
    entry: string;
    /** Output-Dir für bundles + chunks. */
    outdir: string;
    /** Optional: external packages mit explicit browser-import-map oder
        defensive consumer-gates. Default leer (siehe Drift #20+#21). */
    external?: string[];
}
/**
 * esbuild-config-template für Plugin-Component-Bundle. Plugin-Provider
 * nimmt das als Starting-Point + erweitert um eigene plugins/loaders.
 *
 * Defaults:
 *   - format: 'esm'
 *   - splitting: true (lazy-imports → eigene chunks)
 *   - bundle: true
 *   - minify: true
 *   - target: 'es2022'
 *   - platform: 'browser'
 *   - external: [] (siehe Drift #20+#21)
 *   - alias: node-builtins → '@nexus/plugin-svelte-foundation/build/node-stubs'
 *     (Drift #13 — node-builtins als empty-module gestubt)
 */
export declare function pluginBundleConfig(opts: PluginBundleOptions): {
    entryPoints: string[];
    outdir: string;
    format: 'esm';
    bundle: true;
    splitting: true;
    minify: true;
    target: string;
    platform: 'browser';
    external: string[];
    metafile: true;
    define: Record<string, string>;
};
/**
 * esbuild-Plugin der Node-Builtins zu empty-module stub'd.
 * Plugin-Provider hängt das in seine plugins-Liste:
 *
 *   esbuild.build({ ...pluginBundleConfig(...), plugins: [nodeBuiltinsStubPlugin()] })
 */
export declare const NODE_BUILTINS: readonly ["fs", "path", "os", "crypto", "stream", "util", "net", "http", "https", "url", "querystring", "child_process", "cluster", "dgram", "dns", "events", "tls", "tty", "vm", "zlib"];
/**
 * Returnt esbuild-Plugin als plain object (vermeidet hart Dependency
 * auf esbuild-package — Plugin-Provider importiert esbuild selber).
 *
 * Usage:
 *   import esbuild from 'esbuild'
 *   import { nodeBuiltinsStubPlugin } from '@nexus/plugin-svelte-foundation/build'
 *   esbuild.build({ ..., plugins: [nodeBuiltinsStubPlugin()] })
 */
export declare function nodeBuiltinsStubPlugin(): {
    name: string;
    setup: (build: {
        onResolve: (filter: {
            filter: RegExp;
        }, callback: (args: {
            path: string;
        }) => {
            path: string;
            namespace: string;
        }) => void;
        onLoad: (filter: {
            filter: RegExp;
            namespace: string;
        }, callback: () => {
            contents: string;
            loader: 'js';
        }) => void;
    }) => void;
};
//# sourceMappingURL=esbuild-config.d.ts.map