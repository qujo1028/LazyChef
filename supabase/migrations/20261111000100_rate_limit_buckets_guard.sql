-- Rate-limit buckets: the full list, said once more, so it holds whichever of the two
-- migrations that redefine these functions ran last.
--
-- 20261110082751_ai_rate_limit.sql ('ai') and the subscriptions migration ('pro_sync', on the
-- monetization branch, live as version 20261108000200) both replace private.rate_limit_buckets.
-- The subscriptions one doesn't know about 'ai', so if it ever runs after the AI one
-- (re-timestamped on merge, replayed by hand), AI calls lose their limit.
--
-- This guard only redeclares private.rate_limit_buckets — the single source of truth.
-- Any later migration that adds a bucket must update private.rate_limit_buckets
-- and this guard.

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