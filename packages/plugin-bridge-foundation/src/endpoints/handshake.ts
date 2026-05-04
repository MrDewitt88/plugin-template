// POST /plugin-bridge/v1/handshake — initial Activation-Roundtrip.
// Host minted bridge-token + posted handshake. Plugin returnt manifest +
// capabilities-acknowledgement + initial health-status.

import type { Context } from 'hono'
import { HandshakeRequestSchema, type PluginManifest } from '../types.js'

export function handshakeHandler(manifest: PluginManifest) {
  return async (c: Context) => {
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: { code: 'invalid_request', message: 'malformed JSON' } }, 400)
    }

    const parsed = HandshakeRequestSchema.safeParse(body)
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: 'invalid_request',
            message: parsed.error.issues
              .map((i) => `${i.path.join('.')}: ${i.message}`)
              .join('; '),
          },
        },
        400,
      )
    }

    const req = parsed.data

    // Plugin-id-mismatch zwischen request und manifest → reject
    if (req.plugin_id !== manifest.id) {
      return c.json(
        {
          error: {
            code: 'plugin_id_mismatch',
            message: `request plugin_id='${req.plugin_id}' != manifest.id='${manifest.id}'`,
          },
        },
        400,
      )
    }

    return c.json({
      plugin_id: manifest.id,
      version: manifest.version,
      manifest,
      capabilities_acknowledged: ['routes', 'mcp_tools', 'module_extensions'],
      health: 'ok',
    })
  }
}
