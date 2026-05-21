import type { HostKeyRecord, HostKeyStatus } from '../types.js';
import type { HostKeyRepo } from './host-keys.js';
export interface JsonFileHostKeyRepoOptions {
    /** Absoluter (oder relativ-zum-cwd) Pfad zur JSON-Datei. */
    path: string;
}
export declare class JsonFileHostKeyRepo implements HostKeyRepo {
    private readonly opts;
    private readonly store;
    private loaded;
    private writeQueue;
    constructor(opts: JsonFileHostKeyRepoOptions);
    /**
     * Lazy-load on first access. Eager-load via `await repo.load()` wenn
     * deterministic startup gewünscht (z.B. nach bootstrap-register).
     */
    load(): Promise<void>;
    /** Atomic-write des kompletten Stores nach disk. Serialized via writeQueue. */
    private flush;
    get(hostId: string): Promise<HostKeyRecord | null>;
    upsert(record: HostKeyRecord, opts?: {
        forceStatus?: HostKeyStatus;
    }): Promise<HostKeyRecord>;
    list(): Promise<HostKeyRecord[]>;
    setStatus(hostId: string, status: HostKeyStatus): Promise<HostKeyRecord | null>;
}
//# sourceMappingURL=host-keys-jsonfile.d.ts.map