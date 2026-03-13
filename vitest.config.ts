import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,       
    environment: 'node',
    include: ['**/*.{test,spec,vitest}.?(c|m)[jt]s?(x)'],
  },
})
