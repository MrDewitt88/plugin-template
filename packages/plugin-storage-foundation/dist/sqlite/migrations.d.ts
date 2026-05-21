import type { Database as DatabaseType } from 'better-sqlite3';
export interface Migration {
    /** Monotonic ID, z.B. "0001_initial" */
    id: string;
    /** Forward-migrate. Wird in transaction gewrappt. */
    up: (db: DatabaseType) => void;
    /** Rollback. Wird in transaction gewrappt. Optional — wenn null,
        dann ist diese Migration "non-reversible". */
    down: ((db: DatabaseType) => void) | null;
}
export interface MigrateResult {
    applied: string[];
    skipped: string[];
}
/**
 * Apply alle pending migrations in order. Returns summary.
 * Throws wenn eine Migration in der up-Phase wirft — bisherige
 * applied-rows bleiben (atomic-per-migration via transaction).
 */
export declare function migrate(db: DatabaseType, migrations: readonly Migration[]): MigrateResult;
/**
 * Rollback bis (NICHT inkl.) target-id. Migrations werden in
 * descending order angewendet. Wenn eine Migration `down: null` hat,
 * wird der Rollback abgebrochen mit Fehler.
 *
 * Beispiel: applied=['0001', '0002', '0003'], rollbackTo('0001')
 * → '0003'.down() + '0002'.down() applied; '0001' bleibt.
 */
export declare function rollbackTo(db: DatabaseType, migrations: readonly Migration[], targetId: string): {
    rolledBack: string[];
};
/**
 * Returns applied migration-ids in ascending order (für introspection).
 */
export declare function listApplied(db: DatabaseType): string[];
//# sourceMappingURL=migrations.d.ts.map