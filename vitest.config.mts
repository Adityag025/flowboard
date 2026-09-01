import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * Two suites, separated on purpose.
 *
 *   *.test.ts     -- pure unit tests. No database, no network, milliseconds.
 *   *.dbtest.ts   -- integration tests that hit the real Postgres from
 *                    docker-compose. Slower, and they FAIL LOUDLY rather than
 *                    silently skipping when the database is not running.
 *
 * Why not mock Prisma for the second group: the things worth testing there are
 * precisely the things a mock cannot tell you -- that a composite unique index
 * really rejects a duplicate, that an atomic increment really serialises under
 * concurrency, that a membership filter really excludes another tenant's rows.
 * A mocked Prisma would happily confirm whatever we told it to.
 */
export default defineConfig({
  test: {
    environment: "node",
    // .tsx as well as .ts -- component tests exist and were silently not being
    // collected, which is the worst failure mode for a test suite: green because
    // nothing ran.
    include: [
      "src/**/*.test.{ts,tsx}",
      "src/**/*.dbtest.ts",
      "tests/**/*.dbtest.ts",
    ],
    // The DB tests share one Postgres instance and one seeded workspace, so
    // running files in parallel would have them fighting over the same rows.
    fileParallelism: false,
    setupFiles: ["tests/setup.ts"],
    coverage: {
      provider: "v8",
      include: ["src/lib/**"],
      // UI and generated code are excluded: components are covered by the
      // browser-level checks, and asserting on generated Prisma output tests
      // Prisma, not us.
      exclude: ["src/generated/**", "src/lib/db.ts", "**/*.d.ts"],
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
