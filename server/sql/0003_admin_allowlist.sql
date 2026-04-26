-- Admin allowlist: only emails in `allowed_emails` can use the app.
-- Profiles get an `is_admin` flag for managing the allowlist.
-- Safe to re-run.

create table if not exists public.allowed_emails (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  added_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists is_admin boolean not null default false;

create index if not exists allowed_emails_email_idx on public.allowed_emails(lower(email));

-- BOOTSTRAP STEP — replace the email below with YOUR Google email,
-- then run these two statements in the SQL editor AFTER applying the migration:
--
--   insert into public.allowed_emails (email) values ('you@example.com')
--     on conflict (email) do nothing;
--   update public.profiles set is_admin = true where lower(email) = lower('you@example.com');
--
-- After that, sign in to the app and use the Admin page to manage everyone else.
