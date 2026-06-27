import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'plugin-license-foundation',
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
})
