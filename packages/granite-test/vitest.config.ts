// Per-package vitest config (Lesson aus MarkView/Kanban: shared workspace-config
// kann native-binary-Conflicts auslösen). See plugin-bridge-foundation for pattern.
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    coverage: {
      reporter: ['text', 'json'],
    },
  },
})
