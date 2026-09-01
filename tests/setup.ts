import { config as loadEnv } from "dotenv";

/**
 * Tests read the same .env.local the app and the Prisma CLI read, so there is
 * one source of truth for DATABASE_URL rather than a separate test config that
 * can drift.
 */
loadEnv({ path: ".env.local" });
