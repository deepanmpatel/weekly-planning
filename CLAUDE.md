# Weekly Planning — agent orientation

Personal multi-user task board. Stack:

- **web/** — Vite + React + TypeScript + Tailwind + TanStack Query + @dnd-kit
- **server/** — Express + TypeScript + Zod + supabase-js (used in local dev)
- **api/index.ts** — Vercel serverless wrapper that re-exports the Express app (used in production)
- **DB + Auth** — Supabase Postgres + Supabase Auth (Google OAuth + email allowlist)

Single Vercel project hosts everything; `vercel.json` rewrites `/api/(.*)` → the function.

## Build / run commands

```bash
npm install                                     # workspaces hoist
npm run dev                                     # web :5173, server :3001 (concurrently)
npm run dev:demo                                # web :5173 only, in-memory data, no backend/Supabase
npm --workspace asana-server run build          # tsc
npm --workspace asana-web run build             # tsc -b && vite build
npm run seed                                    # one-shot CSV import (bails if DB non-empty)
npm test                                        # vitest across both workspaces
```

## Demo mode

`npm run dev:demo` sets `VITE_DEMO_MODE=true` and runs only the Vite dev server. The frontend swaps the `http()` layer for an in-memory router under [web/src/lib/demo/](web/src/lib/demo/) and provides a fake auth session, so you can exercise the full UI (drag-drop, admin page, comments, activity log) without setting up Supabase. Refresh resets the data.

## Knowledge base map (read on demand)

| When you're working in… | Read first |
|---|---|
| `server/` (any backend change) | [server/CLAUDE.md](server/CLAUDE.md) |
| `web/` (any frontend change) | [web/CLAUDE.md](web/CLAUDE.md) |
| `api/` (Vercel wrapper) | [api/CLAUDE.md](api/CLAUDE.md) |
| `server/sql/` (migrations) | [server/sql/CLAUDE.md](server/sql/CLAUDE.md) |
| Designing a new feature | [docs/data-model.md](docs/data-model.md), [docs/api-contracts.md](docs/api-contracts.md) |
| Wondering *why* something is the way it is | [docs/adr/](docs/adr/) (architecture decision records) |

The `CLAUDE.md` files in subfolders are auto-loaded by Claude Code when you work in that directory. Files under `docs/` are NOT auto-loaded — `Read` them when relevant. Keep CLAUDE.md files tight; put depth in `docs/`.

## Agent workflow

1. **architect** — designs feature, asks user to validate
2. (user approves)
3. **test-engineer** (red phase) — stubs failing tests from the test plan
4. **backend-dev** + **frontend-dev** — implement in parallel where independent
5. **test-engineer** (green phase) — fills in tests, runs unit + integration + smoke E2E
6. **doc-keeper** — reads `git diff`, updates affected CLAUDE.md / docs/ files

Agent definitions: [.claude/agents/](.claude/agents/).

## Hard rules

- Service-role Supabase key lives only in `server/`. The browser uses `@supabase/supabase-js` for OAuth only — all data goes through the Express layer.
- ESM throughout. `server/` and `api/` import with explicit `.js` suffix.
- Migrations are additive, numbered (`0001_…sql`), and idempotent. Schema.sql is the canonical fold-in.
- Subtasks are tasks (`tasks.parent_task_id`). Don't propose a separate table.
- Single shared `TaskCard` everywhere a task renders. Add a prop, don't fork.
- **Demo-mode parity is required.** Every Express route also has a handler in [web/src/lib/demo/demoStore.ts](web/src/lib/demo/demoStore.ts). Adding/changing a route without updating its demo handler is an incomplete change. See [web/src/lib/demo/CLAUDE.md](web/src/lib/demo/CLAUDE.md).

## After every meaningful change

Invoke the **doc-keeper** agent. It reads the diff and updates only the affected docs. Don't hand-edit knowledge base files unless fixing a typo — let the doc-keeper own that surface so it stays consistent.
