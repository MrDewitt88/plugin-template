import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'create-plugin',
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
})
