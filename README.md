# Weekly Planning — personal Asana replacement

Multi-user board with Google / GitHub login, projects, tasks & subtasks, tags, comments, per-task activity history, and per-task assignees.

- **web/** — Vite + React + TypeScript + Tailwind + TanStack Query
- **server/** — Express + TypeScript + Zod + Supabase JS (used for local dev)
- **api/** — a single Vercel serverless function that wraps the Express app (used in production)
- **db** — Supabase Postgres

A single `TaskCard` component is reused everywhere a task renders.

---

## Local dev

### 1. Create a Supabase project
1. [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**. Wait ~1 min.
2. Settings → **API** → copy **Project URL**, **publishable** key, **secret** key.

### 2. Run the schema
SQL Editor → New query → paste all of `server/sql/schema.sql` → **Run**.

### 3. Enable OAuth providers
Authentication → **Providers**:

- **GitHub** — [register an OAuth app](https://github.com/settings/developers), `Authorization callback URL = https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`. Paste Client ID + Secret into Supabase.
- **Google** — [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials), `Authorized redirect URI = https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`. Paste into Supabase.

Authentication → **URL Configuration** → add `http://localhost:5173` (and your production URL later) to **Site URL** and **Redirect URLs**.

### 4. Configure env
```bash
cp server/.env.example server/.env
cp web/.env.example web/.env
```
Fill in both with the Supabase values from step 1.

### 5. Install & seed
```bash
npm install
npm run seed      # one-shot: imports Weekly_Planning.csv
```

### 6. Run
```bash
npm run dev
```
UI: http://localhost:5173 · API: http://localhost:3001

---

## Deploy to Vercel (single project for UI + API)

1. **vercel.com/new** → import this repo. Leave "Root Directory" as the repo root.
2. Framework, build command, output — all auto-detected from `vercel.json`. Don't override.
3. **Integrations → Browse Marketplace → Supabase** → connect your Supabase project. This auto-injects these env vars into the Vercel project:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY` (mapped from integration; Vite needs a `VITE_` prefix — see next step)
   - `SUPABASE_SERVICE_ROLE_KEY`
4. **Settings → Environment Variables** — add two **Vite-prefixed** mirrors of the integration-provided vars so the browser bundle can read them:
   - `VITE_SUPABASE_URL` = same value as `SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY` = same value as `SUPABASE_ANON_KEY`
   (Vercel's Supabase integration doesn't auto-prefix for Vite yet. One-time copy in the UI; still no secrets in git.)
5. Deploy. The frontend is served at `/`, the Express app is served at `/api/*` via the serverless function.
6. **Back in Supabase** → Authentication → URL Configuration → add your Vercel URL (e.g. `https://weekly-planning-xyz.vercel.app`) to both Site URL and Redirect URLs.

That's it — all credentials live in Vercel's encrypted env store, nothing hardcoded, and the whole app runs on Vercel's free tier.

---

## API routes

```
GET    /projects
POST   /projects                  { name }
PATCH  /projects/:id              { name?, position? }
DELETE /projects/:id
GET    /projects/:id/tasks

GET    /tasks
GET    /tasks/:id
POST   /tasks                     { project_id, parent_task_id?, name, assignee_id?, ... }
PATCH  /tasks/:id                 { name?, status?, due_date?, description?, assignee_id? }
DELETE /tasks/:id
POST   /tasks/:id/tags            { tag_id }
DELETE /tasks/:id/tags/:tagId

GET    /tasks/:taskId/comments
POST   /tasks/:taskId/comments    { body }
DELETE /tasks/:taskId/comments/:commentId

GET    /tags
POST   /tags                      { name, color? }
DELETE /tags/:id

GET    /users                     # all profiles (for assignee picker)
GET    /users/me                  # current signed-in user
```

All routes except `/health` require `Authorization: Bearer <supabase_access_token>`. The web app attaches this automatically from the signed-in session.
