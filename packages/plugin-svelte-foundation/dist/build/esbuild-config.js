// esbuild-Konfig-Helper für Plugin-Component-Bundles.
//
// Drift #20+#21 Lessons baked-in: KEINE bare-specifier dynamic-imports
// in browser-bundles. external-list MUSS leer sein für packages mit
// dynamic imports (Shiki, Mermaid, etc.) — splitting:true macht jedes
// dynamic-imported sub-modules zu eigenen chunks.
//
// Drift #13 Lesson: Node-Builtins (fs/path/os/crypto/...) müssen
// gestubt werden zu `module.exports = {}` — NICHT externalized,
// sonst emit'd esbuild bare `require()`-calls die im Browser werfen.
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
export function pluginBundleConfig(opts) {
    return {
        entryPoints: [opts.entry],
        outdir: opts.outdir,
        format: 'esm',
        bundle: true,
        splitting: true,
        minify: true,
        target: 'es2022',
        platform: 'browser',
        external: opts.external ?? [],
        metafile: true,
        define: {
            'process.env.NODE_ENV': '"production"',
        },
    };
}
/**
 * esbuild-Plugin der Node-Builtins zu empty-module stub'd.
 * Plugin-Provider hängt das in seine plugins-Liste:
 *
 *   esbuild.build({ ...pluginBundleConfig(...), plugins: [nodeBuiltinsStubPlugin()] })
 */
export const NODE_BUILTINS = [
    'fs',
    'path',
    'os',
    'crypto',
    'stream',
    'util',
    'net',
    'http',
    'https',
    'url',
    'querystring',
    'child_process',
    'cluster',
    'dgram',
    'dns',
    'events',
    'tls',
    'tty',
    'vm',
    'zlib',
];
/**
 * Returnt esbuild-Plugin als plain object (vermeidet hart Dependency
 * auf esbuild-package — Plugin-Provider importiert esbuild selber).
 *
 * Usage:
 *   import esbuild from 'esbuild'
 *   import { nodeBuiltinsStubPlugin } from '@nexus/plugin-svelte-foundation/build'
 *   esbuild.build({ ..., plugins: [nodeBuiltinsStubPlugin()] })
 */
export function nodeBuiltinsStubPlugin() {
    const builtinsPattern = new RegExp(`^(node:)?(${NODE_BUILTINS.join('|')})$`);
    return {
        name: 'nexus-node-builtins-stub',
        setup(build) {
            build.onResolve({ filter: builtinsPattern }, (args) => ({
                path: args.path,
                namespace: 'node-stub',
            }));
            build.onLoad({ filter: /.*/, namespace: 'node-stub' }, () => ({
                contents: 'module.exports = {};',
                loader: 'js',
            }));
        },
    };
}
//# sourceMappingURL=esbuild-config.js.map