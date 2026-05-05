import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'plugin-mcp-foundation',
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
})
