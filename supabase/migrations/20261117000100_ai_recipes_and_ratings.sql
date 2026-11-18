-- LazyChef · AI recipe ideas, cooking them, and thumbs-up/down ratings.
--
-- ai_recipes:     ideas the AI wrote that a household chose to keep (save/cook).
--                 Inserted only through save_ai_recipe(), which validates the shape.
-- recipe_ratings: one +1/-1 per member per recipe, written only through
--                 rate_recipe(), and only by someone who cooked that recipe.
-- cook_ai_recipe: cook_recipe() for AI recipes; the activity log's `details`
--                 carry {"recipe_kind": "ai", "ai_recipe_id": …, "recipe_title": …}.
-- ai_idea_cache:  hourly cache of generated (not yet saved) ideas.
--
-- Recipe references. A recipe is identified by (recipe_kind, recipe_key):
--   'spoonacular' + the integer id as text ("715538")
--   'ai'          + the ai_recipes.id uuid as text
-- Spoonacular cooks keep logging {"recipe_id": <int>, "recipe_title": …} exactly
-- as before; AI cooks log "ai_recipe_id" instead and have no "recipe_id", so
-- cookHistory() (which keys on the integer id) skips them.
--
-- Why a separate ai_idea_cache instead of spoonacular_cache: Spoonacular's
-- one-hour limit applies to their data. AI output is ours, and mixing it into a
-- table whose writer (put_spoonacular_cache) and constraints exist to honour
-- Spoonacular's terms would blur that rule. Same shape, own table, own writer.

-- ── ai_recipes ───────────────────────────────────────────────────────────────

create table public.ai_recipes (
  household_id uuid not null references public.households (id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 200),
  blurb text not null default '' check (char_length(blurb) <= 500),
  ready_in_minutes integer check (ready_in_minutes is null or ready_in_minutes between 1 and 1440),
  servings integer check (servings is null or servings between 1 and 100),
  -- [{"name": "chicken breast", "amount": 1.5, "unit": "lb"}, …]; amount/unit may be null.
  ingredients jsonb not null
    check (jsonb_typeof(ingredients) = 'array' and jsonb_array_length(ingredients) between 1 and 60
           and pg_column_size(ingredients) <= 20000),
  -- ["Chop the onion.", …]
  steps jsonb not null
    check (jsonb_typeof(steps) = 'array' and jsonb_array_length(steps) between 1 and 40
           and pg_column_size(steps) <= 20000),
  meal text check (meal is null or char_length(meal) between 1 and 40),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (household_id, id),
  unique (id)
);

create index ai_recipes_created_by_idx on public.ai_recipes (created_by);
create index ai_recipes_household_created_idx on public.ai_recipes (household_id, created_at desc);

-- Who saved it comes from the session, not the client.
create function private.stamp_ai_recipe()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_by := (select auth.uid());
  new.created_at := now();
  return new;
end;
$$;

create trigger stamp_ai_recipe
  before insert on public.ai_recipes
  for each row execute function private.stamp_ai_recipe();

create trigger broadcast_changes
  after insert or update or delete on public.ai_recipes
  for each row execute function private.broadcast_household_change('household_id');

alter table public.ai_recipes enable row level security;

create policy "Members see their household's AI recipes"
  on public.ai_recipes for select to authenticated
  using (private.is_member(household_id));

create policy "Members delete their household's AI recipes"
  on public.ai_recipes for delete to authenticated
  using (private.is_member(household_id));

-- No insert/update policy or grant: save_ai_recipe() is the only writer.
revoke all on table public.ai_recipes from anon, authenticated;
grant select, delete on table public.ai_recipes to authenticated;

-- Validates and stores an AI idea for the household. Returns its id.
-- p_recipe: {"title", "blurb"?, "ready_in_minutes"?, "servings"?, "meal"?,
--            "ingredients": [{"name", "amount"?, "unit"?}, …], "steps": ["…", …]}
create function public.save_ai_recipe(p_household_id uuid, p_recipe jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
  v_ing jsonb;
  v_step jsonb;
  v_ingredients jsonb := '[]'::jsonb;
  v_steps jsonb := '[]'::jsonb;
  v_minutes integer;
  v_servings integer;
  v_meal text;
  v_id uuid;
begin
  if (select auth.uid()) is null or not private.is_member(p_household_id) then
    raise exception 'You''re not in that household.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_recipe) is distinct from 'object'
     or jsonb_typeof(p_recipe -> 'ingredients') is distinct from 'array'
     or jsonb_typeof(p_recipe -> 'steps') is distinct from 'array' then
    raise exception 'That recipe isn''t in the right shape.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_recipe -> 'ingredients') not between 1 and 60
     or jsonb_array_length(p_recipe -> 'steps') not between 1 and 40 then
    raise exception 'That recipe has too few or too many ingredients or steps.' using errcode = '22023';
  end if;

  if jsonb_typeof(p_recipe -> 'title') is distinct from 'string' then
    raise exception 'The recipe needs a title.' using errcode = '22023';
  end if;
  v_title := btrim(p_recipe ->> 'title');
  if char_length(v_title) not between 1 and 200 then
    raise exception 'The recipe needs a title.' using errcode = '22023';
  end if;

  for v_ing in select value from jsonb_array_elements(p_recipe -> 'ingredients') loop
    if jsonb_typeof(v_ing) is distinct from 'object'
       or jsonb_typeof(v_ing -> 'name') is distinct from 'string'
       or char_length(btrim(v_ing ->> 'name')) not between 1 and 120
       or jsonb_typeof(coalesce(v_ing -> 'amount', 'null'::jsonb)) not in ('number', 'null')
       or jsonb_typeof(coalesce(v_ing -> 'unit', 'null'::jsonb)) not in ('string', 'null')
       or char_length(coalesce(v_ing ->> 'unit', '')) > 40
       or ((v_ing ->> 'amount') is not null and ((v_ing ->> 'amount')::numeric <= 0 or (v_ing ->> 'amount')::numeric > 1000000)) then
      raise exception 'One of the ingredients isn''t valid.' using errcode = '22023';
    end if;
    v_ingredients := v_ingredients || jsonb_build_array(jsonb_build_object(
      'name', btrim(v_ing ->> 'name'),
      'amount', v_ing -> 'amount',
      'unit', nullif(btrim(coalesce(v_ing ->> 'unit', '')), '')
    ));
  end loop;

  for v_step in select value from jsonb_array_elements(p_recipe -> 'steps') loop
    if jsonb_typeof(v_step) is distinct from 'string' or char_length(btrim(v_step #>> '{}')) not between 1 and 1000 then
      raise exception 'One of the steps isn''t valid.' using errcode = '22023';
    end if;
    v_steps := v_steps || to_jsonb(btrim(v_step #>> '{}'));
  end loop;

  if jsonb_typeof(coalesce(p_recipe -> 'ready_in_minutes', 'null'::jsonb)) not in ('number', 'null')
     or jsonb_typeof(coalesce(p_recipe -> 'servings', 'null'::jsonb)) not in ('number', 'null')
     or jsonb_typeof(coalesce(p_recipe -> 'meal', 'null'::jsonb)) not in ('string', 'null')
     or jsonb_typeof(coalesce(p_recipe -> 'blurb', 'null'::jsonb)) not in ('string', 'null') then
    raise exception 'That recipe isn''t in the right shape.' using errcode = '22023';
  end if;
  v_minutes := (p_recipe ->> 'ready_in_minutes')::numeric::integer;
  v_servings := (p_recipe ->> 'servings')::numeric::integer;
  v_meal := nullif(lower(btrim(coalesce(p_recipe ->> 'meal', ''))), '');

  insert into public.ai_recipes (household_id, title, blurb, ready_in_minutes, servings, ingredients, steps, meal)
  values (p_household_id, v_title, btrim(coalesce(p_recipe ->> 'blurb', '')), v_minutes, v_servings, v_ingredients, v_steps, v_meal)
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.save_ai_recipe(uuid, jsonb) from public, anon;
grant execute on function public.save_ai_recipe(uuid, jsonb) to authenticated;

-- ── cook_ai_recipe ───────────────────────────────────────────────────────────

-- cook_recipe() for a saved AI recipe. Same deductions, same all-or-nothing
-- behaviour and return shape; the title comes from the saved recipe (not the
-- client) and the activity rows carry the AI recipe's id. Runs as the caller, so
-- RLS decides what they can see and change.
create function public.cook_ai_recipe(
  p_household_id uuid,
  p_ai_recipe_id uuid,
  p_deductions jsonb
)
returns table (item_id uuid, name text, unit text, quantity_before numeric, quantity_after numeric)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_line jsonb;
  v_amount numeric;
  v_title text;
begin
  select r.title into v_title
  from public.ai_recipes r
  where r.id = p_ai_recipe_id and r.household_id = p_household_id;
  if v_title is null then
    raise exception 'That recipe isn''t saved in this household.' using errcode = 'P0002';
  end if;
  if jsonb_typeof(p_deductions) is distinct from 'array' or jsonb_array_length(p_deductions) = 0 then
    raise exception 'Pick at least one thing to take out of the pantry.' using errcode = '22023';
  end if;

  perform set_config(
    'lazychef.cooking',
    jsonb_build_object('recipe_kind', 'ai', 'ai_recipe_id', p_ai_recipe_id, 'recipe_title', v_title)::text,
    true
  );

  for v_line in select value from jsonb_array_elements(p_deductions) loop
    v_amount := (v_line ->> 'amount')::numeric;
    if v_amount is null or v_amount <= 0 or v_amount > 1000000 then
      raise exception 'Amounts to take out have to be more than 0.' using errcode = '22023';
    end if;

    item_id := (v_line ->> 'item_id')::uuid;
    select p.name, p.unit, p.quantity into name, unit, quantity_before
    from public.pantry_items p
    where p.id = item_id and p.household_id = p_household_id
    for update;
    if not found then
      raise exception 'Something in this recipe was just removed from the pantry. Refresh and try again.'
        using errcode = 'P0002';
    end if;

    if quantity_before is null then
      quantity_after := null;
    else
      update public.pantry_items p
      set quantity = greatest(p.quantity - v_amount, 0)
      where p.id = item_id
      returning p.quantity into quantity_after;
    end if;
    return next;
  end loop;

  perform set_config('lazychef.cooking', '', true);
end;
$$;

revoke execute on function public.cook_ai_recipe(uuid, uuid, jsonb) from public, anon;
grant execute on function public.cook_ai_recipe(uuid, uuid, jsonb) to authenticated;

-- ── recipe_ratings ───────────────────────────────────────────────────────────

create table public.recipe_ratings (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  recipe_kind text not null check (recipe_kind in ('spoonacular', 'ai')),
  -- Spoonacular id as text, or the ai_recipes.id uuid as text.
  recipe_key text not null,
  rating smallint not null check (rating in (-1, 1)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (household_id, user_id, recipe_kind, recipe_key),
  constraint recipe_ratings_key_shape check (
    (recipe_kind = 'spoonacular' and recipe_key ~ '^[1-9][0-9]{0,9}$')
    or (recipe_kind = 'ai' and recipe_key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
  )
);

create index recipe_ratings_user_id_idx on public.recipe_ratings (user_id);
create index recipe_ratings_recipe_idx on public.recipe_ratings (household_id, recipe_kind, recipe_key);

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
  p_recipe_kind text,
  p_recipe_key text,
  p_rating smallint
)
returns smallint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_cooked boolean;
begin
  if v_uid is null or not private.is_member(p_household_id) then
    raise exception 'You''re not in that household.' using errcode = '42501';
  end if;
  if p_recipe_kind is null or p_recipe_kind not in ('spoonacular', 'ai')
     or p_recipe_key is null
     or p_rating is null or p_rating not in (-1, 1) then
    raise exception 'That isn''t a valid rating.' using errcode = '22023';
  end if;
  if p_recipe_kind = 'spoonacular' and p_recipe_key !~ '^[1-9][0-9]{0,9}$' then
    raise exception 'That isn''t a valid rating.' using errcode = '22023';
  end if;
  if p_recipe_kind = 'ai' and p_recipe_key !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'That isn''t a valid rating.' using errcode = '22023';
  end if;

  select exists (
    select 1
    from public.activity_log a
    where a.household_id = p_household_id
      and a.actor_id = v_uid
      and a.action = 'cooked'
      and case p_recipe_kind
            when 'spoonacular' then a.details ->> 'recipe_id' = p_recipe_key
            else a.details ->> 'ai_recipe_id' = p_recipe_key
          end
  ) into v_cooked;
  if not v_cooked then
    raise exception 'You can rate a recipe once you''ve cooked it.' using errcode = '42501';
  end if;

  insert into public.recipe_ratings (household_id, user_id, recipe_kind, recipe_key, rating)
  values (p_household_id, v_uid, p_recipe_kind, p_recipe_key, p_rating)
  on conflict (household_id, user_id, recipe_kind, recipe_key) do update
    set rating = excluded.rating, updated_at = now();
  return p_rating;
end;
$$;

revoke execute on function public.rate_recipe(uuid, text, text, smallint) from public, anon;
grant execute on function public.rate_recipe(uuid, text, text, smallint) to authenticated;

-- ── ai_idea_cache ────────────────────────────────────────────────────────────

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

-- Like put_spoonacular_cache(): the database's clock sets expiry (at most an
-- hour) and the household's expired entries are cleared on the way.
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
