import { defineConfig } from 'vitest/config';

/**
 * Mobile/unit tests run in ordinary Node. Worker integration tests need the
 * Workerd pool and are owned by `server/vitest.config.ts`.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
