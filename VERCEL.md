# Deploying to Vercel

## Build command

`prisma generate && next build`, set in `vercel.json` so it is version-controlled
rather than living only in a dashboard someone has to remember to configure.

`prisma generate` is required because the Prisma client is generated code and
gitignored — without it, every import of `@/generated/prisma/client` fails to
compile.

## Migrations are NOT in the build command

Deliberately. `prisma migrate deploy` in a build looks convenient and is a
footgun:

- Vercel builds **preview** deployments for every branch and PR. A migration in
  the build command means every preview branch migrates whatever database its
  env vars point at — usually production.
- Concurrent builds would run migrations concurrently. Prisma takes an advisory
  lock so they serialise rather than corrupt, but a build that blocks on another
  build's migration is a confusing failure.

Run them as a release step instead:

```bash
DATABASE_URL="<production url>" npx prisma migrate deploy
```

Or from the built image:

```bash
docker run --rm -e DATABASE_URL="<production url>" flowboard npx prisma migrate deploy
```

## Required environment variables

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | **yes** | Pooled Postgres connection string. Nothing renders without it. |
| `AUTH_SECRET` | **yes** | `openssl rand -base64 32`. A *different* value per environment. |
| `NEXT_PUBLIC_APP_URL` | yes | The deployment's own URL. Used for absolute links. |
| `REDIS_URL` | no | Without it, rate limiting degrades to per-process in-memory. |
| `AI_PROVIDER` / `AI_API_KEY` / `AI_MODEL` / `AI_BASE_URL` | no | Without them the AI panels show a "not configured" note. **A local Ollama is not reachable from Vercel** — a deployed instance needs a hosted provider. |

## Serverless considerations that actually bite

**Connection pooling.** Every serverless invocation can open its own database
connection, and Postgres has a hard `max_connections`. A direct connection
string will exhaust it under any real traffic. Use the provider's **pooled**
endpoint (Neon's pooler, Supabase's pgBouncer port, or Prisma Accelerate) — for
pgBouncer in transaction mode, append `?pgbouncer=true&connection_limit=1`.

**Realtime does not work on Vercel's default runtime.** `/api/realtime/board/*`
holds an open SSE connection and subscribes to Redis pub/sub. Serverless
functions have an execution ceiling, so the stream is cut when it is reached, and
the browser reconnects in a loop. Options: accept the reconnect churn, move that
one route to a long-running host, or drop realtime in the hosted deployment. It
is not a correctness problem — the board still works, it just stops updating on
its own.

**The in-memory rate-limit fallback is per-invocation on serverless**, which is
close to no limit at all across many concurrent instances. If AI is enabled in a
deployed environment, a shared `REDIS_URL` stops being optional.
