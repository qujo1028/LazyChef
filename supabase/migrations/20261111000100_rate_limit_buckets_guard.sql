-- Rate-limit buckets: the full list, said once more, so it holds whichever of the two
-- migrations that redefine these functions ran last.
--
-- 20261110082751_ai_rate_limit.sql ('ai') and the subscriptions migration ('pro_sync', on the
-- monetization branch, live as version 20261108000200) both replace private.rate_limit_rule
-- and public.take_rate_limit. The subscriptions one doesn't know about 'ai', so if it ever
-- runs after the AI one (re-timestamped on merge, replayed by hand), AI calls lose their
-- limit: public.take_rate_limit('ai') returns null and the app lets the call through.
--
-- Same bodies as 20261110082751_ai_rate_limit.sql and the same signatures, so this changes
-- nothing on a database that already has both buckets, and grants are kept.
-- Any later migration that touches these functions must carry every bucket listed here.

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
