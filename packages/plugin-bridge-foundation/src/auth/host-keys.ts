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

import { createHash } from 'node:crypto'
import {
  PLUGIN_REGISTRATION_SCHEMA_VERSION,
  type HostKeyRecord,
  type HostKeyStatus,
  type HostRecordStatus,
} from '../types.js'
import { BridgeTokenError, type HostKeyResolver, type HostVerification } from './jwt.js'

export interface HostKeyRepo {
  get(hostId: string): Promise<HostKeyRecord | null>
  upsert(record: HostKeyRecord, opts?: { forceStatus?: HostKeyStatus }): Promise<HostKeyRecord>
  list(): Promise<HostKeyRecord[]>
  setStatus(hostId: string, status: HostKeyStatus): Promise<HostKeyRecord | null>
}

export interface RegisterHostInput {
  host_id: string
  public_key_pem: string
  /** Optional. Provided fields tracked für Drift #206 host_record_status. */
  host_version?: string
  /** Optional. Pfad-C-Collab WebSocket / Reverse-Call-Channel (v0.2.0). */
  relay_url?: string
  /** v0.9.0 — per-Host expected issuer (markview #5345). Auf dem Record persistiert. */
  expected_issuer?: string
  /** v0.9.0 — per-Host expected audience (markview #5345). Auf dem Record persistiert. */
  expected_audience?: string
}

export interface RegistryOptions {
  /** Default false — privacy-by-default. Neue Hosts brauchen User-Confirm. */
  autoAccept?: boolean
  /**
   * Optional fields die DIESES Plugin von register-host requests ERZWINGT.
   *
   * v0.7.2 (Drift #105): Default = `[]` (opt-in). Ein „optional" benanntes Feld
   * darf durch seine Abwesenheit NICHT `reregister_recommended=true` triggern —
   * das ist der Selbstwiderspruch, der den reregister-Loop (119k Calls auf
   * Theseus) ausgelöst hat. Wer die Felder wirklich erzwingen will, opted-in:
   *   { optionalRegisterFields: BASELINE_OPTIONAL_REGISTER_FIELDS }
   * Fehlende erzwungene Fields landen in host_record_status.missing_optional_fields.
   */
  optionalRegisterFields?: readonly string[]
  /**
   * v0.2.3 Defensive Loop-Detection. Wenn ein Host ≥`reregisterLoopThreshold`
   * mal in `reregisterLoopWindowMs` Millisekunden re-registriert ohne dass die
   * `missing_optional_fields` sich ändern, wird `host_record_status
   * .reregister_loop_detected=true` emittiert. Default-Threshold: 3 in 5min.
   * Setze threshold auf 0 zum Disablen.
   */
  reregisterLoopThreshold?: number
  reregisterLoopWindowMs?: number
}

/**
 * Drift #206 helper — baut den symmetric host_record_status-Block. Wird
 * sowohl von register-host als auch handshake als ALWAYS-PRESENT Block returned.
 *
 * v0.2.3 `loopDetected` (optional) — Foundation defensive Cross-Host guard
 * signaling endless-no-op-re-register Pattern (siehe HostKeyRegistry).
 */
export function buildHostRecordStatus(opts: {
  isFirstRegister: boolean
  providedFields: readonly string[]
  optionalFields: readonly string[]
  loopDetected?: boolean
}): HostRecordStatus {
  const missing = opts.optionalFields.filter((f) => !opts.providedFields.includes(f))
  const status: HostRecordStatus = {
    schema_version: PLUGIN_REGISTRATION_SCHEMA_VERSION,
    plugin_current_schema: PLUGIN_REGISTRATION_SCHEMA_VERSION,
    is_first_register: opts.isFirstRegister,
    reregister_recommended: missing.length > 0,
    missing_optional_fields: missing,
  }
  if (opts.loopDetected) {
    status.reregister_loop_detected = true
  }
  return status
}

/**
 * SHA-256 fingerprint des PEM-Bodys (zwischen BEGIN/END markers, base64-decoded
 * nicht nötig — der PEM-string selbst ist stable). Format: hex-string mit
 * Doppelpunkten alle 4 chars für visual-comparison im UI.
 */
export function fingerprintPublicKey(publicKeyPem: string): string {
  const hash = createHash('sha256').update(publicKeyPem.trim()).digest('hex')
  return hash.match(/.{1,4}/g)?.join(':') ?? hash
}

export interface RegisterResult {
  record: HostKeyRecord
  /** True wenn dies die erste Registrierung für diesen host_id ist (Drift #206). */
  isFirstRegister: boolean
}

interface RegisterTraceEntry {
  timestamp: number
  /** Sorted comma-joined missing-fields snapshot at the time of register. */
  missingFingerprint: string
}

const DEFAULT_LOOP_THRESHOLD = 3
const DEFAULT_LOOP_WINDOW_MS = 5 * 60 * 1000

export class HostKeyRegistry implements HostKeyResolver {
  /** In-memory recent-register-trace per host_id (Loop-Detection, v0.2.3). */
  private readonly recentRegisters = new Map<string, RegisterTraceEntry[]>()
  /**
   * In-memory cache der optional fields die ein host_id zuletzt bei register
   * tatsächlich mitgeschickt hat (v0.7.2, Drift #105). Handshake liest hieraus
   * statt die provided-fields zu hardcoden. Self-healing: nach Prozess-Restart
   * leer → erster handshake meldet ggf. fehlende erzwungene Felder → host
   * re-registriert EINMAL → cache populated. Kein Loop (anders als der Hardcode).
   */
  private readonly providedOptionalCache = new Map<string, readonly string[]>()

  constructor(
    private readonly repo: HostKeyRepo,
    private readonly options: RegistryOptions = {},
  ) {}

  /**
   * Liste der optional fields die DIESES Plugin ERZWINGT. Drift #206 nutzt
   * diese zum Vergleich gegen tatsächlich provided fields.
   *
   * v0.7.2 (Drift #105): Default ist `[]` (opt-in), NICHT mehr
   * BASELINE_OPTIONAL_REGISTER_FIELDS — siehe RegistryOptions.optionalRegisterFields.
   */
  get optionalFields(): readonly string[] {
    return this.options.optionalRegisterFields ?? []
  }

  /**
   * Optional fields die `hostId` zuletzt bei register tatsächlich geliefert hat.
   * Quelle für handshake's host_record_status (v0.7.2) — ersetzt den
   * `['host_version']`-Hardcode. Leer wenn host_id (noch) nicht registriert ist
   * bzw. nach Prozess-Restart bis zur nächsten Registrierung.
   */
  getProvidedOptionalFields(hostId: string): readonly string[] {
    return this.providedOptionalCache.get(hostId) ?? []
  }

  get loopThreshold(): number {
    return this.options.reregisterLoopThreshold ?? DEFAULT_LOOP_THRESHOLD
  }

  get loopWindowMs(): number {
    return this.options.reregisterLoopWindowMs ?? DEFAULT_LOOP_WINDOW_MS
  }

  /**
   * Track a register-Trace for Loop-Detection. Called automatisch von register().
   * Trace is kept bounded (last 10 entries per host).
   */
  private trackRegister(hostId: string, providedFields: readonly string[]): void {
    if (this.loopThreshold <= 0) return // Loop-Detection disabled
    const missing = this.optionalFields.filter((f) => !providedFields.includes(f))
    const fp = [...missing].sort().join(',')
    const entries = this.recentRegisters.get(hostId) ?? []
    entries.push({ timestamp: Date.now(), missingFingerprint: fp })
    // Cap at 10 entries; drop oldest
    while (entries.length > 10) entries.shift()
    this.recentRegisters.set(hostId, entries)
  }

  /**
   * Check if a host has been re-registering in a loop with the same missing
   * fields. Returns true if ≥threshold entries with the same missing-fields
   * fingerprint appear in the last window. Pure read — does not mutate trace.
   */
  detectReregisterLoop(hostId: string, missing_optional_fields: readonly string[]): boolean {
    if (this.loopThreshold <= 0) return false
    const entries = this.recentRegisters.get(hostId)
    if (!entries || entries.length < this.loopThreshold) return false
    const fp = [...missing_optional_fields].sort().join(',')
    const cutoff = Date.now() - this.loopWindowMs
    const matching = entries.filter((e) => e.timestamp >= cutoff && e.missingFingerprint === fp)
    return matching.length >= this.loopThreshold
  }

  async register(input: RegisterHostInput): Promise<RegisterResult> {
    // Track every register-attempt für Loop-Detection (v0.2.3), regardless of outcome.
    const providedFields = (Object.keys(input) as Array<keyof RegisterHostInput>).filter(
      (k) => k !== 'host_id' && k !== 'public_key_pem' && input[k] !== undefined,
    )
    this.trackRegister(input.host_id, providedFields)
    // v0.7.2 (Drift #105): remember which optional fields this host has provided,
    // as a UNION over repeated registrations (a host that once supplied relay_url
    // stays credited). Handshake reads this instead of hardcoding ['host_version'].
    const prior = this.providedOptionalCache.get(input.host_id) ?? []
    const merged = Array.from(new Set([...prior, ...providedFields]))
    this.providedOptionalCache.set(input.host_id, merged)

    const existing = await this.repo.get(input.host_id)
    const fingerprint = fingerprintPublicKey(input.public_key_pem)
    const isFirstRegister = existing === null

    // v0.9.0 — per-Host optional record fields carried from register (markview
    // #5345). Only the fields actually provided overlay; unprovided fields keep
    // the existing value (so a key-rotation/re-register doesn't drop iss/aud).
    const overlay: Partial<HostKeyRecord> = {}
    if (input.relay_url !== undefined) overlay.relay_url = input.relay_url
    if (input.expected_issuer !== undefined) overlay.expected_issuer = input.expected_issuer
    if (input.expected_audience !== undefined) overlay.expected_audience = input.expected_audience

    // Same key + existing → preserve status (Drift #12 idempotency). Refresh the
    // per-host optional fields if (re-)provided, otherwise return existing as-is.
    if (existing && existing.public_key_pem.trim() === input.public_key_pem.trim()) {
      if (Object.keys(overlay).length > 0) {
        const refreshed = await this.repo.upsert({ ...existing, ...overlay })
        return { record: refreshed, isFirstRegister: false }
      }
      return { record: existing, isFirstRegister: false }
    }

    // New host_id OR key rotation → pending (or active if autoAccept)
    const initialStatus: HostKeyStatus = this.options.autoAccept ? 'active' : 'pending'
    const now = new Date().toISOString()

    const record: HostKeyRecord = {
      host_id: input.host_id,
      public_key_pem: input.public_key_pem.trim(),
      status: initialStatus,
      fingerprint,
      registered_at: existing?.registered_at ?? now,
      approved_at: initialStatus === 'active' ? now : null,
      // Preserve existing per-host fields across key-rotation, overlaid by newly provided.
      ...(existing
        ? {
            relay_url: existing.relay_url,
            expected_issuer: existing.expected_issuer,
            expected_audience: existing.expected_audience,
            last_used_at: existing.last_used_at,
          }
        : {}),
      ...overlay,
    }

    const upserted = await this.repo.upsert(
      record,
      this.options.autoAccept ? { forceStatus: 'active' } : {},
    )
    return { record: upserted, isFirstRegister }
  }

  async approve(hostId: string): Promise<HostKeyRecord | null> {
    const record = await this.repo.setStatus(hostId, 'active')
    if (record && !record.approved_at) {
      // Mark approved_at if not set
      return this.repo.upsert({ ...record, approved_at: new Date().toISOString() })
    }
    return record
  }

  async reject(hostId: string): Promise<HostKeyRecord | null> {
    return this.repo.setStatus(hostId, 'rejected')
  }

  async list(): Promise<HostKeyRecord[]> {
    return this.repo.list()
  }

  /**
   * v0.9.0 — best-effort Touch von `last_used_at` nach erfolgreichem Verify.
   * Nur aufgerufen wenn `createBridgeApp({ trackHostLastUsed: true })` (opt-in,
   * vermeidet per-Request-Writes by default). Schluckt Fehler nicht — der
   * Caller (authMiddleware) ruft fire-and-forget.
   */
  async markHostUsed(hostId: string): Promise<void> {
    const record = await this.repo.get(hostId)
    if (!record) return
    await this.repo.upsert({ ...record, last_used_at: new Date().toISOString() })
  }

  // --- HostKeyResolver implementation ---

  /** Holt den active-Record oder wirft host_not_registered/pending/rejected. */
  private async getActiveRecord(hostId: string): Promise<HostKeyRecord> {
    const record = await this.repo.get(hostId)
    if (!record) {
      throw new BridgeTokenError(
        'host_not_registered',
        `host '${hostId}' is not registered — call POST /plugin-bridge/v1/register-host first`,
      )
    }
    if (record.status === 'pending') {
      throw new BridgeTokenError(
        'host_pending',
        `host '${hostId}' is awaiting user-confirmation — open Plugin App-Settings to approve`,
      )
    }
    if (record.status === 'rejected') {
      throw new BridgeTokenError('host_rejected', `host '${hostId}' has been rejected by the user`)
    }
    return record
  }

  async getActivePublicKey(hostId: string): Promise<string> {
    return (await this.getActiveRecord(hostId)).public_key_pem
  }

  /** v0.9.0 — per-Host PEM + expected iss/aud für verifyBridgeToken. */
  async getHostVerification(hostId: string): Promise<HostVerification> {
    const record = await this.getActiveRecord(hostId)
    return {
      public_key_pem: record.public_key_pem,
      expected_issuer: record.expected_issuer ?? null,
      expected_audience: record.expected_audience ?? null,
    }
  }
}

/**
 * In-Memory-Implementation des HostKeyRepo. Für Tests + dev. Production-
 * Plugin-Provider implementiert eigenen Repo (z.B. SQLite-backed).
 */
export class InMemoryHostKeyRepo implements HostKeyRepo {
  private readonly store = new Map<string, HostKeyRecord>()

  async get(hostId: string): Promise<HostKeyRecord | null> {
    return this.store.get(hostId) ?? null
  }

  async upsert(
    record: HostKeyRecord,
    opts: { forceStatus?: HostKeyStatus } = {},
  ): Promise<HostKeyRecord> {
    const finalRecord = opts.forceStatus ? { ...record, status: opts.forceStatus } : record
    this.store.set(record.host_id, finalRecord)
    return finalRecord
  }

  async list(): Promise<HostKeyRecord[]> {
    return Array.from(this.store.values())
  }

  async setStatus(hostId: string, status: HostKeyStatus): Promise<HostKeyRecord | null> {
    const existing = this.store.get(hostId)
    if (!existing) return null
    const updated: HostKeyRecord = { ...existing, status }
    this.store.set(hostId, updated)
    return updated
  }
}
