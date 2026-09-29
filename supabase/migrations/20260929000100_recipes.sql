-- LazyChef · Phase 3: recipe suggestions.
--
-- Spoonacular's free plan is 50 points a day, and its terms let us keep responses
-- for at most one hour. So recipe searches and recipe details are cached per
-- household for an hour (housemates share results instead of each paying for
-- them), and the day's point usage is recorded so every server instance can stop
-- before the limit instead of finding out from a failed request.

-- ── Tables ───────────────────────────────────────────────────────────────────

-- No realtime broadcast: nothing on screen changes when a cache row is written.
create table public.spoonacular_cache (
  household_id uuid not null references public.households (id) on delete cascade,
  -- e.g. "find:<hash of the ingredients>" or "info:715538".
  cache_key text not null check (char_length(cache_key) between 1 and 200),
  response jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (household_id, cache_key),
  constraint spoonacular_cache_one_hour check (expires_at <= created_at + interval '1 hour')
);

create index spoonacular_cache_expires_at_idx on public.spoonacular_cache (expires_at);

-- One row per UTC day (Spoonacular's quota resets at midnight UTC). The quota is
-- per API key, not per household, so this is shared by everyone.
create table public.spoonacular_usage (
  day date primary key,
  -- From the X-API-Quota-Used / -Left headers of the latest request that day.
  points_used numeric not null default 0 check (points_used >= 0),
  points_left numeric check (points_left is null or points_left >= 0),
  requests integer not null default 0 check (requests >= 0),
  updated_at timestamptz not null default now()
);

-- ── Functions ────────────────────────────────────────────────────────────────

-- Saves a Spoonacular response for this household for up to an hour, and clears
-- the household's expired entries while it's there. The only way to write the
-- cache, so the database's clock (not the caller) decides when an entry expires
-- and nothing is kept longer than the terms allow.
create function public.put_spoonacular_cache(
  p_household_id uuid,
  p_cache_key text,
  p_response jsonb,
  p_ttl_seconds integer default 3600
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expires timestamptz := now() + make_interval(secs => least(greatest(coalesce(p_ttl_seconds, 3600), 1), 3600));
begin
  if (select auth.uid()) is null or not private.is_member(p_household_id) then
    raise exception 'You''re not in that household.' using errcode = '42501';
  end if;
  if p_cache_key is null or char_length(p_cache_key) not between 1 and 200 or p_response is null then
    raise exception 'Bad cache entry.' using errcode = '22023';
  end if;

  delete from public.spoonacular_cache
  where household_id = p_household_id and expires_at <= now();

  insert into public.spoonacular_cache (household_id, cache_key, response, created_at, expires_at)
  values (p_household_id, p_cache_key, p_response, now(), v_expires)
  on conflict (household_id, cache_key) do update
    set response = excluded.response,
        created_at = excluded.created_at,
        expires_at = excluded.expires_at;

  return v_expires;
end;
$$;

-- Records the quota headers from a Spoonacular response. Requests can finish out
-- of order, so "used" only goes up and "left" only goes down within a day.
create function public.record_spoonacular_usage(p_points_used numeric, p_points_left numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if p_points_used is null or p_points_used < 0 or p_points_used > 100000
     or (p_points_left is not null and (p_points_left < 0 or p_points_left > 100000)) then
    raise exception 'Those quota numbers don''t look right.' using errcode = '22023';
  end if;

  insert into public.spoonacular_usage (day, points_used, points_left, requests, updated_at)
  values ((now() at time zone 'utc')::date, p_points_used, p_points_left, 1, now())
  on conflict (day) do update
    set points_used = greatest(public.spoonacular_usage.points_used, excluded.points_used),
        points_left = case
          when public.spoonacular_usage.points_left is null then excluded.points_left
          when excluded.points_left is null then public.spoonacular_usage.points_left
          else least(public.spoonacular_usage.points_left, excluded.points_left)
        end,
        requests = public.spoonacular_usage.requests + 1,
        updated_at = now();
end;
$$;

revoke execute on function
  public.put_spoonacular_cache(uuid, text, jsonb, integer),
  public.record_spoonacular_usage(numeric, numeric)
from public, anon;

grant execute on function
  public.put_spoonacular_cache(uuid, text, jsonb, integer),
  public.record_spoonacular_usage(numeric, numeric)
to authenticated;

-- ── Row level security ───────────────────────────────────────────────────────

alter table public.spoonacular_cache enable row level security;

create policy "Members read their household's cache"
  on public.spoonacular_cache for select to authenticated
  using (private.is_member(household_id));

-- Written only through put_spoonacular_cache().
revoke all on table public.spoonacular_cache from anon, authenticated;
grant select on table public.spoonacular_cache to authenticated;

alter table public.spoonacular_usage enable row level security;

create policy "Signed-in people see the day's usage"
  on public.spoonacular_usage for select to authenticated
  using (true);

-- Only record_spoonacular_usage() writes it.
revoke all on table public.spoonacular_usage from anon, authenticated;
grant select on table public.spoonacular_usage to authenticated;
