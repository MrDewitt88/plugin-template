// GET /plugin-bridge/v1/manifest — returns canonical manifest.
// Hosts re-fetchen das wenn `manifest_hash` aus /health drift'd hat
// (Live-Re-Registration trigger).
export function manifestHandler(manifest) {
    return async (c) => c.json({ manifest });
}
//# sourceMappingURL=manifest.js.map