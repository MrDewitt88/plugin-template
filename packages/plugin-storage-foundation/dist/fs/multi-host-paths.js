// Multi-Host-Storage-Pattern: Plugin-Daten werden namespaced per
// (host_id, tenant_id) damit mehrere Hosts (V8/Theseus/...) parallel
// Plugin-Daten ohne Cross-Tenant-Isolation-Bruch ablegen können.
//
// Standard-Layout:
//   <storageRoot>/
//     <plugin_id>/
//       <host_id>/
//         <tenant_id>/
//           db.sqlite        — plugin-data
//           documents/...    — plugin-files
//           versions/...     — plugin-versions
//
// Reference-Pattern: MarkView's storage-migration.ts (atomic copy +
// host_id/tenant_id namespacing). Plus MarkView-Phase-2 Trigger 2
// configurable storageRoot via App-Settings (Phase-3 BACKLOG für
// Plugin-Foundation).
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
/**
 * Resolve standard-paths für (plugin, host, tenant). Validiert path-
 * traversal-safety (segments dürfen nicht `..` oder absolute paths sein).
 */
export function resolvePaths(opts) {
    validateSegment(opts.pluginId, 'pluginId');
    validateSegment(opts.hostId, 'hostId');
    validateSegment(opts.tenantId, 'tenantId');
    const tenantRoot = resolve(opts.storageRoot, opts.pluginId, opts.hostId, opts.tenantId);
    // Re-check that resolved path is INSIDE storageRoot (defense gegen
    // unexpected resolve-behavior)
    const root = resolve(opts.storageRoot);
    if (!tenantRoot.startsWith(root + '/') && tenantRoot !== root) {
        throw new Error(`resolved tenantRoot '${tenantRoot}' is outside storageRoot '${root}' — path-traversal attempt?`);
    }
    return {
        tenantRoot,
        dbPath: join(tenantRoot, 'db.sqlite'),
        documentsDir: join(tenantRoot, 'documents'),
        versionsDir: join(tenantRoot, 'versions'),
        subPath: (...segments) => {
            segments.forEach((s) => validateSegment(s, 'subPath segment'));
            return join(tenantRoot, ...segments);
        },
    };
}
/**
 * Auto-mkdir alle Standard-Subdirs (documents + versions). Idempotent.
 * SQLite-File wird NICHT erstellt — `openConnection` macht das via
 * mkdir(parentDir).
 */
export function ensurePaths(paths) {
    mkdirSync(paths.tenantRoot, { recursive: true });
    mkdirSync(paths.documentsDir, { recursive: true });
    mkdirSync(paths.versionsDir, { recursive: true });
}
function validateSegment(segment, label) {
    if (typeof segment !== 'string' || segment.length === 0) {
        throw new Error(`${label} must be non-empty string`);
    }
    if (segment.includes('..') || segment.includes('/') || segment.includes('\\')) {
        throw new Error(`${label} cannot contain '..' or path separators: ${segment}`);
    }
    if (segment.startsWith('.')) {
        throw new Error(`${label} cannot start with '.' (hidden-file): ${segment}`);
    }
}
//# sourceMappingURL=multi-host-paths.js.map