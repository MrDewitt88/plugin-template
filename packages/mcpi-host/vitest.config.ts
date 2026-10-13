import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: { name: 'mcpi-host', include: ['test/**/*.test.ts'], environment: 'node' },
})
