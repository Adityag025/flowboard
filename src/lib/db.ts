import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";

/**
 * A single PrismaClient for the whole process.
 *
 * TWO things are going on here.
 *
 * 1. THE DRIVER ADAPTER (new in Prisma 7, and required)
 *    Prisma 6 and earlier shipped a Rust query engine binary that talked to
 *    Postgres directly. Prisma 7 drops it in favour of a real JS driver -- so
 *    `new PrismaClient()` with no adapter is now a type error. PrismaPg wraps
 *    node-postgres and owns the connection pool.
 *
 * 2. THE GLOBAL CACHE (a Next.js dev-server problem)
 *    Next hot-reloads modules on every save. A plain module constant would
 *    construct a NEW client per reload, each with its own pool, until Postgres
 *    refuses connections with "too many clients already" -- a failure that
 *    looks like a database bug and is really a bundler artifact. Globals
 *    survive hot reload; the module registry does not.
 *
 *    Production starts the process once, so the cache is skipped there.
 */
const createPrismaClient = () =>
  new PrismaClient({
    adapter: new PrismaPg({
      connectionString: process.env.DATABASE_URL,
    }),
    // Surface warnings while learning; stay quiet in production.
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
};

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
