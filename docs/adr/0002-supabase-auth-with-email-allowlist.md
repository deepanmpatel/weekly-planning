# ADR 0002 — Supabase Auth (Google) + email allowlist for access control

Date: 2026-04-26 · Status: accepted

## Context

Anyone with a Google account can complete OAuth against our Supabase project. We want to restrict actual app access to a known set of users without forcing the admin to pre-create accounts.

## Decision

Two-stage auth:

1. **Sign-in** is open to any Google account (Supabase Auth handles OAuth). New `auth.users` rows + `profiles` rows are auto-created via the `handle_new_user()` trigger.
2. **Data access** is gated by `public.allowed_emails`. Middleware [requireAllowed](../../server/src/auth.ts) checks `email IN allowed_emails` (or `is_admin`) before any data route. Denied users see `<NotApprovedPage />` with a sign-out button.

Admins (`profiles.is_admin = true`) manage the allowlist via `/admin` UI.

## Alternatives considered

- **Block sign-up entirely** for non-allowlisted emails (database trigger that throws `RAISE EXCEPTION` on `INSERT auth.users`). Rejected: Supabase Auth surfaces this as an opaque "Database error", terrible UX.
- **Manual user creation by admin** (no public sign-in). Rejected: friction; admin would need to create accounts before users could even discover the app.
- **Domain allowlist** (e.g. `@company.com`). Rejected: too broad for personal-use case; user wanted per-email control.

## Consequences

- A user can sign in but see a "not approved" page until added to the allowlist. Supabase still has their `auth.users` row — that's accepted as a known small leak (just a Google identity, no app data).
- Removing an email from `allowed_emails` revokes access on the very next request (no JWT TTL to wait out).
- Admin demoting self is blocked (server + UI). Prevents the "lock yourself out of the admin page" footgun.
- `/users/me` is the one route that bypasses `requireAllowed` — denied users must be able to fetch their own status.
