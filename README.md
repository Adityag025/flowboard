# FlowBoard

Issue tracking and project management for small teams — a Linear-inspired
build, developed in stages as a learning project.

> **Status: in progress.** Sign up, create issues, assign them, set priorities,
> add labels, comment, filter, page through the list, drag cards across a Kanban
> board, and use Claude to summarize an issue or draft one from free text.
> 115 tests and CI. Remaining: realtime, background jobs, logging/monitoring,
> and deployment.

> **Note:** the AI features run on a **free local model by default** (Ollama,
> no account and no per-request cost) and are verified end to end against it.
> The Anthropic path is implemented but has never made a live call — no key was
> available where it was written.

## Stack

| Layer     | Choice                        |
| --------- | ----------------------------- |
| Framework | Next.js 16 (App Router)       |
| UI        | React 19, Tailwind CSS 4      |
| Language  | TypeScript                    |
| Bundler   | Turbopack (Next 16 default)   |
| Database  | PostgreSQL 16 + Prisma 7      |
| Auth      | Auth.js v5 (credentials, JWT) |
| Validation| Zod                           |
| AI        | Any provider (see below)      |
| Cache     | Redis (rate limiting)         |
| Realtime  | SSE + Redis pub/sub           |
| Logging   | JSON to stdout                |
| Testing   | Vitest                        |
| CI        | GitHub Actions                |
| Icons     | lucide-react                  |

Dependencies are added only when something needs them. Current runtime deps
beyond the framework: `clsx` + `tailwind-merge` (class merging with conflict
resolution) and `lucide-react` (icons).

## Running locally

```bash
npm install
cp .env.example .env.local          # then generate your own AUTH_SECRET
npm run db:up                       # Postgres 16 (5434) + Redis 7 (6380)
npx prisma migrate dev              # create the schema (also runs the seed)
npm run dev                         # http://localhost:3100
```

Sign up in the browser, then give yourself sample issues:

```bash
npm run db:seed                     # idempotent; safe to re-run
```

## AI with no API key and no cost

The default configuration uses [Ollama](https://ollama.com), which runs a model
on your own machine. No account, no key, no per-request billing, works offline.

```bash
ollama serve            # if it is not already running
npm run ai:pull         # downloads qwen2.5:3b (~1.9 GB)
npm run ai:check        # confirms the provider is configured and reachable
```

`.env.local` then needs:

```ini
AI_PROVIDER="openai"
AI_API_KEY="ollama"     # ignored by Ollama, but must be non-empty
AI_MODEL="qwen2.5:3b"
AI_BASE_URL="http://localhost:11434/v1"
```

`npm run ai:check` exists because "not configured" has several distinct causes —
no key, a typo in `AI_PROVIDER`, a model that was never pulled, Ollama not
running — and they are indistinguishable from the UI. It only probes endpoints
that are free to probe; hitting a paid provider for a health check would bill you
for it.

**Measured on this setup** (qwen2.5:3b, CPU):

| | |
| --- | --- |
| Summarize, generated | ~16 s |
| Summarize, cached | ~37 ms |
| Cache speedup | **≈430×** |

That ratio is the empirical case for the summary cache. It would be worth having
against a fast hosted provider; against a local model on CPU it is the difference
between a usable feature and an unusable one.

**Quality at 3B is decent but not free of tells.** The summary respected the
two-paragraph structure and declined to invent a root cause, but ran ~110 words
against a 90-word instruction. The issue drafter produced a sensible title,
priority and labels, but added "data loss" to a description whose input never
mentioned it. Both are ordinary small-model behaviour — worth knowing before
trusting output unreviewed, and the reason the draft fills in a form you review
rather than creating the issue directly. A larger local model
(`qwen2.5:7b`, `llama3.1:8b`) or a hosted one follows instructions more closely.

## Deployment

Two supported shapes. Neither has been run against real infrastructure yet — the
image is built and verified locally, but nothing is deployed.

### Container

```bash
docker build -t flowboard .
docker run -p 3000:3000 \
  -e DATABASE_URL="postgresql://..." \
  -e AUTH_SECRET="$(openssl rand -base64 32)" \
  -e NEXT_PUBLIC_APP_URL="https://your-domain" \
  flowboard
```

Multi-stage build on `output: "standalone"`, so the runtime image carries no
build toolchain, no devDependencies and no source — 303 MB, running as a
non-root user. Verified end to end: the container connects to a real Postgres and
Redis, serves pages, and Docker's own healthcheck reports `healthy`.

Apply migrations as a **release step, not on boot** — two instances starting
simultaneously would both try to migrate:

```bash
docker run --rm -e DATABASE_URL="postgresql://..." flowboard \
  npx prisma migrate deploy
```

### Vercel

Managed Postgres and Redis (Neon, Supabase, Upstash) plus the env vars from
`.env.example`. Add `prisma generate && prisma migrate deploy` as the build
command, since the Prisma client is gitignored generated code.

### Health checks

`/api/health` distinguishes two things that are routinely conflated:

| | Endpoint | Meaning | On failure |
| --- | --- | --- | --- |
| Liveness | `/api/health` | The process is alive | Restart the container |
| Readiness | `/api/health?check=deep` | It can serve traffic | Remove from rotation, do **not** restart |

Wiring a liveness probe to the deep check restarts every instance at once during
a brief database blip — turning a recoverable dependency problem into a full
outage. So the deep check is opt-in, and the container's own `HEALTHCHECK` uses
the cheap one.

Redis being down reports **200**: rate limiting degrades to the in-memory
limiter and everything else works, so pulling instances from rotation would be
wrong. The database being down reports **503**, because there is no page worth
serving without it. Both verified by stopping the real containers.

The endpoint is unauthenticated — a probe cannot log in — which is why it returns
component up/down and nothing else. No versions, no connection strings, no error
detail; those are reconnaissance, and they belong in logs.

## Tests

```bash
npm test          # 143 unit tests. No database, no network, ~2s.
npm run test:db   # 31 integration tests against real Postgres + Redis.
npm run test:all  # everything (174)
```

The integration tests are deliberately **not mocked**. What is worth testing
there is exactly what a mock cannot tell you: that a composite unique index
really rejects a duplicate, that an atomic increment really serialises under
25-way concurrency, that a membership filter really excludes another tenant, that
30 concurrent rate-limit checks let through exactly ten. A mocked Prisma or Redis
would confirm whatever we told it to.

Fixtures are namespaced with a random token and torn down per file, so the suite
runs against the local dev database without wiping your work.

**After changing `schema.prisma`, restart the dev server.** The Prisma client
is cached on `globalThis` to survive hot reload (see below), which means a
newly generated client is *not* picked up until the process restarts. The
symptom is `Cannot read properties of undefined (reading 'findMany')`.

Generate a real session secret before signing in:

```bash
openssl rand -base64 32             # paste into AUTH_SECRET in .env.local
```

The port is pinned to 3100 deliberately. Auth callbacks must match a stable
URL, and letting Next pick the first free port made it move between restarts.

## Architecture notes

- `src/app/(dashboard)/` — route group. The parentheses keep the folder name
  out of the URL, so `/dashboard` and `/issues` share one layout.
- `src/components/layout/` — the app shell. The layout is a Server Component;
  only `Header` and `Sidebar` opt into the client bundle, because only they
  need `usePathname` and drawer state.
- `src/lib/auth/` — split in two on purpose. `config.ts` is Edge-safe and holds
  only what route protection needs; `index.ts` adds the Credentials provider and
  touches Prisma and bcrypt, so it is Node-only.
- `src/proxy.ts` — route protection. Next 16 renamed `middleware.ts` to
  `proxy.ts`. It is a gate, not the security boundary: every protected page
  re-checks `auth()` itself.
- `src/lib/authz.ts` — the real authorization boundary. See below.
- `src/lib/queries/` — read paths, shared between pages.
- `src/lib/actions/` — write paths, as Server Actions.
- `src/lib/db.ts` — Prisma client singleton, cached on `globalThis`. Next
  hot-reloads modules on every save; a plain module constant would open a fresh
  connection pool per reload until Postgres refused connections.
- `src/lib/issues.ts` — maps database enums to human labels and badge colours,
  guarded by `satisfies` so a new enum value without a label fails the build.
- Design tokens live in `@theme inline` inside `src/app/globals.css`. Tailwind 4
  is CSS-first; there is no `tailwind.config.js`.

### Security: Server Actions are public endpoints

This is the single most important thing to understand in this codebase. A Server
Action compiles to a **public HTTP endpoint**. React gives it an opaque id and
posts to it, but nothing stops anyone crafting that request by hand with any
arguments they like. "The button is only rendered for members" is a hint to
well-behaved browsers, not access control.

So every action independently establishes who is calling and whether they may
touch that specific row, and **never trusts an id from the payload**:

```ts
const userId  = await requireUserId();               // who
const project = await requireProjectAccess(id, userId); // may they?
```

Membership goes *inside* the `WHERE` clause, so a non-member's row is never
returned — rather than fetched and then filtered in JavaScript, where one
forgotten `if` becomes a data leak. Misses return "not found", never
"forbidden", because distinguishing the two confirms a row exists in someone
else's workspace.

Tenant isolation is asserted as a regression test:

```bash
npm run check:isolation
```

### UI state vs server state

The board is where this distinction becomes concrete. `issues` arrives as a prop
and is the truth; `optimisticIssues` is a local guess about what the server is
about to agree to. Cards move at once instead of waiting for a round trip.

The property that makes it safe is that optimistic state is never permanently
written. React discards it when the transition ends and re-derives from props —
so a rejected move reverts with **no rollback code of our own**.

A rejected move also raises a banner. The automatic revert alone is technically
correct, but the user would watch their card slide back and assume they
mis-dropped it. A silent revert is how people lose work without noticing.

### `boardOrder` is a float, and floats run out

A drop sets `boardOrder` to the midpoint of its neighbours, so one drag is one
row update rather than renumbering every row below it.

The part most write-ups omit: repeated drops between the *same* pair halve the
gap each time — 1000, 500, 250 — and after roughly 50 drops it falls below
float64 precision, the midpoint equals a neighbour, and the order silently
becomes ambiguous. So when the gap drops under `MIN_GAP` the column is renumbered
back to clean multiples: O(column) but rare, versus O(n) on *every* drag if we
used integers.

### Client Components inherit their imports' dependencies

A Client Component may import **types** from a server module — those are erased
at compile time. The moment it imports a **value**, it inherits that module's
entire dependency graph.

Importing one constant from `lib/queries/board.ts` pulled in `db` →
`@prisma/adapter-pg` → `pg`, and the build tried to bundle a TCP database driver
for the browser. Shared constants and types therefore live in files that touch
no database (`lib/board-types.ts`, `lib/issues.ts`).

Note that `next dev` reported this only as a misleading `ENOENT` on a build
manifest. **The real error appeared only under `npm run build`** — worth
remembering when a dev-only error makes no sense.

### AI: bring your own provider

Two adapters cover essentially every provider:

| Adapter | Covers | Configure with |
| --- | --- | --- |
| `anthropic` | Anthropic's API, via the official SDK — adaptive thinking, effort control, server-side refusal fallbacks | `ANTHROPIC_API_KEY` |
| `openai` | Anything speaking `/chat/completions`: OpenAI, Groq, Together, OpenRouter, Mistral, DeepSeek, Fireworks, vLLM, LM Studio, Ollama | `AI_PROVIDER=openai`, `AI_API_KEY`, `AI_MODEL`, `AI_BASE_URL` |

A bare `ANTHROPIC_API_KEY` still works with no other configuration. See
`.env.example` for copy-paste configs including a free local Ollama.

This is **not** a lowest-common-denominator abstraction — the interface is a
narrow waist, not a cap. The Anthropic adapter keeps its provider-specific
features; the OpenAI adapter still uses `json_schema` where the endpoint supports
it, falling back to `json_object` where it doesn't (Ollama and older gateways
`400` on the former).

Either way **our Zod validation is the guarantee**. Provider-side structured
output is an optimisation that makes valid output likelier, not a contract. And a
schema guarantees *shape*, not *content*: `resolveLabelIds` drops a label the
model invented rather than creating it. The model never decides what rows exist.

The `openai` adapter is raw `fetch` rather than the `openai` package — the
surface used is two endpoints and an SSE parser, and raw fetch makes it testable
against a local server with no credentials, which is how all 16 of its tests run.

### AI: which surface, and why

Everything else in this app is a Server Action. Summarize deliberately is not.

| Feature | Surface | Why |
| --- | --- | --- |
| Summarize an issue | **Route Handler**, streamed | Takes seconds. As an action the user stares at a spinner then gets a whole paragraph; streamed, the first words arrive in ~300ms. That *is* the feature. |
| Draft an issue from text | **Server Action**, structured | The form needs the whole object before it can populate anything. Half a title is useless, so there is nothing to stream — and we keep end-to-end type safety. |

The rule is not "Server Actions are better": *mutations that return a value →
Server Action; responses that arrive over time → Route Handler.*

### AI: cost control shipped with the feature

An LLM call is the first operation in this app that costs real money per
request, so rate limiting and caching are not Stage 8 polish here — an
unprotected endpoint is a button anyone can hold down to spend the owner's
budget.

**The cache is keyed on a hash of the summary inputs, not `updatedAt`.** That is
what makes it correct rather than merely fast: dragging a card changes
`updatedAt` but cannot change what the issue says, while a new comment must
invalidate. Verified all three ways.

**Rate limiting is in-memory, so it is per-process.** It resets on restart, and
two instances mean two budgets. It still stops the real cases — impatient
clicking, a looping client, one runaway account — and Stage 8 swaps the `Map`
for Redis in one file.

**There is no prompt caching**, despite the instinct to add it. The minimum
cacheable prefix is 1024–4096 tokens and these system prompts are a few hundred,
so a `cache_control` breakpoint would be silently ignored. The result cache in
Postgres is what saves money at this size.

### AI: model output is untrusted input

The Zod schema guarantees the **shape**, not the **content**. Titles are
truncated to the column width, and label names are resolved against the labels
actually fetched for that user — anything unmatched is dropped, never created.
The model is an untrusted source that happens to be helpful; it never decides
what rows exist.

On prompt injection: issue text is user-supplied, so anyone can write "ignore
your instructions" in a description. The content is fenced and labelled as data,
but the real mitigation is that these calls have **no tools and no side
effects** — the worst outcome is a wrong summary, not a deleted issue.
Capability, not clever prompting, is the defence. Neither is airtight.

### Pagination is keyset, not offset

The issue list is ordered by `updatedAt DESC`, and *any* edit bumps `updatedAt` —
a comment, a status change, a drag on the board. With `skip`/`take`, a row on
page 1 that gets edited while you read page 2 shifts everything down, so you see
a row twice; a row moving the other way is skipped entirely. On a busy tracker
that is not an edge case. Offset also degrades with depth.

Keyset says "rows after *this* row" instead of "skip 50": stable under
concurrent edits, and page 200 costs what page 1 costs. The trade is no page
numbers and no jumping to page 7 — hence "Next" rather than numbered pages.

The cursor carries **both** `updatedAt` and `id`, because `updatedAt` is not
unique; two issues touched in the same millisecond would make the boundary
ambiguous and the seam row would repeat or vanish.

### Rate limiting has two backends

Redis is the real one — shared across processes and instances, survives
restarts, a true sliding window via a sorted set (not `INCR`+`EXPIRE`, which is
a *fixed* window and allows a double burst at the boundary).

The in-memory limiter is the fallback when `REDIS_URL` is unset or Redis is
unreachable. It **fails open** into per-process limiting rather than failing
closed: a Redis blip should not disable a working feature for everyone, and a
looser bound still stops the cases that occur. "No limit at all" was never an
option. `RateLimitResult.backend` reports which one answered, so a degraded
limiter is visible rather than silent.

### The node-postgres overlap warning, and why it mattered

For several stages the app emitted:

> `client.query()` when the client is already executing a query is deprecated
> and will be removed in pg@9.0

I twice wrote this off — first blaming the array form of `$transaction` (wrong,
changing it didn't help), then calling it upstream because the stack was entirely
inside `@prisma/adapter-pg` (true, but a stack tells you *where*, not *why*).

Isolating it by experiment gave a precise trigger:

| Pattern | Result |
| --- | --- |
| `findMany` **with relations**, followed by another query, in the **same transaction** | **warns** |
| the same `findMany` with nothing after it in the transaction | clean |
| the same `findMany` outside a transaction | clean |
| a scalar-only `findMany` plus another query in a transaction | clean |

Prisma's query interpreter issues several queries to load relations, and a
following query in the same transaction overlaps them on that transaction's
single connection. Separate pooled queries each get their own connection.

This was not cosmetic: **pg@9 removes the behaviour**, so it was a thrown error
waiting for a dependency bump.

The fix was to stop wrapping `listIssues`' page and count in one transaction.
The cost is that `total` and the rows no longer share a snapshot, so a
concurrent insert can make the count disagree by one — acceptable, because
`total` is a display number and `nextCursor` comes from the rows, not the count.

`tests/no-pg-warning.dbtest.ts` fails if this returns, because a comment saying
"don't wrap these in a transaction" is one refactor away from being ignored.

### Data model notes

- **`WorkspaceMember` is an explicit join table**, not an implicit many-to-many,
  because membership carries a role and a join date. Once a relationship has
  attributes of its own, it is an entity.
- **Deleting a user cascades their memberships but `SET NULL`s their issues and
  comments.** Losing access must not erase the work they did.
- **Issue numbers come from an atomic counter column**, not `count(*) + 1`, so
  two simultaneous creates cannot both claim `FLOW-124`.
- **`boardOrder` is a float.** Integer positions mean one drag rewrites every
  row below it; floats let you insert at the midpoint of two neighbours.
- Project keys and slugs are unique **per workspace**, not globally.

### Prisma 7 gotchas

- `npm install prisma` installs a **release candidate** — the `latest`
  dist-tag points at `8.0.0-rc`. The CLI is pinned to `7.10.0` to match
  `@prisma/client`.
- A driver adapter is now mandatory (`@prisma/adapter-pg`); the Rust query
  engine is gone.
- Prisma no longer auto-loads `.env`. `prisma7.config.ts` loads `.env.local`
  explicitly, so the CLI and the app read the same file.

## Roadmap

- [x] **1. Foundation** — Next.js, TypeScript, Tailwind, ESLint, env setup
- [x] **2. UI architecture** — app shell, responsive layout, server/client split
- [x] **3. Authentication** — Auth.js, sessions, protected routes, logout
- [x] **4. Database** — PostgreSQL + Prisma, full domain schema, seeded
- [x] **5. Issue management** — create, assign, prioritise, label, comment, filter
- [x] **6. Kanban board** — drag and drop, optimistic updates, keyboard support
- [x] **7. AI layer** — streaming summaries, structured issue drafting
- [ ] **7b. AI, later** — project summaries, classification, semantic search
- [ ] **8. Production** — Redis, rate limiting, WebSockets, tests, CI/CD

## Known issues

- The dashboard greeting uses the **server's** clock, not the visitor's, so it
  is wrong for users in other timezones. Correct fix is a timezone on the user
  profile.
- Full-text search uses `contains` / ILIKE, which cannot use a btree index. Fine
  at this scale; Stage 8 replaces it with `tsvector` + GIN rather than
  pretending it scales.
- The issue list caps at 50 rows with no pagination yet.
- The board loads every issue in a project with no virtualisation; fine for
  hundreds, not for thousands.
- Reordering is last-write-wins. Two people dragging the same card at once will
  not corrupt anything, but the loser gets no notification.
- **The live AI model call is unverified** — built and typechecked, but never run
  against the real API. Prompt quality in particular is untuned.
- No background jobs. Nothing in the app currently needs deferred work, so no
  job runner has been added — speculative infrastructure is worse than none.
- No metrics or tracing. Logs are structured JSON to stdout, which a platform can
  ingest, but there are no counters or spans.
- Not deployed anywhere. The container image is built and verified against real
  Postgres and Redis locally, but nothing runs in a hosted environment.
- ~~node-postgres deprecation warning~~ — **fixed.** See below.
- Summaries are cached but never expire; only a content change regenerates one.
- There is no UI for creating projects, labels or workspaces — the seed script
  handles those.
- Issue titles and descriptions cannot be edited after creation yet.
- The mobile drawer's open/close logic is verified, but its rendering at a real
  mobile viewport is not.
- `pg` logs a deprecation warning about concurrent `client.query()` calls from
  array-form `$transaction`. Harmless today; worth revisiting when moving to
  `pg@9`.
- One dev-only advisory is accepted rather than fixed: `deepmerge-ts` stack
  exhaustion, reachable only through the `prisma` CLI. npm's suggested remedy
  is a downgrade to Prisma 6.
