export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogFormat = 'json' | 'text';
export interface LogContext {
    [k: string]: unknown;
}
export interface LoggerOptions {
    /** Service-Identity für `service`-field. Z.B. 'plugin-bridge', 'eamind-bridge'. */
    service: string;
    /** Minimum-Level (incl). Default 'info'. */
    level?: LogLevel;
    /** 'json' (default) oder 'text'. Override via env BRIDGE_LOG_FORMAT. */
    format?: LogFormat;
    /** Bound context — merged in alle Log-Calls. */
    context?: LogContext;
    /** Write-target. Default process.stdout/stderr. Inject custom für tests. */
    stdout?: {
        write: (s: string) => void;
    };
    stderr?: {
        write: (s: string) => void;
    };
}
export declare class Logger {
    private readonly service;
    private readonly level;
    private readonly format;
    private readonly boundCtx;
    private readonly stdout;
    private readonly stderr;
    constructor(opts: LoggerOptions);
    /** Returns a child logger with merged bound context. */
    child(ctx: LogContext): Logger;
    debug(msg: string, ctx?: LogContext): void;
    info(msg: string, ctx?: LogContext): void;
    warn(msg: string, ctx?: LogContext): void;
    error(msg: string, ctx?: LogContext): void;
    private write;
    private toJson;
    private toText;
}
//# sourceMappingURL=logger.d.ts.map