-- An hourly allowance for AI features (Groq's free plan is shared by everyone: 30 requests a
-- minute, 14,400 a day). Adds the 'ai' bucket to the rules. The 'pro_sync' bucket
-- (from the subscriptions migration, not yet on main, already live) is also kept;
-- dropping it here would break that work.
-- Updates the single source of truth: private.rate_limit_buckets().

create or replace function private.rate_limit_buckets()
returns setof private.rate_limit_bucket
language sql
immutable
set search_path = ''
as $$
  select r.bucket, r.max_hits, r.window_length, r.app_server_takeable
  from (values
    -- Each costs Spoonacular points (the free plan is 50 a day, shared by everyone).
    ('recipe_search', 15, interval '1 hour', true),
    ('recipe_open', 40, interval '1 hour', true),
    ('ingredient_lookup', 20, interval '1 hour', true),
    -- Wrong invite codes: plenty for typos, useless for guessing.
    ('invite_miss', 10, interval '15 minutes', false),
    -- AI suggestions, quick-add parsing and name clean-up (Groq).
    ('ai', 30, interval '1 hour', true),
    -- Asking RevenueCat for my own subscription (purchase, restore, opening the app).
    ('pro_sync', 30, interval '1 hour', true)
  ) as r (bucket, max_hits, window_length, app_server_takeable);
$$;

revoke execute on function private.rate_limit_buckets() from public, anon;