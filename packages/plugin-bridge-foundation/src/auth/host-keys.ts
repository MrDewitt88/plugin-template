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
  BASELINE_OPTIONAL_REGISTER_FIELDS,
  PLUGIN_REGISTRATION_SCHEMA_VERSION,
  type HostKeyRecord,
  type HostKeyStatus,
  type HostRecordStatus,
} from '../types.js'
import { BridgeTokenError, type HostKeyResolver } from './jwt.js'

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
}

export interface RegistryOptions {
  /** Default false — privacy-by-default. Neue Hosts brauchen User-Confirm. */
  autoAccept?: boolean
  /**
   * Optional fields die DIESES Plugin von register-host requests akzeptiert.
   * Default = BASELINE_OPTIONAL_REGISTER_FIELDS. Plugin-Provider können erweitern
   * (z.B. ['host_version', 'relay_url', 'host_metadata']). Fehlende Fields
   * landen in host_record_status.missing_optional_fields.
   */
  optionalRegisterFields?: readonly string[]
}

/**
 * Drift #206 helper — baut den symmetric host_record_status-Block. Wird
 * sowohl von register-host als auch handshake als ALWAYS-PRESENT Block returned.
 */
export function buildHostRecordStatus(opts: {
  isFirstRegister: boolean
  providedFields: readonly string[]
  optionalFields: readonly string[]
}): HostRecordStatus {
  const missing = opts.optionalFields.filter((f) => !opts.providedFields.includes(f))
  return {
    schema_version: PLUGIN_REGISTRATION_SCHEMA_VERSION,
    plugin_current_schema: PLUGIN_REGISTRATION_SCHEMA_VERSION,
    is_first_register: opts.isFirstRegister,
    reregister_recommended: missing.length > 0,
    missing_optional_fields: missing,
  }
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

export class HostKeyRegistry implements HostKeyResolver {
  constructor(
    private readonly repo: HostKeyRepo,
    private readonly options: RegistryOptions = {},
  ) {}

  /**
   * Liste der optional fields die DIESES Plugin akzeptiert. Drift #206 nutzt
   * diese zum Vergleich gegen tatsächlich provided fields im register-Body.
   */
  get optionalFields(): readonly string[] {
    return this.options.optionalRegisterFields ?? BASELINE_OPTIONAL_REGISTER_FIELDS
  }

  async register(input: RegisterHostInput): Promise<RegisterResult> {
    const existing = await this.repo.get(input.host_id)
    const fingerprint = fingerprintPublicKey(input.public_key_pem)
    const isFirstRegister = existing === null

    // Same key + existing → preserve status (Drift #12 idempotency)
    if (existing && existing.public_key_pem.trim() === input.public_key_pem.trim()) {
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

  // --- HostKeyResolver implementation ---

  async getActivePublicKey(hostId: string): Promise<string> {
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
    return record.public_key_pem
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
    const finalRecord = opts.forceStatus
      ? { ...record, status: opts.forceStatus }
      : record
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
