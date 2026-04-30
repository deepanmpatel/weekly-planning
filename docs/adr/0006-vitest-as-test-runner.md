# ADR 0006 — Vitest as the test runner for both workspaces

Date: 2026-04-30 · Status: accepted

## Context

The repo went its first nine merged features without an automated test framework. Coverage rested on `npm run dev:demo` smoke flows and TypeScript build errors. Two pressures forced the issue with the `check_back_at` feature:

- The auto-default logic lives in two places (`PATCH /tasks/:id` and `PUT /projects/:id/tasks/reorder`) plus a third in [demoStore.ts](../../web/src/lib/demo/demoStore.ts). Three branches that have to stay in sync via parity convention. Without tests, every future change to status-transition behavior risks a silent drift in one of them.
- The `TaskCard` and `TaskDrawer` components now carry per-status conditional UI for the badge + clear button. Visual regressions previously meant "open the demo and look" — that doesn't scale as the matrix grows.

## Decision

Bootstrap Vitest as the runner for both workspaces:

- `server/` — `vitest.config.ts` with `environment: "node"`, includes `test/**/*.test.ts` and `src/**/*.test.ts`. Service-role Supabase calls are faked via the chainable mock at [server/test/supabaseMock.ts](../../server/test/supabaseMock.ts) — no live DB needed.
- `web/` — `vitest.config.ts` with `environment: "jsdom"` + `@vitejs/plugin-react`, includes `src/**/*.test.{ts,tsx}`, setup at [src/test-setup.ts](../../web/src/test-setup.ts) registers `@testing-library/jest-dom`. Test files are excluded from the production build via `tsconfig.json`.
- Root: `npm test` fans out to both workspaces with `--workspaces --if-present`.

Each workspace exposes `test` (one-shot) and `test:watch` (interactive).

## Alternatives considered

- **Jest**. Rejected: ESM support requires Babel or `experimental-vm-modules`; this repo is ESM-throughout (`server/` and `api/` import with `.js` suffixes). Vitest treats ESM as the default; Jest still treats it as a feature flag.
- **Node's built-in `node:test`**. Rejected for the web workspace: no jsdom/RTL story, no React component testing without re-inventing a runner. Could be fine for `server/` alone, but two runners across two workspaces is worse than one.
- **Playwright-only end-to-end**. Rejected as primary: too slow and too coarse for unit-level invariants like "the auto-default fires only on transition INTO waiting_for_reply when the existing value is null". Playwright remains an option for future smoke E2Es.
- **Skip testing**. Rejected: see Context. The cost of breaking demo-mode parity silently grows with every multi-path feature.

## Consequences

- Every new server route handler should land with a `*.test.ts` that exercises happy path + at least one invariant. The pattern is in [server/test/tasks.patch.test.ts](../../server/test/tasks.patch.test.ts) — fake the Supabase chain, drive the route, assert on the chain calls + response.
- Every new component with non-trivial conditional logic should land with a `*.test.tsx` rendering with React Testing Library. Pattern: [web/src/components/TaskCard.test.tsx](../../web/src/components/TaskCard.test.tsx).
- Demo-store handlers also get unit tested ([web/src/lib/demo/demoStore.test.ts](../../web/src/lib/demo/demoStore.test.ts)) — this is the cheapest way to enforce parity, since the demo handler runs in the same process as the test.
- Test files do not ship to production: `tsconfig.json` excludes them, and Vite ignores them. Type errors in tests still fail `tsc -b` in dev because of how the `vitest` types are referenced — accepted; treat tests as first-class TS.
- The agent workflow's red/green test-engineer phase is now real: stubs in red, fills in green, runs `npm test` for verification.

## When to revisit

- If `vitest run` time exceeds ~10 seconds locally, evaluate whether the test pyramid is inverted (too many integration-style tests, too few unit tests).
- If the fake Supabase chain in `server/test/supabaseMock.ts` starts requiring per-test branching that mirrors the real client's behavior in detail, switch that suite to a real ephemeral Supabase project (or `pg-mem`) and keep the mock for the simpler cases.
