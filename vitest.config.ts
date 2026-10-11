import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 20_000,
    hookTimeout: 20_000,
    coverage: {
      provider: 'v8',
      include: ['src/tools/**/*.ts', 'src/anki/**/*.ts'],
      exclude: [
        // Test/demo backend: the in-memory AnkiConnect emulator is exercised as
        // the backend of every integration test but is not production code.
        'src/anki/mock/**',
        '**/index.ts',
      ],
      reporter: ['text', 'json-summary', 'html', 'lcov'],
      thresholds: {
        lines: 80,
        statements: 80,
        functions: 80,
        branches: 75,
      },
    },
  },
});
