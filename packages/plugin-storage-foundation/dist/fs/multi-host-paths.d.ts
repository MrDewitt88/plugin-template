export interface MultiHostPathOptions {
    /** Absolute path zur storageRoot (z.B. <userData>/plugins). */
    storageRoot: string;
    /** Plugin-id (kebab-case, matches manifest.id). */
    pluginId: string;
    /** Host-id (z.B. 'teammind', 'theseus'). */
    hostId: string;
    /** Tenant-id (UUID). */
    tenantId: string;
}
export interface ResolvedPaths {
    /** Tenant-Root: <storageRoot>/<plugin>/<host>/<tenant>/ */
    tenantRoot: string;
    /** SQLite-DB: <tenantRoot>/db.sqlite */
    dbPath: string;
    /** Documents-Dir: <tenantRoot>/documents */
    documentsDir: string;
    /** Versions-Dir: <tenantRoot>/versions */
    versionsDir: string;
    /** Generic sub-path-helper: tenantRoot/<sub> */
    subPath(...segments: string[]): string;
}
/**
 * Resolve standard-paths für (plugin, host, tenant). Validiert path-
 * traversal-safety (segments dürfen nicht `..` oder absolute paths sein).
 */
export declare function resolvePaths(opts: MultiHostPathOptions): ResolvedPaths;
/**
 * Auto-mkdir alle Standard-Subdirs (documents + versions). Idempotent.
 * SQLite-File wird NICHT erstellt — `openConnection` macht das via
 * mkdir(parentDir).
 */
export declare function ensurePaths(paths: ResolvedPaths): void;
//# sourceMappingURL=multi-host-paths.d.ts.map