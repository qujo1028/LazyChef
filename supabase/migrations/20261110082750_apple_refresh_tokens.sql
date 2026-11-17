-- LazyChef · Sign in with Apple refresh tokens, server only.
--
-- Apple requires apps that offer Sign in with Apple to revoke the person's Apple
-- tokens when they delete their account (POST https://appleid.apple.com/auth/revoke).
-- Supabase Auth keeps no Apple refresh token and doesn't revoke anything itself, so
-- the app's server exchanges the one-time authorization code from a native Apple
-- sign-in for a refresh token and keeps it here (src/features/auth/apple-tokens.ts).
-- deleteAccount reads it and revokes it before deleting the auth user; deleting the
-- user then removes the row (on delete cascade).
--
-- Only the server's secret key (service_role) can touch this table, like
-- spoonacular_cache. It lives in public only because that's the schema the admin
-- client reaches through the API.

create table public.apple_refresh_tokens (
  user_id uuid primary key references auth.users (id) on delete cascade,
  refresh_token text not null check (char_length(refresh_token) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS on with no policies: anon and authenticated see nothing even if a grant
-- slips back in. service_role bypasses RLS.
alter table public.apple_refresh_tokens enable row level security;
revoke all on table public.apple_refresh_tokens from public, anon, authenticated;
grant select, insert, update, delete on table public.apple_refresh_tokens to service_role;
