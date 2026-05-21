import { type HostKeyRecord, type HostKeyStatus, type HostRecordStatus } from '../types.js';
import { type HostKeyResolver } from './jwt.js';
export interface HostKeyRepo {
    get(hostId: string): Promise<HostKeyRecord | null>;
    upsert(record: HostKeyRecord, opts?: {
        forceStatus?: HostKeyStatus;
    }): Promise<HostKeyRecord>;
    list(): Promise<HostKeyRecord[]>;
    setStatus(hostId: string, status: HostKeyStatus): Promise<HostKeyRecord | null>;
}
export interface RegisterHostInput {
    host_id: string;
    public_key_pem: string;
    /** Optional. Provided fields tracked für Drift #206 host_record_status. */
    host_version?: string;
    /** Optional. Pfad-C-Collab WebSocket / Reverse-Call-Channel (v0.2.0). */
    relay_url?: string;
}
export interface RegistryOptions {
    /** Default false — privacy-by-default. Neue Hosts brauchen User-Confirm. */
    autoAccept?: boolean;
    /**
     * Optional fields die DIESES Plugin von register-host requests akzeptiert.
     * Default = BASELINE_OPTIONAL_REGISTER_FIELDS. Plugin-Provider können erweitern
     * (z.B. ['host_version', 'relay_url', 'host_metadata']). Fehlende Fields
     * landen in host_record_status.missing_optional_fields.
     */
    optionalRegisterFields?: readonly string[];
    /**
     * v0.2.3 Defensive Loop-Detection. Wenn ein Host ≥`reregisterLoopThreshold`
     * mal in `reregisterLoopWindowMs` Millisekunden re-registriert ohne dass die
     * `missing_optional_fields` sich ändern, wird `host_record_status
     * .reregister_loop_detected=true` emittiert. Default-Threshold: 3 in 5min.
     * Setze threshold auf 0 zum Disablen.
     */
    reregisterLoopThreshold?: number;
    reregisterLoopWindowMs?: number;
}
/**
 * Drift #206 helper — baut den symmetric host_record_status-Block. Wird
 * sowohl von register-host als auch handshake als ALWAYS-PRESENT Block returned.
 *
 * v0.2.3 `loopDetected` (optional) — Foundation defensive Cross-Host guard
 * signaling endless-no-op-re-register Pattern (siehe HostKeyRegistry).
 */
export declare function buildHostRecordStatus(opts: {
    isFirstRegister: boolean;
    providedFields: readonly string[];
    optionalFields: readonly string[];
    loopDetected?: boolean;
}): HostRecordStatus;
/**
 * SHA-256 fingerprint des PEM-Bodys (zwischen BEGIN/END markers, base64-decoded
 * nicht nötig — der PEM-string selbst ist stable). Format: hex-string mit
 * Doppelpunkten alle 4 chars für visual-comparison im UI.
 */
export declare function fingerprintPublicKey(publicKeyPem: string): string;
export interface RegisterResult {
    record: HostKeyRecord;
    /** True wenn dies die erste Registrierung für diesen host_id ist (Drift #206). */
    isFirstRegister: boolean;
}
export declare class HostKeyRegistry implements HostKeyResolver {
    private readonly repo;
    private readonly options;
    /** In-memory recent-register-trace per host_id (Loop-Detection, v0.2.3). */
    private readonly recentRegisters;
    constructor(repo: HostKeyRepo, options?: RegistryOptions);
    /**
     * Liste der optional fields die DIESES Plugin akzeptiert. Drift #206 nutzt
     * diese zum Vergleich gegen tatsächlich provided fields im register-Body.
     */
    get optionalFields(): readonly string[];
    get loopThreshold(): number;
    get loopWindowMs(): number;
    /**
     * Track a register-Trace for Loop-Detection. Called automatisch von register().
     * Trace is kept bounded (last 10 entries per host).
     */
    private trackRegister;
    /**
     * Check if a host has been re-registering in a loop with the same missing
     * fields. Returns true if ≥threshold entries with the same missing-fields
     * fingerprint appear in the last window. Pure read — does not mutate trace.
     */
    detectReregisterLoop(hostId: string, missing_optional_fields: readonly string[]): boolean;
    register(input: RegisterHostInput): Promise<RegisterResult>;
    approve(hostId: string): Promise<HostKeyRecord | null>;
    reject(hostId: string): Promise<HostKeyRecord | null>;
    list(): Promise<HostKeyRecord[]>;
    getActivePublicKey(hostId: string): Promise<string>;
}
/**
 * In-Memory-Implementation des HostKeyRepo. Für Tests + dev. Production-
 * Plugin-Provider implementiert eigenen Repo (z.B. SQLite-backed).
 */
export declare class InMemoryHostKeyRepo implements HostKeyRepo {
    private readonly store;
    get(hostId: string): Promise<HostKeyRecord | null>;
    upsert(record: HostKeyRecord, opts?: {
        forceStatus?: HostKeyStatus;
    }): Promise<HostKeyRecord>;
    list(): Promise<HostKeyRecord[]>;
    setStatus(hostId: string, status: HostKeyStatus): Promise<HostKeyRecord | null>;
}
//# sourceMappingURL=host-keys.d.ts.map