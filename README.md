# FlowBoard

Issue tracking and project management for small teams — a Linear-inspired
build, developed in stages as a learning project.

> **Status: in progress.** Authentication works and the full domain schema is
> live -- the dashboard reads real issues, labels and counts from Postgres.
> There is no UI yet for creating or editing issues; that is Stage 5.

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
| Icons     | lucide-react                  |

Dependencies are added only when something needs them. Current runtime deps
beyond the framework: `clsx` + `tailwind-merge` (class merging with conflict
resolution) and `lucide-react` (icons).

## Running locally

```bash
npm install
cp .env.example .env.local          # then generate your own AUTH_SECRET
npm run db:up                       # Postgres 16 in Docker on port 5434
npx prisma migrate dev              # create the schema (also runs the seed)
npm run dev                         # http://localhost:3100
```

Sign up in the browser, then give yourself sample issues:

```bash
npm run db:seed                     # idempotent; safe to re-run
```

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
- `src/lib/db.ts` — Prisma client singleton, cached on `globalThis`. Next
  hot-reloads modules on every save; a plain module constant would open a fresh
  connection pool per reload until Postgres refused connections.
- `src/lib/issues.ts` — maps database enums to human labels and badge colours,
  guarded by `satisfies` so a new enum value without a label fails the build.
- Design tokens live in `@theme inline` inside `src/app/globals.css`. Tailwind 4
  is CSS-first; there is no `tailwind.config.js`.

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
- [ ] **5. Issue management** — CRUD, assignees, priorities, labels
- [ ] **6. Kanban board** — drag and drop with optimistic updates
- [ ] **7. AI layer** — issue summaries, generation, semantic search
- [ ] **8. Production** — Redis, rate limiting, WebSockets, tests, CI/CD

## Known issues

- The dashboard greeting uses the **server's** clock, not the visitor's, so it
  is wrong for users in other timezones. Correct fix is a timezone on the user
  profile.
- There is no UI for creating, editing or assigning issues yet — the seed
  script is currently the only way to get data in.
- The mobile drawer's open/close logic is verified, but its rendering at a real
  mobile viewport is not.
- One dev-only advisory is accepted rather than fixed: `deepmerge-ts` stack
  exhaustion, reachable only through the `prisma` CLI. npm's suggested remedy
  is a downgrade to Prisma 6.
