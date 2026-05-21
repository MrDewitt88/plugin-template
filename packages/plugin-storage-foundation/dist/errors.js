// Canonical-error shape für Drift #103 (cross-repo aligned). Wenn ein
// Plugin-Provider Storage-Errors über die Plugin-Bridge zurück propagiert
// (tool-error / hook-error), nutzt er `toCanonicalError(err)` damit die
// Wire-shape `{error:{code,message,details?}}` matched ohne hand-rolling.
export class StorageError extends Error {
    code;
    details;
    cause;
    constructor(code, message, details, cause) {
        super(message);
        this.code = code;
        this.details = details;
        this.cause = cause;
        this.name = 'StorageError';
    }
    /** Canonical Drift #103 shape — drop-in for tool-handler `throw`-statements. */
    toCanonical() {
        const out = { code: this.code, message: this.message };
        if (this.details !== undefined)
            out.details = this.details;
        return out;
    }
}
/**
 * Convert ANY error to canonical Drift #103 shape. Recognizes:
 *  - StorageError (this module)
 *  - SqliteConnectionError (from ./sqlite/connection)
 *  - any object with `code` + `message` (duck-typed)
 *  - Error (falls back to 'storage_error')
 */
export function toCanonicalError(err) {
    if (err instanceof StorageError)
        return err.toCanonical();
    const e = err;
    if (typeof e.code === 'string' && typeof e.message === 'string') {
        const out = { code: e.code, message: e.message };
        if (e.details !== undefined)
            out.details = e.details;
        return out;
    }
    if (err instanceof Error) {
        return { code: 'storage_error', message: err.message };
    }
    return { code: 'storage_error', message: String(err) };
}
//# sourceMappingURL=errors.js.map