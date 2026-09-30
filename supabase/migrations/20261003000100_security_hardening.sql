-- LazyChef · Security hardening: rate limits and safe avatar URLs.
--
-- 1. Rate limits, counted in Postgres so every server instance (and anyone
--    calling the API directly) shares them. Buckets and their limits live here,
--    not in the caller, so nobody can pick their own limit or fill the table
--    with made-up bucket names.
-- 2. Invite codes: wrong guesses are limited per person, so codes can't be
--    brute-forced through get_invite_preview() or join_household().
-- 3. profiles.avatar_url only keeps https links. Anyone can put any text there
--    at sign-up (user metadata) or later (the column is user-writable), and
--    housemates' browsers load it.

-- ── Rate limits ───────────────────────────────────────────────────────────────

-- Fixed windows: one row per (bucket, person, window start). Old windows are
-- deleted as new ones are taken.
create table private.rate_limits (
  bucket text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  window_start timestamptz not null,
  hits integer not null default 0 check (hits >= 0),
  primary key (bucket, user_id, window_start)
);

create index rate_limits_window_start_idx on private.rate_limits (window_start);

-- private schema: no grants to anon/authenticated. Only these functions touch it.
revoke all on table private.rate_limits from public, anon, authenticated;

-- The limits. An unknown bucket is an error, not "unlimited".
create function private.rate_limit_rule(p_bucket text, out max_hits integer, out window_length interval)
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
    -- Wrong invite codes: plenty for typos, useless for guessing.
    ('invite_miss', 10, interval '15 minutes')
  ) as r (bucket, max_hits, window_length)
  where r.bucket = p_bucket;
$$;

-- Counts one hit for the signed-in person. Returns false (and counts nothing)
-- once the window's limit is reached.
create function private.take_rate_limit(p_bucket text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_rule record;
  v_window timestamptz;
  v_hits integer;
begin
  if v_user is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  select * into v_rule from private.rate_limit_rule(p_bucket);
  if v_rule.max_hits is null then
    raise exception 'Unknown rate limit.' using errcode = '22023';
  end if;

  v_window := to_timestamp(
    floor(extract(epoch from now()) / extract(epoch from v_rule.window_length)) * extract(epoch from v_rule.window_length)
  );

  delete from private.rate_limits
  where bucket = p_bucket and user_id = v_user and window_start < v_window;

  insert into private.rate_limits as r (bucket, user_id, window_start, hits)
  values (p_bucket, v_user, v_window, 1)
  on conflict (bucket, user_id, window_start) do update
    set hits = r.hits + 1
    where r.hits < v_rule.max_hits
  returning hits into v_hits;

  return v_hits is not null;
end;
$$;

-- Whether the signed-in person has hit the limit, without counting anything.
create function private.rate_limited(p_bucket text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select r.hits >= rule.max_hits
      from private.rate_limits r, private.rate_limit_rule(p_bucket) rule
      where r.bucket = p_bucket
        and r.user_id = (select auth.uid())
        and r.window_start > now() - rule.window_length
      order by r.window_start desc
      limit 1
    ),
    false
  );
$$;

-- For the app server, before a call that spends Spoonacular points. Signed-in
-- people could call it themselves, but that only uses up their own allowance.
create function public.take_rate_limit(p_bucket text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select private.take_rate_limit(p_bucket)
  where p_bucket in ('recipe_search', 'recipe_open', 'ingredient_lookup');
$$;

revoke execute on function
  private.rate_limit_rule(text),
  private.take_rate_limit(text),
  private.rate_limited(text),
  public.take_rate_limit(text)
from public, anon;

grant execute on function public.take_rate_limit(text) to authenticated;

-- ── Invite codes ──────────────────────────────────────────────────────────────

-- Same result as before, but a wrong code counts against the person's limit,
-- and past the limit every lookup fails with LZ429 until the window resets.
create or replace function public.get_invite_preview(p_code text)
returns table (household_id uuid, household_name text, member_count integer, is_member boolean)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return;
  end if;
  if private.rate_limited('invite_miss') then
    raise exception 'Too many tries. Wait a few minutes and try again.' using errcode = 'LZ429';
  end if;

  return query
    select
      h.id,
      h.name,
      (select count(*)::integer from public.household_members m where m.household_id = h.id),
      exists (
        select 1 from public.household_members m
        where m.household_id = h.id and m.user_id = (select auth.uid())
      )
    from public.households h
    where h.invite_code = private.normalize_invite_code(p_code);

  if not found then
    perform private.take_rate_limit('invite_miss');
  end if;
end;
$$;

-- A wrong code now returns null instead of raising, because raising would roll
-- back the miss we just counted. Callers treat null as "no such household".
create or replace function public.join_household(p_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_household uuid;
begin
  if v_user is null then
    raise exception 'You need to be signed in.' using errcode = '42501';
  end if;
  if private.rate_limited('invite_miss') then
    raise exception 'Too many tries. Wait a few minutes and try again.' using errcode = 'LZ429';
  end if;

  select id into v_household
  from public.households
  where invite_code = private.normalize_invite_code(p_code);

  if v_household is null then
    perform private.take_rate_limit('invite_miss');
    return null;
  end if;

  insert into public.household_members (household_id, user_id)
  values (v_household, v_user)
  on conflict (household_id, user_id) do nothing;

  update public.profiles set active_household_id = v_household where id = v_user;
  return v_household;
end;
$$;

-- create or replace keeps the existing grants (authenticated only).

-- ── Avatar URLs ───────────────────────────────────────────────────────────────

-- https only, at most 2,048 characters. Anything else becomes null (the avatar
-- falls back to initials) instead of failing the sign-up or the update.
create function private.clean_avatar_url()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.avatar_url is not null
     and (new.avatar_url !~ '^https://[^\s/?#]+[^\s]*$' or char_length(new.avatar_url) > 2048) then
    new.avatar_url := null;
  end if;
  return new;
end;
$$;

create trigger profiles_clean_avatar_url
  before insert or update of avatar_url on public.profiles
  for each row execute function private.clean_avatar_url();

-- Backstop for new writes. NOT VALID leaves existing rows alone; the trigger
-- keeps new ones in line.
alter table public.profiles
  add constraint profiles_avatar_url_https
  check (avatar_url is null or (avatar_url ~ '^https://' and char_length(avatar_url) <= 2048))
  not valid;
