# Weekly Planning — local Asana replacement

Personal 3-tier board:

- **web/** — Vite + React + TypeScript + Tailwind + TanStack Query
- **api/** — Express + TypeScript + Zod + Supabase JS
- **db** — Supabase Postgres (free tier, shared via connection string)

Features: unlimited projects, tasks, and nested subtasks; status (To-Do / In Progress / Done); due dates with overdue highlight; tags with colors; comments; kanban-style project view + a grouped "All Tasks" overview. A single `TaskCard` component is reused everywhere a task renders.

## Setup

### 1. Create a Supabase project
1. Go to [supabase.com](https://supabase.com) → New project (free tier).
2. Wait for it to provision (~1 min).
3. Project settings → **API**:
   - Copy the **Project URL** (`https://xxxxx.supabase.co`).
   - Copy the **service_role** secret (under "Project API keys").

### 2. Run the schema
In the Supabase dashboard → **SQL Editor** → New query → paste the contents of `api/sql/schema.sql` → **Run**.

> Already set up an older version? Run the migrations instead, in order:
> `api/sql/0001_add_task_events.sql`, then `api/sql/0002_add_auth.sql`.

### 2b. Enable OAuth providers
Supabase dashboard → **Authentication → Providers**:

- **GitHub**: toggle on. You'll need to [register an OAuth app](https://github.com/settings/developers) with `Authorization callback URL = https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`. Paste the Client ID + Secret.
- **Google**: toggle on. Create OAuth 2.0 credentials in [Google Cloud Console](https://console.cloud.google.com/apis/credentials) with `Authorized redirect URI = https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`. Paste the Client ID + Secret.

Then **Authentication → URL Configuration** → add `http://localhost:5173` (and your deployed URL if applicable) to both **Site URL** and **Redirect URLs**.

### 3. Configure env
```bash
cp api/.env.example api/.env
cp web/.env.example web/.env
```
Fill in `api/.env`:
```
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
PORT=3001
SEED_CSV_PATH=/Users/you/Downloads/Weekly_Planning.csv
```

And `web/.env`:
```
VITE_API_BASE=http://localhost:3001
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...
```
(The web app uses the **publishable** key for the OAuth flow; API uses the **secret**.)

### 4. Install
```bash
npm install
```

### 5. Seed from your CSV (one-shot)
```bash
npm run seed
```
This reads `SEED_CSV_PATH` and inserts projects, top-level tasks, and subtasks. It refuses to run if the `projects` table is non-empty.

To re-seed, first clear the tables in the SQL editor:
```sql
truncate task_tags, comments, tasks, tags, projects restart identity cascade;
```

### 6. Run
```bash
npm run dev
```
- UI: http://localhost:5173
- API: http://localhost:3001

## API routes

```
GET    /projects
POST   /projects                  { name }
PATCH  /projects/:id              { name?, position? }
DELETE /projects/:id
GET    /projects/:id/tasks

GET    /tasks
GET    /tasks/:id
POST   /tasks                     { project_id, parent_task_id?, name, ... }
PATCH  /tasks/:id                 { name?, status?, due_date?, description? }
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

All routes except `/health` require a `Authorization: Bearer <supabase_access_token>` header. The web app attaches this automatically from the signed-in session.

## Notes

- **Single-user, local only.** No auth. Do not expose the API publicly without adding auth — the service-role key bypasses Row-Level Security.
- **Subtasks are tasks** (`parent_task_id` points at the parent). UI renders one level, but the model supports deeper nesting if you want.
- **Data lives in Supabase**, so the UI and API running on your laptop all read/write the same store. Run it from anywhere, connect the same `.env`, same board.
