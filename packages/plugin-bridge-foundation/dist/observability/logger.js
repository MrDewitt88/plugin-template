// JSON-Lines structured logger — dependency-free, 4 levels, ctx-Maps.
// Reference-Pattern: plug-elec packages/etmind-bridge/src/logger.ts (msg #240)
// + plug-db services/bridge/app/main.py (OBS2). Cross-language consistency.
//
// Format-Override via env BRIDGE_LOG_FORMAT=text (default 'json').
// warn/error routet zu stderr; info/debug zu stdout (syslog-Convention).
const LEVEL_RANK = { debug: 10, info: 20, warn: 30, error: 40 };
export class Logger {
    service;
    level;
    format;
    boundCtx;
    stdout;
    stderr;
    constructor(opts) {
        this.service = opts.service;
        this.level = opts.level ?? 'info';
        this.format =
            opts.format ??
                ((typeof process !== 'undefined' && process.env?.BRIDGE_LOG_FORMAT === 'text')
                    ? 'text'
                    : 'json');
        this.boundCtx = opts.context ?? {};
        this.stdout = opts.stdout ?? {
            write: (s) => {
                if (typeof process !== 'undefined')
                    process.stdout.write(s);
            },
        };
        this.stderr = opts.stderr ?? {
            write: (s) => {
                if (typeof process !== 'undefined')
                    process.stderr.write(s);
            },
        };
    }
    /** Returns a child logger with merged bound context. */
    child(ctx) {
        return new Logger({
            service: this.service,
            level: this.level,
            format: this.format,
            context: { ...this.boundCtx, ...ctx },
            stdout: this.stdout,
            stderr: this.stderr,
        });
    }
    debug(msg, ctx = {}) {
        this.write('debug', msg, ctx);
    }
    info(msg, ctx = {}) {
        this.write('info', msg, ctx);
    }
    warn(msg, ctx = {}) {
        this.write('warn', msg, ctx);
    }
    error(msg, ctx = {}) {
        this.write('error', msg, ctx);
    }
    write(level, msg, ctx) {
        if (LEVEL_RANK[level] < LEVEL_RANK[this.level])
            return;
        const merged = { ...this.boundCtx, ...ctx };
        const ts = new Date().toISOString();
        const line = this.format === 'json'
            ? this.toJson(ts, level, msg, merged)
            : this.toText(ts, level, msg, merged);
        const sink = level === 'warn' || level === 'error' ? this.stderr : this.stdout;
        sink.write(line + '\n');
    }
    toJson(ts, level, msg, ctx) {
        return JSON.stringify({ ts, level, service: this.service, msg, ...ctx });
    }
    toText(ts, level, msg, ctx) {
        const lvl = level.toUpperCase().padEnd(5);
        const kvs = Object.entries(ctx)
            .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
            .join(' ');
        return `${ts} ${lvl} [${this.service}] ${msg}${kvs ? ' ' + kvs : ''}`;
    }
}
//# sourceMappingURL=logger.js.map