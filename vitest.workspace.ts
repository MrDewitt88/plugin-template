// Per-package vitest-config-discovery — jedes packages/<name>/vitest.config.ts
// läuft isoliert. Lesson aus MarkView/Kanban: shared workspace-config kann
// native-binary-conflicts (better-sqlite3 ABI) auslösen wenn Tests + dev
// gleichzeitig laufen.

import { defineWorkspace } from 'vitest/config'

export default defineWorkspace(['packages/*/vitest.config.ts', 'tools/*/vitest.config.ts'])
