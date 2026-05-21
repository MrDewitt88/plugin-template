// POST /plugin-bridge/v1/handshake — initial Activation-Roundtrip.
// Host minted bridge-token + posted handshake. Plugin returnt manifest +
// capabilities-acknowledgement + initial health-status + host_record_status
// (Drift #206 symmetric block).
import { buildHostRecordStatus } from '../auth/host-keys.js';
import { HandshakeRequestSchema } from '../types.js';
export function handshakeHandler(manifest, registry) {
    return async (c) => {
        let body;
        try {
            body = await c.req.json();
        }
        catch {
            return c.json({ error: { code: 'invalid_request', message: 'malformed JSON' } }, 400);
        }
        const parsed = HandshakeRequestSchema.safeParse(body);
        if (!parsed.success) {
            return c.json({
                error: {
                    code: 'invalid_request',
                    message: parsed.error.issues
                        .map((i) => `${i.path.join('.')}: ${i.message}`)
                        .join('; '),
                },
            }, 400);
        }
        const req = parsed.data;
        // Plugin-id-mismatch zwischen request und manifest → reject
        if (req.plugin_id !== manifest.id) {
            return c.json({
                error: {
                    code: 'plugin_id_mismatch',
                    message: `request plugin_id='${req.plugin_id}' != manifest.id='${manifest.id}'`,
                },
            }, 400);
        }
        // Drift #206: handshake-time-status — host hat schon registriert (sonst
        // hätte auth-Middleware vorher 401 geworfen), wir signalisieren ob
        // re-registration empfohlen ist basierend auf optional-fields-coverage.
        // Bei handshake selbst übermittelt der Host host_version im JWT-Body —
        // wir können es als 'provided' werten (subset der register-fields).
        const providedOptionalFields = ['host_version'];
        const missingFields = registry.optionalFields.filter((f) => !providedOptionalFields.includes(f));
        const loopDetected = registry.detectReregisterLoop(req.host_id, missingFields);
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
        });
    };
}
//# sourceMappingURL=handshake.js.map