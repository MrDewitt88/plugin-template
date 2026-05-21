// Host-Keys-Registry-Pattern (siehe MarkView mv_host_keys, Drift #12 idempotency).
//
// Plugin-Provider hostet eigene Bridge → mehrere Hosts (V8, Theseus, …)
// können sich registrieren. Default: privacy-by-default — neue Hosts
// landen 'pending' bis User-Confirm. autoAccept=true für dev/test.
//
// Idempotency-Rules (Drift #12):
//   - same host_id + same key → existing status preserved
//   - same host_id + new key (rotation) → reset to pending (re-confirm)
//   - new host_id → pending (oder active wenn autoAccept)
import { createHash } from 'node:crypto';
import { BASELINE_OPTIONAL_REGISTER_FIELDS, PLUGIN_REGISTRATION_SCHEMA_VERSION, } from '../types.js';
import { BridgeTokenError } from './jwt.js';
/**
 * Drift #206 helper — baut den symmetric host_record_status-Block. Wird
 * sowohl von register-host als auch handshake als ALWAYS-PRESENT Block returned.
 *
 * v0.2.3 `loopDetected` (optional) — Foundation defensive Cross-Host guard
 * signaling endless-no-op-re-register Pattern (siehe HostKeyRegistry).
 */
export function buildHostRecordStatus(opts) {
    const missing = opts.optionalFields.filter((f) => !opts.providedFields.includes(f));
    const status = {
        schema_version: PLUGIN_REGISTRATION_SCHEMA_VERSION,
        plugin_current_schema: PLUGIN_REGISTRATION_SCHEMA_VERSION,
        is_first_register: opts.isFirstRegister,
        reregister_recommended: missing.length > 0,
        missing_optional_fields: missing,
    };
    if (opts.loopDetected) {
        status.reregister_loop_detected = true;
    }
    return status;
}
/**
 * SHA-256 fingerprint des PEM-Bodys (zwischen BEGIN/END markers, base64-decoded
 * nicht nötig — der PEM-string selbst ist stable). Format: hex-string mit
 * Doppelpunkten alle 4 chars für visual-comparison im UI.
 */
export function fingerprintPublicKey(publicKeyPem) {
    const hash = createHash('sha256').update(publicKeyPem.trim()).digest('hex');
    return hash.match(/.{1,4}/g)?.join(':') ?? hash;
}
const DEFAULT_LOOP_THRESHOLD = 3;
const DEFAULT_LOOP_WINDOW_MS = 5 * 60 * 1000;
export class HostKeyRegistry {
    repo;
    options;
    /** In-memory recent-register-trace per host_id (Loop-Detection, v0.2.3). */
    recentRegisters = new Map();
    constructor(repo, options = {}) {
        this.repo = repo;
        this.options = options;
    }
    /**
     * Liste der optional fields die DIESES Plugin akzeptiert. Drift #206 nutzt
     * diese zum Vergleich gegen tatsächlich provided fields im register-Body.
     */
    get optionalFields() {
        return this.options.optionalRegisterFields ?? BASELINE_OPTIONAL_REGISTER_FIELDS;
    }
    get loopThreshold() {
        return this.options.reregisterLoopThreshold ?? DEFAULT_LOOP_THRESHOLD;
    }
    get loopWindowMs() {
        return this.options.reregisterLoopWindowMs ?? DEFAULT_LOOP_WINDOW_MS;
    }
    /**
     * Track a register-Trace for Loop-Detection. Called automatisch von register().
     * Trace is kept bounded (last 10 entries per host).
     */
    trackRegister(hostId, providedFields) {
        if (this.loopThreshold <= 0)
            return; // Loop-Detection disabled
        const missing = this.optionalFields.filter((f) => !providedFields.includes(f));
        const fp = [...missing].sort().join(',');
        const entries = this.recentRegisters.get(hostId) ?? [];
        entries.push({ timestamp: Date.now(), missingFingerprint: fp });
        // Cap at 10 entries; drop oldest
        while (entries.length > 10)
            entries.shift();
        this.recentRegisters.set(hostId, entries);
    }
    /**
     * Check if a host has been re-registering in a loop with the same missing
     * fields. Returns true if ≥threshold entries with the same missing-fields
     * fingerprint appear in the last window. Pure read — does not mutate trace.
     */
    detectReregisterLoop(hostId, missing_optional_fields) {
        if (this.loopThreshold <= 0)
            return false;
        const entries = this.recentRegisters.get(hostId);
        if (!entries || entries.length < this.loopThreshold)
            return false;
        const fp = [...missing_optional_fields].sort().join(',');
        const cutoff = Date.now() - this.loopWindowMs;
        const matching = entries.filter((e) => e.timestamp >= cutoff && e.missingFingerprint === fp);
        return matching.length >= this.loopThreshold;
    }
    async register(input) {
        // Track every register-attempt für Loop-Detection (v0.2.3), regardless of outcome.
        const providedFields = Object.keys(input).filter((k) => k !== 'host_id' && k !== 'public_key_pem' && input[k] !== undefined);
        this.trackRegister(input.host_id, providedFields);
        const existing = await this.repo.get(input.host_id);
        const fingerprint = fingerprintPublicKey(input.public_key_pem);
        const isFirstRegister = existing === null;
        // Same key + existing → preserve status (Drift #12 idempotency)
        if (existing && existing.public_key_pem.trim() === input.public_key_pem.trim()) {
            return { record: existing, isFirstRegister: false };
        }
        // New host_id OR key rotation → pending (or active if autoAccept)
        const initialStatus = this.options.autoAccept ? 'active' : 'pending';
        const now = new Date().toISOString();
        const record = {
            host_id: input.host_id,
            public_key_pem: input.public_key_pem.trim(),
            status: initialStatus,
            fingerprint,
            registered_at: existing?.registered_at ?? now,
            approved_at: initialStatus === 'active' ? now : null,
        };
        const upserted = await this.repo.upsert(record, this.options.autoAccept ? { forceStatus: 'active' } : {});
        return { record: upserted, isFirstRegister };
    }
    async approve(hostId) {
        const record = await this.repo.setStatus(hostId, 'active');
        if (record && !record.approved_at) {
            // Mark approved_at if not set
            return this.repo.upsert({ ...record, approved_at: new Date().toISOString() });
        }
        return record;
    }
    async reject(hostId) {
        return this.repo.setStatus(hostId, 'rejected');
    }
    async list() {
        return this.repo.list();
    }
    // --- HostKeyResolver implementation ---
    async getActivePublicKey(hostId) {
        const record = await this.repo.get(hostId);
        if (!record) {
            throw new BridgeTokenError('host_not_registered', `host '${hostId}' is not registered — call POST /plugin-bridge/v1/register-host first`);
        }
        if (record.status === 'pending') {
            throw new BridgeTokenError('host_pending', `host '${hostId}' is awaiting user-confirmation — open Plugin App-Settings to approve`);
        }
        if (record.status === 'rejected') {
            throw new BridgeTokenError('host_rejected', `host '${hostId}' has been rejected by the user`);
        }
        return record.public_key_pem;
    }
}
/**
 * In-Memory-Implementation des HostKeyRepo. Für Tests + dev. Production-
 * Plugin-Provider implementiert eigenen Repo (z.B. SQLite-backed).
 */
export class InMemoryHostKeyRepo {
    store = new Map();
    async get(hostId) {
        return this.store.get(hostId) ?? null;
    }
    async upsert(record, opts = {}) {
        const finalRecord = opts.forceStatus
            ? { ...record, status: opts.forceStatus }
            : record;
        this.store.set(record.host_id, finalRecord);
        return finalRecord;
    }
    async list() {
        return Array.from(this.store.values());
    }
    async setStatus(hostId, status) {
        const existing = this.store.get(hostId);
        if (!existing)
            return null;
        const updated = { ...existing, status };
        this.store.set(hostId, updated);
        return updated;
    }
}
//# sourceMappingURL=host-keys.js.map