# ADR 0001 — Deploy as a single Vercel project (UI + API together)

Date: 2026-04-24 · Status: accepted

## Context

The app has a Vite frontend (`web/`) and an Express backend (`server/`). Need free hosting with minimal credential management. Considered:

- **Split deploy**: Vercel for `web/`, Render for `server/`. Two env stores, two dashboards, free tier cold-starts on Render (~30s wake-up).
- **Single Vercel project**: wrap Express as a serverless function. One env store, no cold-start lag between layers.

## Decision

Single Vercel project. The Express app is exported from [server/src/app.ts](../../server/src/app.ts) and re-exported by a thin Vercel function at [api/index.ts](../../api/index.ts). [vercel.json](../../vercel.json) rewrites `/api/(.*)` → that function.

## Alternatives considered

- Split deploy with Render — cold-starts on free tier are user-visible; two env stores doubles the secrets-rotation surface.
- Pure Supabase direct (delete Express) — would need RLS policies covering every table; bigger rewrite; harder to maintain custom event-logging logic.

## Consequences

- One Supabase integration on Vercel manages all env vars (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`).
- Frontend uses `VITE_API_BASE` set to `/api` (or empty → defaults to `/api` in [api.ts](../../web/src/lib/api.ts)) → same origin → no CORS in prod.
- The `api/` folder is special-cased: must contain `package.json` with `"type": "module"` (see [api/CLAUDE.md](../../api/CLAUDE.md)).
- New routes go in `server/src/routes/`; the Vercel wrapper is route-agnostic.
