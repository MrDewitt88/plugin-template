import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'plugin-storage-foundation',
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
})
