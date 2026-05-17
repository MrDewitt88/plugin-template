// JSON-Lines structured logger — dependency-free, 4 levels, ctx-Maps.
// Reference-Pattern: plug-elec packages/etmind-bridge/src/logger.ts (msg #240)
// + plug-db services/bridge/app/main.py (OBS2). Cross-language consistency.
//
// Format-Override via env BRIDGE_LOG_FORMAT=text (default 'json').
// warn/error routet zu stderr; info/debug zu stdout (syslog-Convention).

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'
export type LogFormat = 'json' | 'text'

const LEVEL_RANK: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 }

export interface LogContext {
  [k: string]: unknown
}

export interface LoggerOptions {
  /** Service-Identity für `service`-field. Z.B. 'plugin-bridge', 'eamind-bridge'. */
  service: string
  /** Minimum-Level (incl). Default 'info'. */
  level?: LogLevel
  /** 'json' (default) oder 'text'. Override via env BRIDGE_LOG_FORMAT. */
  format?: LogFormat
  /** Bound context — merged in alle Log-Calls. */
  context?: LogContext
  /** Write-target. Default process.stdout/stderr. Inject custom für tests. */
  stdout?: { write: (s: string) => void }
  stderr?: { write: (s: string) => void }
}

export class Logger {
  private readonly service: string
  private readonly level: LogLevel
  private readonly format: LogFormat
  private readonly boundCtx: LogContext
  private readonly stdout: { write: (s: string) => void }
  private readonly stderr: { write: (s: string) => void }

  constructor(opts: LoggerOptions) {
    this.service = opts.service
    this.level = opts.level ?? 'info'
    this.format =
      opts.format ??
      ((typeof process !== 'undefined' && process.env?.BRIDGE_LOG_FORMAT === 'text')
        ? 'text'
        : 'json')
    this.boundCtx = opts.context ?? {}
    this.stdout = opts.stdout ?? {
      write: (s) => {
        if (typeof process !== 'undefined') process.stdout.write(s)
      },
    }
    this.stderr = opts.stderr ?? {
      write: (s) => {
        if (typeof process !== 'undefined') process.stderr.write(s)
      },
    }
  }

  /** Returns a child logger with merged bound context. */
  child(ctx: LogContext): Logger {
    return new Logger({
      service: this.service,
      level: this.level,
      format: this.format,
      context: { ...this.boundCtx, ...ctx },
      stdout: this.stdout,
      stderr: this.stderr,
    })
  }

  debug(msg: string, ctx: LogContext = {}): void {
    this.write('debug', msg, ctx)
  }
  info(msg: string, ctx: LogContext = {}): void {
    this.write('info', msg, ctx)
  }
  warn(msg: string, ctx: LogContext = {}): void {
    this.write('warn', msg, ctx)
  }
  error(msg: string, ctx: LogContext = {}): void {
    this.write('error', msg, ctx)
  }

  private write(level: LogLevel, msg: string, ctx: LogContext): void {
    if (LEVEL_RANK[level] < LEVEL_RANK[this.level]) return
    const merged: LogContext = { ...this.boundCtx, ...ctx }
    const ts = new Date().toISOString()
    const line =
      this.format === 'json'
        ? this.toJson(ts, level, msg, merged)
        : this.toText(ts, level, msg, merged)
    const sink = level === 'warn' || level === 'error' ? this.stderr : this.stdout
    sink.write(line + '\n')
  }

  private toJson(ts: string, level: LogLevel, msg: string, ctx: LogContext): string {
    return JSON.stringify({ ts, level, service: this.service, msg, ...ctx })
  }

  private toText(ts: string, level: LogLevel, msg: string, ctx: LogContext): string {
    const lvl = level.toUpperCase().padEnd(5)
    const kvs = Object.entries(ctx)
      .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
      .join(' ')
    return `${ts} ${lvl} [${this.service}] ${msg}${kvs ? ' ' + kvs : ''}`
  }
}
