import { type TemplateContext } from '../templates/render.js';
export declare class ScaffoldError extends Error {
    readonly code: 'target_exists' | 'write_failed' | 'invalid_target';
    constructor(code: 'target_exists' | 'write_failed' | 'invalid_target', message: string);
}
export interface ScaffoldOptions {
    pluginName: string;
    hosts: string[];
    features: string[];
    target: string;
    /** Default false — wirft wenn target-dir bereits existiert. */
    force?: boolean;
}
export interface ScaffoldResult {
    filesWritten: string[];
    target: string;
    context: TemplateContext;
}
/**
 * Render alle templates + write files. Returns liste der geschriebenen
 * Files für summary.
 *
 * Skipt files mit feature-flag wenn feature nicht in opts.features.
 */
export declare function scaffold(opts: ScaffoldOptions): ScaffoldResult;
//# sourceMappingURL=scaffold.d.ts.map