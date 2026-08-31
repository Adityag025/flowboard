// Prisma 7 no longer auto-loads .env files, so we load them explicitly.
//
// We point dotenv at .env.local rather than .env on purpose: Next.js already
// treats .env.local as the place for local secrets, and having ONE file means
// the Prisma CLI and the running app can never disagree about DATABASE_URL.
import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

loadEnv({ path: ".env.local" });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
