import {
  BridgeTokenError, HostKeyRegistry, type HostKeyRepo,
  type RegisterHostInput, type RegisterResult, type HostVerification,
} from '@nexus-mindgarden/plugin-bridge-foundation'

/** Register/key rotation and human approval share a queue to fence key races. */
export class AppHostRegistry extends HostKeyRegistry {
  private queue: Promise<unknown> = Promise.resolve()
  constructor(private readonly records: HostKeyRepo, private readonly appId: string) {
    super(records, { autoAccept: false })
  }
  private serial<T>(action: () => Promise<T>): Promise<T> {
    const next = this.queue.then(action)
    this.queue = next.catch(() => {})
    return next
  }
  override register(input: RegisterHostInput): Promise<RegisterResult> {
    return this.serial(async () => {
      const old = await this.records.get(input.host_id)
      // Once approved, unauthenticated re-registration cannot replace the issuer.
      const sameActiveKey = old?.status === 'active' && old.public_key_pem.trim() === input.public_key_pem.trim()
      return super.register({ ...input, expected_audience: this.appId,
        ...(sameActiveKey && old.expected_issuer ? { expected_issuer: old.expected_issuer } : {}),
      })
    })
  }
  override markHostUsed(hostId: string): Promise<void> {
    return this.serial(() => super.markHostUsed(hostId))
  }
  approveFingerprint(hostId: string, fingerprint: string, issuer: string) {
    return this.serial(async () => {
      const record = await this.records.get(hostId)
      if (!record || record.fingerprint !== fingerprint || !issuer.trim()) throw new Error('host_key_changed')
      await this.records.upsert({ ...record, expected_issuer: issuer.trim(), expected_audience: this.appId })
      return super.approve(hostId)
    })
  }
  rejectFingerprint(hostId: string, fingerprint: string) {
    return this.serial(async () => {
      if ((await this.records.get(hostId))?.fingerprint !== fingerprint) throw new Error('host_key_changed')
      return super.reject(hostId)
    })
  }
  override async getHostVerification(hostId: string): Promise<HostVerification> {
    const verification = await super.getHostVerification(hostId)
    if (!verification.expected_issuer) throw new BridgeTokenError('host_pending', 'Host issuer requires local confirmation')
    return { ...verification, expected_audience: this.appId }
  }
}
