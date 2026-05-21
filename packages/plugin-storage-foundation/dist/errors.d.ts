export type StorageErrorCode = 'not_found' | 'conflict' | 'invalid_args' | 'integrity_violation' | 'abi_mismatch' | 'open_failed' | 'pragma_failed' | 'migration_failed' | 'rollback_blocked' | 'storage_error';
export interface CanonicalError {
    code: string;
    message: string;
    details?: unknown;
}
export declare class StorageError extends Error {
    readonly code: StorageErrorCode;
    readonly details?: unknown | undefined;
    readonly cause?: unknown | undefined;
    constructor(code: StorageErrorCode, message: string, details?: unknown | undefined, cause?: unknown | undefined);
    /** Canonical Drift #103 shape — drop-in for tool-handler `throw`-statements. */
    toCanonical(): CanonicalError;
}
/**
 * Convert ANY error to canonical Drift #103 shape. Recognizes:
 *  - StorageError (this module)
 *  - SqliteConnectionError (from ./sqlite/connection)
 *  - any object with `code` + `message` (duck-typed)
 *  - Error (falls back to 'storage_error')
 */
export declare function toCanonicalError(err: unknown): CanonicalError;
//# sourceMappingURL=errors.d.ts.map