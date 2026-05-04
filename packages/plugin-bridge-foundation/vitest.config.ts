import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'plugin-bridge-foundation',
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
})
