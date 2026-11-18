-- LazyChef · AI ideas, recipe ratings, AI idea cache.
--
-- recipes.ai_generated: a household recipe that began as an AI idea ("AI idea" badge).
--   No client can set or change it: it isn't in the insert/update column grants, and
--   save_ai_recipe() is the only writer.
-- recipe_ratings:       one thumbs up/down (+1/-1) per member per recipe, written only
--                       through rate_recipe(), and only by someone who cooked it.
-- ai_idea_cache:        hourly cache of generated (not yet saved) ideas.

-- ── recipes.ai_generated ────────────────────────────────────────────────────

alter table public.recipes add column ai_generated boolean not null default false;
-- Not added to the column grants of 20261005000100_local_recipes.sql on purpose.

-- Saves an AI idea as an ordinary household recipe (source 'user') and flags it.
-- Same inputs as save_household_recipe(). Runs as the function owner so it may set
-- the flag; the membership check comes first.
create function public.save_ai_recipe(
  p_household_id uuid,
  p_recipe jsonb,
  p_ingredients jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if (select auth.uid()) is null or not private.is_member(p_household_id) then
    raise exception 'You''re not in that household.' using errcode = '42501';
  end if;

  v_id := public.save_household_recipe(p_household_id, null, p_recipe, p_ingredients);
  update public.recipes set ai_generated = true where id = v_id;
  return v_id;
end;
$$;

revoke execute on function public.save_ai_recipe(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.save_ai_recipe(uuid, jsonb, jsonb) to authenticated;

-- ── recipe_ratings ──────────────────────────────────────────────────────────

create table public.recipe_ratings (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- The app's recipe ref: a Spoonacular id (1-9 digits) or a lowercase recipe uuid.
  recipe_ref text not null,
  rating smallint not null check (rating in (-1, 1)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (household_id, user_id, recipe_ref),
  constraint recipe_ratings_ref_shape check (
    recipe_ref ~ '^[1-9][0-9]{0,8}$'
    or recipe_ref ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  )
);

create index recipe_ratings_user_id_idx on public.recipe_ratings (user_id);
create index recipe_ratings_recipe_idx on public.recipe_ratings (household_id, recipe_ref);

create trigger broadcast_changes
  after insert or update or delete on public.recipe_ratings
  for each row execute function private.broadcast_household_change('household_id');

alter table public.recipe_ratings enable row level security;

create policy "Members see their household's ratings"
  on public.recipe_ratings for select to authenticated
  using (private.is_member(household_id));

-- Written only through rate_recipe().
revoke all on table public.recipe_ratings from anon, authenticated;
grant select on table public.recipe_ratings to authenticated;

-- Thumbs up (1) or down (-1) for a recipe the caller has cooked; rating again
-- changes their vote. Returns the stored rating.
create function public.rate_recipe(
  p_household_id uuid,
  p_recipe_ref text,
  p_rating smallint
)
returns smallint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_numeric boolean;
begin
  if v_uid is null or not private.is_member(p_household_id) then
    raise exception 'You''re not in that household.' using errcode = '42501';
  end if;
  if p_rating is null or p_rating not in (-1, 1) or p_recipe_ref is null then
    raise exception 'That isn''t a valid rating.' using errcode = '22023';
  end if;
  v_numeric := p_recipe_ref ~ '^[1-9][0-9]{0,8}$';
  if not v_numeric
     and p_recipe_ref !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'That isn''t a valid rating.' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.activity_log a
    where a.household_id = p_household_id
      and a.actor_id = v_uid
      and a.action = 'cooked'
      and case when v_numeric
            then a.details ->> 'recipe_id'
            else a.details ->> 'local_recipe_id'
          end = p_recipe_ref
  ) then
    raise exception 'You can rate a recipe once you''ve cooked it.' using errcode = '42501';
  end if;

  insert into public.recipe_ratings (household_id, user_id, recipe_ref, rating)
  values (p_household_id, v_uid, p_recipe_ref, p_rating)
  on conflict (household_id, user_id, recipe_ref) do update
    set rating = excluded.rating, updated_at = now();
  return p_rating;
end;
$$;

revoke execute on function public.rate_recipe(uuid, text, smallint) from public, anon;
grant execute on function public.rate_recipe(uuid, text, smallint) to authenticated;

-- ── ai_idea_cache ───────────────────────────────────────────────────────────

-- No realtime broadcast: nothing on screen changes when a cache row is written.
create table public.ai_idea_cache (
  household_id uuid not null references public.households (id) on delete cascade,
  cache_key text not null check (char_length(cache_key) between 1 and 200),
  response jsonb not null check (pg_column_size(response) <= 100000),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (household_id, cache_key),
  constraint ai_idea_cache_one_hour check (expires_at <= created_at + interval '1 hour')
);

create index ai_idea_cache_expires_at_idx on public.ai_idea_cache (expires_at);

alter table public.ai_idea_cache enable row level security;

create policy "Members read their household's AI idea cache"
  on public.ai_idea_cache for select to authenticated
  using (private.is_member(household_id));

revoke all on table public.ai_idea_cache from anon, authenticated;
grant select on table public.ai_idea_cache to authenticated;

-- The database's clock sets expiry (at most an hour) and the household's expired
-- entries are cleared on the way.
create function public.put_ai_idea_cache(
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
  if p_cache_key is null or char_length(p_cache_key) not between 1 and 200 or p_response is null
     or pg_column_size(p_response) > 100000 then
    raise exception 'Bad cache entry.' using errcode = '22023';
  end if;

  delete from public.ai_idea_cache
  where household_id = p_household_id and expires_at <= now();

  insert into public.ai_idea_cache (household_id, cache_key, response, created_at, expires_at)
  values (p_household_id, p_cache_key, p_response, now(), v_expires)
  on conflict (household_id, cache_key) do update
    set response = excluded.response,
        created_at = excluded.created_at,
        expires_at = excluded.expires_at;
  return v_expires;
end;
$$;

revoke execute on function public.put_ai_idea_cache(uuid, text, jsonb, integer) from public, anon;
grant execute on function public.put_ai_idea_cache(uuid, text, jsonb, integer) to authenticated;
