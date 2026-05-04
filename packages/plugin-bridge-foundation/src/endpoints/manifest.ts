// GET /plugin-bridge/v1/manifest — returns canonical manifest.
// Hosts re-fetchen das wenn `manifest_hash` aus /health drift'd hat
// (Live-Re-Registration trigger).

import type { Context } from 'hono'
import type { PluginManifest } from '../types.js'

export function manifestHandler(manifest: PluginManifest) {
  return async (c: Context) => c.json({ manifest })
}
