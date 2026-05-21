import { type PluginManifest } from '../types.js';
export declare class ManifestError extends Error {
    readonly code: 'not_found' | 'parse_error' | 'validation_error' | 'drift_203';
    constructor(code: 'not_found' | 'parse_error' | 'validation_error' | 'drift_203', message: string);
}
export type Drift203Mode = 'warn' | 'strict' | 'off';
export interface ManifestValidationOptions {
    /**
     * Drift #203 — service_endpoint MUSS 127.0.0.1 sein, NIE localhost. Modes:
     *  - 'warn' (default): emit warning to stderr, accept manifest
     *  - 'strict': throw ManifestError with code 'drift_203'
     *  - 'off': skip check
     */
    drift203?: Drift203Mode;
    /** Override stderr-sink (für tests). */
    warn?: (msg: string) => void;
}
/**
 * Lädt manifest.yaml von disk + parsed + validates. Returnt typed manifest.
 * Wirft ManifestError bei Fehlern.
 */
export declare function loadManifest(filePath: string, opts?: ManifestValidationOptions): Promise<PluginManifest>;
/**
 * Validate manifest-Object ohne file-IO (für tests + in-memory-builders).
 */
export declare function validateManifest(value: unknown, opts?: ManifestValidationOptions): PluginManifest;
//# sourceMappingURL=loader.d.ts.map