import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'plugin-svelte-foundation',
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
})
