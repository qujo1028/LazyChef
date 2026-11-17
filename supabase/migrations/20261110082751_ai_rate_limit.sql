-- An hourly allowance for AI features (Groq's free plan is shared by everyone: 30 requests a
-- minute, 14,400 a day). Adds the 'ai' bucket to the rules and to the buckets the app server
-- may take. Same signatures as 20261003000100_security_hardening.sql, so grants are kept.
-- Also keeps 'pro_sync', which the subscriptions migration (not yet on main, already live)
-- added to both functions; dropping it here would break that work.

create or replace function private.rate_limit_rule(p_bucket text, out max_hits integer, out window_length interval)
language sql
immutable
set search_path = ''
as $$
  select r.max_hits, r.window_length
  from (values
    -- Each costs Spoonacular points (the free plan is 50 a day, shared by everyone).
    ('recipe_search', 15, interval '1 hour'),
    ('recipe_open', 40, interval '1 hour'),
    ('ingredient_lookup', 20, interval '1 hour'),
    -- AI suggestions, quick-add parsing and name clean-up (Groq).
    ('ai', 30, interval '1 hour'),
    -- Wrong invite codes: plenty for typos, useless for guessing.
    ('invite_miss', 10, interval '15 minutes'),
    -- Asking RevenueCat for my own subscription (purchase, restore, opening the app).
    ('pro_sync', 30, interval '1 hour')
  ) as r (bucket, max_hits, window_length)
  where r.bucket = p_bucket;
$$;

create or replace function public.take_rate_limit(p_bucket text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select private.take_rate_limit(p_bucket)
  where p_bucket in ('recipe_search', 'recipe_open', 'ingredient_lookup', 'pro_sync', 'ai');
$$;

revoke execute on function private.rate_limit_rule(text), public.take_rate_limit(text) from public, anon;
grant execute on function public.take_rate_limit(text) to authenticated;
