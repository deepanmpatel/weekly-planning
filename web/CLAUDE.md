# web/ — frontend conventions

Vite + React + TypeScript + Tailwind + TanStack Query + @dnd-kit + Supabase JS (auth only).

## File map

```
src/
├── App.tsx              ← gate order: load → session → me → is_allowed → dashboard
├── main.tsx             ← QueryClientProvider + AuthProvider + BrowserRouter
├── lib/
│   ├── api.ts           ← http() helper (auto-Bearer); one hook per endpoint; qk for query keys
│   ├── auth.tsx         ← AuthProvider, useAuth(), getAccessToken()
│   ├── supabase.ts      ← supabase client (PKCE flow, persist session)
│   └── types.ts         ← Project, Task, Tag, Comment, TaskEvent, Profile, AllowedEmail, …
├── components/
│   ├── TaskCard.tsx              ← canonical task tile (re-used everywhere)
│   ├── SortableTaskCard.tsx      ← @dnd-kit wrapper around TaskCard
│   ├── TaskDrawer.tsx            ← right-side detail pane
│   ├── Sidebar.tsx               ← projects nav + admin link (gated)
│   ├── Avatar.tsx                ← initials/image, color-by-id
│   ├── TagChip.tsx, StatusPill.tsx, NewTaskInline.tsx, Activity.tsx
└── pages/
    ├── AllTasksPage.tsx          ← /all-tasks; grouped-by-project; honors task position (Done sorted by completed_at desc)
    ├── ProjectPage.tsx           ← /projects/:id; four status columns; drag-and-drop reorder (Done sorted by completed_at desc)
    ├── TodayPage.tsx             ← / (default); swim-lane kanban (rows=projects, cols=4 statuses) for is_today tasks (Done sorted by completed_at desc)
    ├── LoginPage.tsx             ← Google sign-in
    ├── AdminPage.tsx             ← allowlist + admin toggle (admins only)
    └── NotApprovedPage.tsx       ← shown when is_allowed === false
```

## Patterns to follow

- **All HTTP via `http()`** in `lib/api.ts`. Never `fetch()` directly — `http()` attaches the Bearer token from the Supabase session. Skipping it = silent 401s.
- **TanStack Query for all server state**. Don't `useState` for data that can be re-fetched. Mutations call `qc.invalidateQueries({ queryKey: qk.X })` — surgically, not the whole tree.
- **Query keys** live in `qk` constant in [lib/api.ts](src/lib/api.ts). Extend it; don't hardcode key arrays inline.
- **Reuse `TaskCard`**. Add a prop (`compact`, `showProject`) instead of forking. Same applies to Avatar, TagChip, etc.
- **Done columns are time-sorted, not user-ordered.** Every page that renders a Done column sorts by `completed_at` desc via `sortDoneByCompletedAt` in [lib/dragLogic.ts](src/lib/dragLogic.ts). The cache helpers (`applyGroupedToCache`, `applyReorderColumnsToCache`, `applyTodayCrossCellMoveToCache`) optimistically roll `completed_at` forward to `now` on transitions into `done` (and to `null` when leaving) so a freshly-dropped task lands at the top before the server round-trip. Drag handlers must apply the same sort to their cached snapshot before computing insertion indices.
- **Tailwind first**. Use the `ink-*` palette in `tailwind.config.ts`. Custom shadows: `shadow-card`, `shadow-hover`. Inline `style={{}}` only for dynamic values (e.g. tag colors).
- **No comments** unless *why* is non-obvious.

## Auth gate (App.tsx order)

1. `loading` → "Loading…"
2. no `session` → `<LoginPage />`
3. `meLoading` → "Loading…"
4. `me.is_allowed === false` → `<NotApprovedPage />`
5. otherwise → `<Sidebar />` + routed page (admin link visible only if `me.is_admin`)

## Build

```bash
npm --workspace asana-web run build   # tsc -b && vite build
```

## VITE_API_BASE behavior

- Local dev: set `VITE_API_BASE=http://localhost:3001` in `web/.env`.
- Production (Vercel): leave unset — code defaults to `/api`, Vercel rewrites that to the function.

## Demo mode

`npm run dev:demo` sets `VITE_DEMO_MODE=true` and runs the frontend with an in-browser backend at [src/lib/demo/](src/lib/demo/). When you add or change an Express route, you **must** also update the matching demo handler — see [src/lib/demo/CLAUDE.md](src/lib/demo/CLAUDE.md) for the rules. Demo parity is the primary live-behavior verification path for the preview tool.

## Don't

- Don't add new UI libraries (Radix, MUI, Headless UI, …) without architect approval.
- Don't fork `TaskCard`. Add a prop.
- Don't bypass `http()`.
- Don't silence type errors with `as any` / `// @ts-ignore`. Fix the underlying type.
- Don't ship a feature without verifying it works in `dev:demo`.
