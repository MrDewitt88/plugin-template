import { type Database as DatabaseType } from 'better-sqlite3';
export interface ConnectionOptions {
    /** Absolute path to .db file. Parent-dirs werden auto-erstellt. */
    path: string;
    /** Default true — open read+write, create if missing. */
    readonly?: boolean;
    /** Default true — WAL-mode für concurrent-reads + serialized writes. */
    walMode?: boolean;
    /** Default true — referential-integrity-enforced. */
    foreignKeys?: boolean;
    /** Default 5000 — ms wait bei locked-rows. */
    busyTimeoutMs?: number;
    /** Default -32000 (32MB). */
    cacheSizeKb?: number;
    /** Optional: better-sqlite3 verbose-callback (e.g. console.log für debug). */
    verbose?: (msg: unknown) => void;
}
export declare class SqliteConnectionError extends Error {
    readonly code: 'abi_mismatch' | 'open_failed' | 'pragma_failed';
    readonly cause?: unknown | undefined;
    constructor(code: 'abi_mismatch' | 'open_failed' | 'pragma_failed', message: string, cause?: unknown | undefined);
}
/**
 * Öffnet SQLite-Connection + applied Production-Pragmas. Throws
 * SqliteConnectionError mit code='abi_mismatch' wenn better-sqlite3
 * Native-Binary nicht zum Runtime passt (ältere Drift #11/#13-Klasse).
 */
export declare function openConnection(opts: ConnectionOptions): DatabaseType;
/**
 * Closes connection safely. Idempotent — second call is no-op.
 */
export declare function closeConnection(db: DatabaseType | null): void;
//# sourceMappingURL=connection.d.ts.map