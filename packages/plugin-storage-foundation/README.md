# @nexus-mindgarden/plugin-storage-foundation

SQLite-Connection + Migration-Pattern + Multi-Host-Storage-Pattern für Plugin-Provider.

## Quick Use

```ts
import {
  openConnection,
  migrate,
  resolvePaths,
  ensurePaths,
  type Migration,
} from '@nexus-mindgarden/plugin-storage-foundation'

const paths = resolvePaths({
  storageRoot: '/Users/me/Library/Application Support/my-plugin/plugins',
  pluginId: 'markview',
  hostId: 'teammind',
  tenantId: '00000000-0000-4000-8000-000000000001',
})
ensurePaths(paths) // creates tenantRoot + documents + versions dirs

const db = openConnection({ path: paths.dbPath })

const migrations: Migration[] = [
  {
    id: '0001_initial',
    up: (db) => db.exec('CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT)'),
    down: (db) => db.exec('DROP TABLE notes'),
  },
]

const result = migrate(db, migrations)
console.log('applied:', result.applied) // ['0001_initial']
```

## Architecture

```
src/
├── sqlite/
│   ├── driver.ts       # SqliteDb / SqliteStatement — runtime-agnostic surface
│   ├── connection.ts   # openConnection (better-sqlite3) + applyPragmas (any driver)
│   ├── migrations.ts   # migrate / rollbackTo + Migration-Type (typed to SqliteDb)
│   └── index.ts        # re-exports
└── fs/
    ├── multi-host-paths.ts  # resolvePaths + ensurePaths (runtime-agnostic)
    └── index.ts             # re-exports
```

## Runtime: Node/Electron vs. Bun (Drift #101)

`openConnection()` uses **`better-sqlite3`** — a native addon for **Node/Electron**. It does **not** load under **Bun** (`ERR_DLOPEN_FAILED`, Drift #101). Bun ships its own native `bun:sqlite`.

The migration + pragma + path layer is **runtime-agnostic** (v0.7.0): `migrate`/`rollbackTo`/`listApplied` and `applyPragmas` are typed against the structural `SqliteDb` interface, which both `better-sqlite3` and `bun:sqlite` satisfy without a cast. `resolvePaths`/`ensurePaths` are pure path logic.

**Bun-runtime plugin** — open the DB with `bun:sqlite`, reuse everything else:

```ts
import { Database } from 'bun:sqlite'
import {
  resolvePaths,
  ensurePaths,
  applyPragmas,
  migrate,
  type Migration,
} from '@nexus-mindgarden/plugin-storage-foundation'

const paths = resolvePaths({ storageRoot, pluginId: 'describe-mind', hostId, tenantId })
ensurePaths(paths)

const db = new Database(paths.dbPath) // bun-native, no better-sqlite3
applyPragmas(db) // same WAL/FK/busy-timeout defaults as Node
migrate(db, migrations) // identical migration helper
```

**Node/Electron plugin** — `openConnection()` as before (returns a full `better-sqlite3` `Database` with `.pragma()` etc.):

```ts
const db = openConnection({ path: paths.dbPath }) // pragmas already applied
migrate(db, migrations)
```

> Tenancy: write `tenant_id` + `user_id` as columns (+ index) in every table and `WHERE`-filter every query, per plug-db's `unifieddb-tenancy-contract`. The Foundation gives you connection + migrations + per-tenant paths; the plugin writes its own thin repo layer (prepared statements) — `mind-canva`'s `repo/*.ts` is the reference. There is no generic CRUD/repository helper by design.

## SQLite Pragmas (Defaults)

| Pragma         | Default  | Purpose                                           |
| -------------- | -------- | ------------------------------------------------- |
| `journal_mode` | `WAL`    | concurrent-read + serialized-write, durability OK |
| `foreign_keys` | `ON`     | referential-integrity                             |
| `synchronous`  | `NORMAL` | WAL-mode-default, fsync only at checkpoint        |
| `busy_timeout` | `5000`   | ms wait bei locked-rows                           |
| `temp_store`   | `MEMORY` | temp-tables in RAM                                |
| `cache_size`   | `-32000` | 32MB page-cache                                   |

Alle override-bar via `ConnectionOptions`.

## Multi-Host-Storage-Pattern

Plugin-Daten werden namespaced per `(host_id, tenant_id)`:

```
<storageRoot>/
  <plugin_id>/
    <host_id>/
      <tenant_id>/
        db.sqlite
        documents/...
        versions/...
```

Erlaubt mehreren Hosts (V8/Theseus/...) parallele Plugin-Daten ohne Cross-Tenant-Isolation-Bruch. `resolvePaths()` validiert path-traversal-safety (`..` / `/` / `\` rejected).

## Migration-Pattern

`migrate(db, migrations)` applied alle pending in ID-ascending-order. Idempotent — re-call skipped applied. Atomic-per-migration via transaction — failed up wirft, applied-row bleibt nicht persistiert.

`rollbackTo(db, migrations, targetId)` reverse-path bis (exclusive) target-id. Throws bei `down: null` (non-reversible) im Pfad.

## ABI-Awareness (Drift #11/#13/#20)

`better-sqlite3` ist native-binary. Wenn dein Plugin in mehreren Runtimes läuft (z.B. Node-CLI für Tests + Electron für App), brauchen die Binaries unterschiedliche ABIs.

`openConnection()` wirft `SqliteConnectionError({ code: 'abi_mismatch' })` wenn `NODE_MODULE_VERSION`-mismatch detected. Fix-Patterns:

- **Single-Runtime:** rebuild für target via `npm rebuild better-sqlite3 --build-from-source`
- **Multi-Runtime:** ABI-Cache-Pattern (siehe MarkView's `scripts/sqlite-abi.mjs`) — beide Binaries gecacht, swap-on-demand vor dev/test-Skripten via cp

## Testing

```sh
pnpm test       # vitest run
pnpm typecheck  # tsc --noEmit
```

Tests cover:

- `connection.test.ts` — pragmas (WAL/FK/busy_timeout), readonly mode, mkdir-parent, idempotent close
- `migrations.test.ts` — forward apply, idempotent re-run, atomic per-migration on failure, rollbackTo (reverse-path), non-reversible-throw
- `multi-host-paths.test.ts` — standard sub-paths, subPath helper, path-traversal rejection (`..` / `/` / hidden), idempotent ensurePaths

## License

MIT
