import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/roundtrip/**/*.test.ts'],
    testTimeout: 120_000,
  },
});
