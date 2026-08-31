# FlowBoard

Issue tracking and project management for small teams — a Linear-inspired
build, developed in stages as a learning project.

> **Status: early.** The application shell and dashboard are built. There is no
> authentication and no database yet, so the dashboard renders from a mock data
> file. See the roadmap below for what is real and what is not.

## Stack

| Layer     | Choice                        |
| --------- | ----------------------------- |
| Framework | Next.js 16 (App Router)       |
| UI        | React 19, Tailwind CSS 4      |
| Language  | TypeScript                    |
| Bundler   | Turbopack (Next 16 default)   |
| Icons     | lucide-react                  |

Dependencies are added only when something needs them. Current runtime deps
beyond the framework: `clsx` + `tailwind-merge` (class merging with conflict
resolution) and `lucide-react` (icons).

## Running locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

Then open the URL the dev server prints. It picks the first free port, so this
is not always 3000.

## Architecture notes

- `src/app/(dashboard)/` — route group. The parentheses keep the folder name
  out of the URL, so `/dashboard` and `/issues` share one layout.
- `src/components/layout/` — the app shell. The layout is a Server Component;
  only `Header` and `Sidebar` opt into the client bundle, because only they
  need `usePathname` and drawer state.
- `src/lib/mock-data.ts` — **temporary.** Deleted once Prisma lands.
- Design tokens live in `@theme inline` inside `src/app/globals.css`. Tailwind 4
  is CSS-first; there is no `tailwind.config.js`.

## Roadmap

- [x] **1. Foundation** — Next.js, TypeScript, Tailwind, ESLint, env setup
- [x] **2. UI architecture** — app shell, responsive layout, server/client split
- [ ] **3. Authentication** — Auth.js, sessions, protected routes
- [ ] **4. Database** — PostgreSQL + Prisma
- [ ] **5. Issue management** — CRUD, assignees, priorities, labels
- [ ] **6. Kanban board** — drag and drop with optimistic updates
- [ ] **7. AI layer** — issue summaries, generation, semantic search
- [ ] **8. Production** — Redis, rate limiting, WebSockets, tests, CI/CD

## Known issues

- `/dashboard` is statically prerendered, so its time-based greeting is frozen
  at build time. This resolves itself in Stage 3, when reading the session
  makes the route dynamic.
- The mobile navigation drawer is implemented but not yet verified on a real
  device.
