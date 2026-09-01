/**
 * Verifies the AI summary cache WITHOUT calling the model.
 *
 * Seeds a sentinel summary plus the correct input hash, so a cache hit is
 * provable: with no ANTHROPIC_API_KEY configured, any cache MISS must fail with
 * 503. So "200 + sentinel text" can only mean the cache short-circuited before
 * the model was ever needed.
 *
 * Run with: npx tsx scripts/ai-cache-check.ts <seed|rehash|show>
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { config as loadEnv } from "dotenv";

import { PrismaClient } from "../src/generated/prisma/client";
import { summaryInputHash, type IssueForSummary } from "../src/lib/ai/prompts";

loadEnv({ path: ".env.local" });

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const SENTINEL = "SENTINEL-CACHED-SUMMARY: this text came from Postgres, not the model.";

async function load() {
  const issue = await db.issue.findFirstOrThrow({
    where: { number: 121, project: { key: "FLOW" } },
    select: {
      id: true,
      number: true,
      title: true,
      description: true,
      status: true,
      priority: true,
      aiSummary: true,
      aiSummaryHash: true,
      updatedAt: true,
      project: { select: { key: true } },
      comments: {
        orderBy: { createdAt: "asc" },
        select: { body: true, author: { select: { name: true } } },
      },
    },
  });

  const forSummary: IssueForSummary = {
    key: `${issue.project.key}-${issue.number}`,
    title: issue.title,
    description: issue.description,
    status: issue.status,
    priority: issue.priority,
    comments: issue.comments.map((c) => ({
      author: c.author?.name ?? "Deleted user",
      body: c.body,
    })),
  };

  return { issue, hash: summaryInputHash(forSummary) };
}

async function main() {
  const mode = process.argv[2] ?? "show";
  const { issue, hash } = await load();

  if (mode === "seed") {
    await db.issue.update({
      where: { id: issue.id },
      data: { aiSummary: SENTINEL, aiSummaryAt: new Date(), aiSummaryHash: hash },
    });
    console.log(`seeded sentinel summary with hash ${hash.slice(0, 16)}...`);
  } else {
    console.log(`current input hash: ${hash.slice(0, 16)}...`);
    console.log(`stored hash:        ${issue.aiSummaryHash?.slice(0, 16) ?? "(none)"}...`);
    console.log(`hashes match:       ${issue.aiSummaryHash === hash}`);
    console.log(`updatedAt:          ${issue.updatedAt.toISOString()}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
