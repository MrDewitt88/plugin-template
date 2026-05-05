# {Plugin-Name} — SQLite Schema

> **TEMPLATE.** Nur kopieren wenn dein Plugin SQLite nutzt. Pattern aus MarkView's `mv_*`-tables + Kanban's `kanban_*`-tables. Tabellen-Prefix vermeidet Naming-Collisions wenn Plugin in fremder DB läuft (selten, aber defense).

---

## 1. Convention

- **Naming-Prefix:** `{plugin}_*` (e.g. `mv_documents`, `kanban_cards`)
- **Primary-Key:** `id TEXT PRIMARY KEY` mit UUID-v4-string
- **Timestamps:** `created_at TEXT NOT NULL DEFAULT (datetime('now'))`, `updated_at TEXT NOT NULL DEFAULT (datetime('now'))`
- **Foreign-Keys:** `ON DELETE CASCADE` für owned-relations, `ON DELETE RESTRICT` für critical-deps
- **Indexes:** für jede `WHERE`-Spalte in heißen Queries

---

## 2. Schema-Reference

### `{plugin}_{primary_entity}`

```sql
CREATE TABLE {plugin}_{primary_entity} (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,            -- multi-tenant-isolation
  host_id TEXT NOT NULL,              -- multi-host-namespacing
  -- ... domain-fields ...
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
) STRICT;

CREATE INDEX idx_{plugin}_{entity}_tenant ON {plugin}_{primary_entity}(tenant_id, host_id);
```

**Notes:**
- `STRICT` mode für column-type-enforcement (SQLite 3.37+)
- `tenant_id` + `host_id` ermöglicht multi-tenant + multi-host queries

### `{plugin}_{related_entity}`

```sql
CREATE TABLE {plugin}_{related_entity} (
  id TEXT PRIMARY KEY,
  parent_id TEXT NOT NULL REFERENCES {plugin}_{primary_entity}(id) ON DELETE CASCADE,
  -- ... fields ...
) STRICT;

CREATE INDEX idx_{plugin}_{related}_parent ON {plugin}_{related_entity}(parent_id);
```

---

## 3. Migrations

Use `@nexus/plugin-storage-foundation/sqlite` Migration-Pattern:

```ts
import type { Migration } from '@nexus/plugin-storage-foundation'

export const MIGRATIONS: Migration[] = [
  {
    id: '0001_initial',
    up: (db) => {
      db.exec(`
        CREATE TABLE {plugin}_{primary_entity} (
          ...
        ) STRICT;
        CREATE INDEX ...;
      `)
    },
    down: (db) => {
      db.exec(`DROP TABLE {plugin}_{primary_entity}`)
    },
  },
  // future migrations as 0002_, 0003_, ...
]
```

**Atomic-per-migration:** failed `up` keeps prior migrations applied (transaction rollback for failed one).

**Non-reversible:** SQLite-DROP-COLUMN ist tricky — wenn nicht supportbar, `down: null` setzen + dokumentieren. `rollbackTo()` wirft wenn non-reversible im rollback-path liegt.

---

## 4. Multi-Host-Storage-Path

```
<storageRoot>/
  {plugin}/                          # plugin_id
    <host_id>/                       # 'teammind' | 'theseus' | ...
      <tenant_id>/                   # UUID
        db.sqlite                    # this schema
        documents/                   # plugin-files (optional)
        versions/                    # plugin-versions (optional)
```

**Pflicht:** `tenant_id`-Spalte in jeder Tabelle damit cross-tenant-query NICHT versehentlich rows mixt. Plus `host_id` wenn Plugin in mehreren Hosts simultan läuft.

---

## 5. Data-Integrity Patterns

**Soft-Delete vs Hard-Delete:**
- Hard-Delete für transient/cache-data
- Soft-Delete (`deleted_at TIMESTAMP`) für audit-relevant rows. Index `WHERE deleted_at IS NULL` für active-queries

**Updated-At Trigger:**
```sql
CREATE TRIGGER {plugin}_{entity}_updated_at
AFTER UPDATE ON {plugin}_{primary_entity}
BEGIN
  UPDATE {plugin}_{primary_entity}
  SET updated_at = datetime('now')
  WHERE id = NEW.id;
END;
```

**Audit-Log (optional):**
```sql
CREATE TABLE {plugin}_audit_log (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete')),
  actor_user_id TEXT,
  actor_class TEXT,
  diff TEXT,                         -- JSON-stringified
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
) STRICT;
```

---

## 6. Performance-Hinweise

- **WAL-Mode default** (set by `@nexus/plugin-storage-foundation`): concurrent-reads OK, serialized writes
- **Prepare-Statements cachen:** `db.prepare('SELECT ...')` einmal, dann `.all()`/`.get()`/`.run()` reuse
- **VACUUM:** periodic (e.g. weekly) für reclaim-deleted-pages
- **Index-Strategy:** EXPLAIN QUERY PLAN für hot-paths. Composite-indexes wenn `WHERE a AND b` häufig

---

## 7. ABI-Awareness (Drift #11/#13/#20)

Plugin-Provider die in mehreren Runtimes laufen (Node-CLI für Tests + Electron für App):

`@nexus/plugin-storage-foundation` detected `NODE_MODULE_VERSION`-mismatch + wirft `SqliteConnectionError({ code: 'abi_mismatch' })`. Fix-Pattern:
- Single-Runtime: `npm rebuild better-sqlite3 --build-from-source`
- Multi-Runtime: ABI-Cache (siehe MarkView's `scripts/sqlite-abi.mjs`) — beide Binaries cached, swap-on-demand pre-test/dev

---

## 8. References

- `@nexus/plugin-storage-foundation` — Connection + Migrations + Multi-Host-Paths
- MarkView SQLite-Schema (Reference): `MrDewitt88/MarkView/packages/plugin-bridge/src/storage/`
- Kanban SQLite-Schema (Reference): `MrDewitt88/TeamMind-Kanban/packages/kanban-sqlite/`
- MarkView ABI-Dance (für multi-runtime): `MrDewitt88/MarkView/scripts/sqlite-abi.mjs` + `docs/SQLITE-ABI-DANCE.md`
