export interface ParsedArgs {
    pluginName: string;
    hosts: string[];
    features: ('bridge' | 'storage' | 'svelte' | 'mcp')[];
    target: string;
    help: boolean;
}
export declare class ArgsError extends Error {
    readonly code: 'invalid_name' | 'missing_name' | 'invalid_features' | 'invalid_hosts';
    constructor(code: 'invalid_name' | 'missing_name' | 'invalid_features' | 'invalid_hosts', message: string);
}
export declare function parseArgs(argv: string[]): ParsedArgs;
export declare const HELP_TEXT: string;
//# sourceMappingURL=args.d.ts.map