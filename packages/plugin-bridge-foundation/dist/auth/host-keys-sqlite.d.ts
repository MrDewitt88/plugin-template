import type { HostKeyRecord, HostKeyStatus } from '../types.js';
import type { HostKeyRepo } from './host-keys.js';
/**
 * Minimal Database-interface — wir importieren `better-sqlite3` nicht direkt,
 * damit Plugin-Providers die nur InMemory/JsonFile nutzen, keinen native-dep
 * download brauchen. Konsumenten passen ihre `better-sqlite3` Database-Instanz
 * rein (compatible via structural-typing).
 */
export interface SqliteHostKeyRepoStatement {
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
    run(...params: unknown[]): {
        changes: number;
        lastInsertRowid?: number | bigint;
    };
}
export interface SqliteHostKeyRepoDatabase {
    prepare(sql: string): SqliteHostKeyRepoStatement;
    exec(sql: string): void;
}
export interface SqliteHostKeyRepoOptions {
    /**
     * SQLite-Tabellen-Name. Default `'plugin_host_keys'`. Plugin-Provider mit
     * bestehender Tabelle (z.B. markview's `host_keys`) overriden auf ihren Namen.
     */
    tableName?: string;
}
export declare class SqliteHostKeyRepo implements HostKeyRepo {
    private readonly db;
    private readonly tableName;
    private schemaEnsured;
    constructor(db: SqliteHostKeyRepoDatabase, opts?: SqliteHostKeyRepoOptions);
    /**
     * Idempotent — sicher zu callen auf jeder Bridge-Boot. CREATE TABLE
     * IF NOT EXISTS ist no-op wenn Tabelle existiert (auch wenn sie via
     * Konsumenten-Migration bereits angelegt wurde, Foundation-Spalten
     * sind subset und nicht conflicting).
     */
    ensureSchema(): void;
    get(hostId: string): Promise<HostKeyRecord | null>;
    upsert(record: HostKeyRecord, opts?: {
        forceStatus?: HostKeyStatus;
    }): Promise<HostKeyRecord>;
    list(): Promise<HostKeyRecord[]>;
    setStatus(hostId: string, status: HostKeyStatus): Promise<HostKeyRecord | null>;
}
//# sourceMappingURL=host-keys-sqlite.d.ts.map