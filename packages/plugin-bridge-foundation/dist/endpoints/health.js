// GET /plugin-bridge/v1/health — Liveness/Readiness-Probe.
// Hosts pollen das alle 5 Min für jede aktive Activation.
//
// `manifest_hash`-Field (Phase-3 Live-Re-Registration): Plugin signalisiert
// stable hash; Hosts cachen pro Activation; bei Diff trigger
// bridgeFetchManifest + reRegisterCapabilities.
export function healthHandler(opts) {
    return async (c) => {
        const status = opts.statusFn?.() ?? 'ok';
        const lastActive = opts.lastActiveFn?.();
        const body = {
            status,
            version: opts.pluginVersion,
            manifest_hash: opts.manifestHash,
        };
        if (lastActive)
            body.last_active = lastActive;
        return c.json(body);
    };
}
//# sourceMappingURL=health.js.map