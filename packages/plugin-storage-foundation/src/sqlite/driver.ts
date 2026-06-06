// Runtime-agnostic SQLite surface (v0.7.0, Drift #101).
//
// Both `better-sqlite3` (Node/Electron) and `bun:sqlite` (Bun) satisfy this
// interface STRUCTURALLY — their `Database`/`Statement` classes are assignable
// without any cast. The migration helpers (migrate/rollbackTo/listApplied) and
// applyPragmas() are typed against THIS surface, not against better-sqlite3, so
// a Bun-runtime plugin can open `new Database(path)` from `bun:sqlite` and reuse
// the whole Foundation storage layer.
//
// Why this exists: `better-sqlite3` is a native addon that does NOT load under
// Bun (`ERR_DLOPEN_FAILED`, Drift #101 — plug-helix, Describe-Mind). Bun ships
// its own native `bun:sqlite`. Rather than couple the Foundation to one driver,
// we depend only on the tiny shared synchronous-SQLite surface both expose.

/** Prepared-statement surface shared by better-sqlite3 + bun:sqlite. */
export interface SqliteStatement {
  /** Run + return all rows. */
  all(...params: unknown[]): unknown[]
  /** Run + return first row (or undefined). */
  get(...params: unknown[]): unknown
  /** Execute (INSERT/UPDATE/DELETE/DDL). Return value is driver-specific. */
  run(...params: unknown[]): unknown
}

/**
 * Minimal synchronous SQLite database surface. better-sqlite3's `Database` and
 * bun:sqlite's `Database` both satisfy this without a cast.
 *
 * Intentionally narrow — only the members the Foundation's migration + pragma
 * helpers actually use. Driver-specific extras (better-sqlite3's `.pragma()`,
 * bun's `.query()`) are NOT part of the contract; portable code uses `.exec()`
 * with raw `PRAGMA …` statements instead (see applyPragmas).
 */
export interface SqliteDb {
  /** Execute one or more semicolon-separated statements (no params, no result rows). */
  exec(sql: string): unknown
  /** Compile a statement. */
  prepare(sql: string): SqliteStatement
  /**
   * Wrap `fn` in a transaction. Returns a callable that runs `fn` inside
   * BEGIN/COMMIT (ROLLBACK on throw). Both drivers model this after
   * better-sqlite3's `transaction()`.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transaction(fn: (...args: any[]) => any): (...args: any[]) => any
  /** Close the connection. Optional — present on both drivers. */
  close?(): void
}
