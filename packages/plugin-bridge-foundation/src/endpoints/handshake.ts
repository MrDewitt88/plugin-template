// POST /plugin-bridge/v1/handshake — initial Activation-Roundtrip.
// Host minted bridge-token + posted handshake. Plugin returnt manifest +
// capabilities-acknowledgement + initial health-status + host_record_status
// (Drift #206 symmetric block).

import type { Context } from 'hono'
import { buildHostRecordStatus, type HostKeyRegistry } from '../auth/host-keys.js'
import { HandshakeRequestSchema, type PluginManifest } from '../types.js'

export function handshakeHandler(manifest: PluginManifest, registry: HostKeyRegistry) {
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
            message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
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

    // Drift #206: handshake-time-status — host hat schon registriert (sonst
    // hätte auth-Middleware vorher 401 geworfen), wir signalisieren ob
    // re-registration empfohlen ist basierend auf optional-fields-coverage.
    //
    // v0.7.2 (Drift #105 / cluster-ruling oracle #4520 + agent #4515): KEIN
    // Hardcode `['host_version']` mehr. Der alte Hardcode hat relay_url
    // strukturell immer als 'missing' gemeldet → reregister_recommended=true bei
    // JEDEM handshake → 119k-call-Loop auf Theseus. Wir tracken stattdessen die
    // tatsächlich bei register gelieferten Felder pro Host, vereinigt mit dem
    // host_version das der Host im handshake-request mitschickt (Pflichtfeld).
    const providedOptionalFields = Array.from(
      new Set([...registry.getProvidedOptionalFields(req.host_id), 'host_version']),
    )
    const missingFields = registry.optionalFields.filter((f) => !providedOptionalFields.includes(f))
    const loopDetected = registry.detectReregisterLoop(req.host_id, missingFields)

    return c.json({
      plugin_id: manifest.id,
      version: manifest.version,
      manifest,
      capabilities_acknowledged: ['routes', 'mcp_tools', 'module_extensions'],
      health: 'ok',
      host_record_status: buildHostRecordStatus({
        isFirstRegister: false,
        providedFields: providedOptionalFields,
        optionalFields: registry.optionalFields,
        loopDetected,
      }),
    })
  }
}
