-- LazyChef · Spoonacular cache shared by every household, server only.
--
-- Before: the cache was per household and signed-in members read it (and wrote it
-- through put_spoonacular_cache()). Recipe searches and recipe details aren't
-- household data, so now one cache serves everyone, and only the app's server
-- (the service_role key, SUPABASE_SECRET_KEY) can touch it or the usage record.
--
-- Spoonacular's terms: responses may be kept for at most one hour. Only recipe
-- id, title and image may be kept longer (shopping_list_items keeps id + title).

-- ── Cache ─────────────────────────────────────────────────────────────────────

-- Cache rows expire within the hour, so dropping them loses nothing.
drop function if exists public.put_spoonacular_cache(uuid, text, jsonb, integer);
drop table if exists public.spoonacular_cache;

-- No realtime broadcast: nothing on screen changes when a cache row is written.
create table public.spoonacular_cache (
  -- e.g. "find:<hash of the pantry names>" or "info:715538".
  cache_key text primary key check (char_length(cache_key) between 1 and 200),
  response jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '1 hour',
  constraint spoonacular_cache_one_hour check (expires_at > created_at and expires_at <= created_at + interval '1 hour')
);

create index spoonacular_cache_expires_at_idx on public.spoonacular_cache (expires_at);

-- ── Usage ─────────────────────────────────────────────────────────────────────

-- One row per UTC day already exists (spoonacular_usage). Add our own running
-- estimate for requests whose quota headers didn't come back, and the moment a
-- 402 said the day is used up.
alter table public.spoonacular_usage
  add column exhausted_at timestamptz;

-- ── Functions (service_role only) ─────────────────────────────────────────────

-- Saves a response for up to an hour (the database clock decides), and clears
-- expired entries while it's there. Callable only with the server's secret key,
-- so there's no auth.uid() to check.
create function public.put_spoonacular_cache(p_cache_key text, p_response jsonb, p_ttl_seconds integer default 3600)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expires timestamptz := now() + make_interval(secs => least(greatest(coalesce(p_ttl_seconds, 3600), 1), 3600));
begin
  if p_cache_key is null or char_length(p_cache_key) not between 1 and 200 or p_response is null then
    raise exception 'Bad cache entry.' using errcode = '22023';
  end if;

  perform public.purge_spoonacular_cache();

  insert into public.spoonacular_cache (cache_key, response, created_at, expires_at)
  values (p_cache_key, p_response, now(), v_expires)
  on conflict (cache_key) do update
    set response = excluded.response,
        created_at = excluded.created_at,
        expires_at = excluded.expires_at;

  return v_expires;
end;
$$;

-- Deletes expired cache rows and usage older than 30 days. Returns how many cache
-- rows went. Runs on every cache write; safe to call from a cron job too.
create function public.purge_spoonacular_cache()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  delete from public.spoonacular_cache where expires_at <= now();
  get diagnostics v_deleted = row_count;
  delete from public.spoonacular_usage where day < (now() at time zone 'utc')::date - 30;
  return v_deleted;
end;
$$;

-- Records a response's quota headers (or, when they're missing, our estimate of
-- the request's cost on top of what's recorded). Requests can finish out of
-- order, so "used" only goes up and "left" only goes down within a day.
-- p_exhausted: Spoonacular answered 402, so nothing's left until midnight UTC.
drop function if exists public.record_spoonacular_usage(numeric, numeric);

create function public.record_spoonacular_usage(
  p_points_used numeric,
  p_points_left numeric,
  p_estimated_cost numeric default null,
  p_exhausted boolean default false
)
returns table (points_used numeric, points_left numeric, exhausted boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_day date := (now() at time zone 'utc')::date;
begin
  if (p_points_used is not null and (p_points_used < 0 or p_points_used > 100000))
     or (p_points_left is not null and (p_points_left < 0 or p_points_left > 100000))
     or (p_estimated_cost is not null and (p_estimated_cost < 0 or p_estimated_cost > 1000)) then
    raise exception 'Those quota numbers don''t look right.' using errcode = '22023';
  end if;

  insert into public.spoonacular_usage as u (day, points_used, points_left, requests, updated_at, exhausted_at)
  values (
    v_day,
    coalesce(p_points_used, p_estimated_cost, 0),
    case when p_exhausted then 0 else p_points_left end,
    1,
    now(),
    case when p_exhausted then now() end
  )
  on conflict (day) do update
    set points_used = case
          when p_points_used is not null then greatest(u.points_used, p_points_used)
          else u.points_used + coalesce(p_estimated_cost, 0)
        end,
        points_left = case
          when p_exhausted then 0
          when u.points_left is null then p_points_left
          when p_points_left is null then
            -- No headers: take our estimate off what was left.
            greatest(u.points_left - coalesce(p_estimated_cost, 0), 0)
          else least(u.points_left, p_points_left)
        end,
        requests = u.requests + 1,
        updated_at = now(),
        exhausted_at = coalesce(u.exhausted_at, case when p_exhausted then now() end);

  return query
    select u.points_used, u.points_left, u.exhausted_at is not null
    from public.spoonacular_usage u
    where u.day = v_day;
end;
$$;

revoke execute on function
  public.put_spoonacular_cache(text, jsonb, integer),
  public.purge_spoonacular_cache(),
  public.record_spoonacular_usage(numeric, numeric, numeric, boolean)
from public, anon, authenticated;

grant execute on function
  public.put_spoonacular_cache(text, jsonb, integer),
  public.purge_spoonacular_cache(),
  public.record_spoonacular_usage(numeric, numeric, numeric, boolean)
to service_role;

-- ── Access: server only ───────────────────────────────────────────────────────

-- RLS on with no policies: anon and authenticated see nothing even if a grant
-- slips back in. service_role bypasses RLS.
alter table public.spoonacular_cache enable row level security;
revoke all on table public.spoonacular_cache from public, anon, authenticated;
grant select, insert, update, delete on table public.spoonacular_cache to service_role;

drop policy if exists "Signed-in people see the day's usage" on public.spoonacular_usage;
revoke all on table public.spoonacular_usage from public, anon, authenticated;
grant select, insert, update, delete on table public.spoonacular_usage to service_role;
