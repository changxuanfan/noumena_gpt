import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'jsdom',
    coverage: {
      reporter: ['text', 'html'],
    },
  },
})
