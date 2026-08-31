# FlowBoard

Issue tracking and project management for small teams — a Linear-inspired
build, developed in stages as a learning project.

> **Status: early.** Authentication and the database are working -- you can
> sign up, sign in, and reach protected routes. The dashboard's stats and issue
> list are still mock data. See the roadmap for what is real and what is not.

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
npx prisma migrate dev              # create the schema
npm run dev                         # http://localhost:3100
```

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
- `src/lib/mock-data.ts` — **temporary.** Deleted once real issues exist.
- Design tokens live in `@theme inline` inside `src/app/globals.css`. Tailwind 4
  is CSS-first; there is no `tailwind.config.js`.

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
- [ ] **4. Database** — full schema: workspaces, projects, issues, comments
- [ ] **5. Issue management** — CRUD, assignees, priorities, labels
- [ ] **6. Kanban board** — drag and drop with optimistic updates
- [ ] **7. AI layer** — issue summaries, generation, semantic search
- [ ] **8. Production** — Redis, rate limiting, WebSockets, tests, CI/CD

## Known issues

- The dashboard greeting uses the **server's** clock, not the visitor's, so it
  is wrong for users in other timezones. Correct fix is a timezone on the user
  profile.
- The mobile navigation drawer is implemented but not yet verified on a real
  device.
- Stats and the recent-issues list are mock data.
- One dev-only advisory is accepted rather than fixed: `deepmerge-ts` stack
  exhaustion, reachable only through the `prisma` CLI. npm's suggested remedy
  is a downgrade to Prisma 6.
