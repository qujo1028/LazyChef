-- LazyChef · Local recipe library.
--
-- recipes / recipe_ingredients: our own recipes, so "Make now" and "Almost there"
-- can be matched in the database for free and Spoonacular is only asked for extras.
--   household_id null  → the shared library (imported from TheMealDB by
--                         scripts/import-themealdb.mjs with the server's secret key).
--                         Every signed-in user can read it; no client can change it.
--   household_id set   → that household's own recipe. Members read and edit it.
--
-- recipe-photos (Storage): photos for household recipes, stored under
-- "<household id>/<file>". Only that household's members can read or upload them.
--
-- saved_recipes: can now also save a local recipe (local_recipe_id), and keeps a
-- Spoonacular recipe's image URL. Spoonacular's terms allow keeping a recipe's
-- id, title and image, so that's still all we keep for theirs.
--
-- cook_recipe(): takes an optional local recipe id for the activity log.
--
-- match_local_recipes(): counts, per recipe, the ingredients a pantry covers and
-- the ones it's missing, so the server only loads the best few hundred recipes.

-- ── Tables ──────────────────────────────────────────────────────────────────

create type public.recipe_source as enum ('themealdb', 'user');

-- Meal types, spelled like Spoonacular's (so one set of filters works for both).
create function private.valid_meal_types(p_types text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(cardinality(p_types), 0) <= 8
    and p_types <@ array[
      'main course', 'side dish', 'dessert', 'appetizer', 'salad', 'bread', 'breakfast', 'soup',
      'beverage', 'sauce', 'marinade', 'fingerfood', 'snack', 'drink'
    ]::text[];
$$;

-- Steps: at most 60, each 1 to 2,000 characters.
create function private.valid_steps(p_steps text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(cardinality(p_steps), 0) <= 60
    and not exists (select 1 from unnest(p_steps) as s(step) where char_length(btrim(coalesce(s.step, ''))) not between 1 and 2000);
$$;

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references public.households (id) on delete cascade,
  source public.recipe_source not null default 'user',
  -- TheMealDB's idMeal. Null for household recipes.
  source_id text check (source_id is null or char_length(source_id) between 1 and 40),
  source_url text check (source_url is null or (char_length(source_url) <= 500 and source_url ~* '^https?://')),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  summary text check (summary is null or char_length(summary) <= 2000),
  cuisine text check (cuisine is null or char_length(cuisine) between 1 and 60),
  meal_types text[] not null default '{}' check (private.valid_meal_types(meal_types)),
  ready_in_minutes integer check (ready_in_minutes is null or ready_in_minutes between 1 and 2880),
  servings integer check (servings is null or servings between 1 and 100),
  instructions text[] not null default '{}' check (private.valid_steps(instructions)),
  -- An external photo (TheMealDB's, linked rather than copied). https only.
  image_url text check (image_url is null or (char_length(image_url) <= 500 and image_url ~* '^https://')),
  -- A photo in the recipe-photos bucket, always inside the household's folder.
  photo_path text check (
    photo_path is null
    or (household_id is not null
        and char_length(photo_path) <= 200
        and photo_path like household_id::text || '/%'
        and photo_path !~ '\.\.')
  ),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recipes_source_owner check (
    (source = 'themealdb' and household_id is null and source_id is not null)
    or (source = 'user' and household_id is not null)
  ),
  -- Imports upsert on this, so re-running one never duplicates a recipe.
  constraint recipes_source_source_id_key unique (source, source_id)
);

create index recipes_household_id_idx on public.recipes (household_id);
create index recipes_created_by_idx on public.recipes (created_by);
create index recipes_meal_types_idx on public.recipes using gin (meal_types);

create table public.recipe_ingredients (
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  -- Copied from the recipe by a trigger, for RLS and realtime (null = shared library).
  household_id uuid references public.households (id) on delete cascade,
  position smallint not null check (position between 0 and 99),
  -- The recipe's own line: "2 cloves garlic, minced".
  original text not null check (char_length(btrim(original)) between 1 and 300),
  -- "garlic".
  name text not null check (char_length(btrim(name)) between 1 and 120),
  -- normalizeIngredientName(name), computed by the app, for matching.
  name_key text not null check (char_length(name_key) <= 120),
  quantity numeric check (quantity is null or (quantity > 0 and quantity <= 1000000)),
  unit text check (unit is null or char_length(unit) <= 24),
  -- Our ingredient library's Spoonacular id, when the name matched one.
  ingredient_id integer check (ingredient_id is null or ingredient_id > 0),
  optional boolean not null default false,
  primary key (recipe_id, position)
);

create index recipe_ingredients_ingredient_id_idx on public.recipe_ingredients (ingredient_id);
create index recipe_ingredients_name_key_idx on public.recipe_ingredients (name_key);
create index recipe_ingredients_household_id_idx on public.recipe_ingredients (household_id);

-- ── Triggers ────────────────────────────────────────────────────────────────

-- Who made it and when come from the session and the server's clock.
create function private.stamp_recipe()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce((select auth.uid()), new.created_by);
    new.created_at := now();
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger stamp_recipe
  before insert or update on public.recipes
  for each row execute function private.stamp_recipe();

-- An ingredient always belongs to its recipe's household. Runs as the caller, so
-- a recipe the caller can't see leaves household_id null and RLS turns it away.
create function private.stamp_recipe_ingredient()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  select r.household_id into new.household_id from public.recipes r where r.id = new.recipe_id;
  return new;
end;
$$;

create trigger stamp_recipe_ingredient
  before insert or update on public.recipe_ingredients
  for each row execute function private.stamp_recipe_ingredient();

-- Household recipes broadcast to the household's channel. The shared library has
-- no household (and no channel), so its rows are skipped.
create trigger broadcast_changes_insert
  after insert on public.recipes
  for each row when (new.household_id is not null)
  execute function private.broadcast_household_change('household_id');
create trigger broadcast_changes_update
  after update on public.recipes
  for each row when (new.household_id is not null)
  execute function private.broadcast_household_change('household_id');
create trigger broadcast_changes_delete
  after delete on public.recipes
  for each row when (old.household_id is not null)
  execute function private.broadcast_household_change('household_id');

create trigger broadcast_changes_insert
  after insert on public.recipe_ingredients
  for each row when (new.household_id is not null)
  execute function private.broadcast_household_change('household_id');
create trigger broadcast_changes_update
  after update on public.recipe_ingredients
  for each row when (new.household_id is not null)
  execute function private.broadcast_household_change('household_id');
create trigger broadcast_changes_delete
  after delete on public.recipe_ingredients
  for each row when (old.household_id is not null)
  execute function private.broadcast_household_change('household_id');

-- ── RLS ─────────────────────────────────────────────────────────────────────

alter table public.recipes enable row level security;
alter table public.recipe_ingredients enable row level security;

create policy "Signed-in users read the shared library, members their household's recipes"
  on public.recipes for select to authenticated
  using (household_id is null or private.is_member(household_id));

create policy "Members add recipes to their household"
  on public.recipes for insert to authenticated
  with check (household_id is not null and source = 'user' and private.is_member(household_id));

create policy "Members edit their household's recipes"
  on public.recipes for update to authenticated
  using (household_id is not null and private.is_member(household_id))
  with check (household_id is not null and private.is_member(household_id));

create policy "Members delete their household's recipes"
  on public.recipes for delete to authenticated
  using (household_id is not null and private.is_member(household_id));

create policy "Signed-in users read shared ingredients, members their household's"
  on public.recipe_ingredients for select to authenticated
  using (household_id is null or private.is_member(household_id));

create policy "Members add ingredients to their household's recipes"
  on public.recipe_ingredients for insert to authenticated
  with check (household_id is not null and private.is_member(household_id));

create policy "Members edit ingredients of their household's recipes"
  on public.recipe_ingredients for update to authenticated
  using (household_id is not null and private.is_member(household_id))
  with check (household_id is not null and private.is_member(household_id));

create policy "Members delete ingredients of their household's recipes"
  on public.recipe_ingredients for delete to authenticated
  using (household_id is not null and private.is_member(household_id));

revoke all on table public.recipes, public.recipe_ingredients from anon, authenticated;
grant select, delete on table public.recipes, public.recipe_ingredients to authenticated;
-- No source, source_id, image_url, created_by or timestamps: those come from the
-- importer (service role) or the triggers.
grant insert (household_id, title, summary, cuisine, meal_types, ready_in_minutes, servings, instructions, photo_path, source_url)
  on table public.recipes to authenticated;
grant update (title, summary, cuisine, meal_types, ready_in_minutes, servings, instructions, photo_path, source_url)
  on table public.recipes to authenticated;
grant insert (recipe_id, position, original, name, name_key, quantity, unit, ingredient_id, optional)
  on table public.recipe_ingredients to authenticated;
grant update (original, name, name_key, quantity, unit, ingredient_id, optional)
  on table public.recipe_ingredients to authenticated;

-- ── save_household_recipe: a recipe and its ingredients in one transaction ──

-- Creates (p_recipe_id null) or updates a household recipe and replaces its
-- ingredient lines. Runs as the caller, so RLS and the column grants apply.
-- p_recipe:      {"title", "summary", "cuisine", "meal_types", "ready_in_minutes",
--                 "servings", "instructions", "photo_path", "source_url"}
-- p_ingredients: [{"original", "name", "name_key", "quantity", "unit",
--                  "ingredient_id", "optional"}, …] in order.
create function public.save_household_recipe(
  p_household_id uuid,
  p_recipe_id uuid,
  p_recipe jsonb,
  p_ingredients jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_types text[] := coalesce(array(select jsonb_array_elements_text(p_recipe -> 'meal_types')), '{}');
  v_steps text[] := coalesce(array(select btrim(s) from jsonb_array_elements_text(p_recipe -> 'instructions') as s), '{}');
begin
  if (select auth.uid()) is null or not private.is_member(p_household_id) then
    raise exception 'You''re not in that household.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_recipe) is distinct from 'object' then
    raise exception 'p_recipe must be a JSON object.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_ingredients) is distinct from 'array'
     or jsonb_array_length(p_ingredients) = 0
     or jsonb_array_length(p_ingredients) > 100 then
    raise exception 'Add between 1 and 100 ingredients.' using errcode = '22023';
  end if;

  if p_recipe_id is null then
    insert into public.recipes
      (household_id, title, summary, cuisine, meal_types, ready_in_minutes, servings, instructions, photo_path, source_url)
    values (
      p_household_id,
      btrim(p_recipe ->> 'title'),
      nullif(btrim(p_recipe ->> 'summary'), ''),
      nullif(btrim(p_recipe ->> 'cuisine'), ''),
      v_types,
      (p_recipe ->> 'ready_in_minutes')::integer,
      (p_recipe ->> 'servings')::integer,
      v_steps,
      nullif(p_recipe ->> 'photo_path', ''),
      nullif(btrim(p_recipe ->> 'source_url'), '')
    )
    returning id into v_id;
  else
    update public.recipes r
    set title = btrim(p_recipe ->> 'title'),
        summary = nullif(btrim(p_recipe ->> 'summary'), ''),
        cuisine = nullif(btrim(p_recipe ->> 'cuisine'), ''),
        meal_types = v_types,
        ready_in_minutes = (p_recipe ->> 'ready_in_minutes')::integer,
        servings = (p_recipe ->> 'servings')::integer,
        instructions = v_steps,
        photo_path = nullif(p_recipe ->> 'photo_path', ''),
        source_url = nullif(btrim(p_recipe ->> 'source_url'), '')
    where r.id = p_recipe_id and r.household_id = p_household_id
    returning r.id into v_id;
    if v_id is null then
      raise exception 'That recipe was deleted, or isn''t your household''s.' using errcode = 'P0002';
    end if;
    delete from public.recipe_ingredients where recipe_id = v_id;
  end if;

  insert into public.recipe_ingredients (recipe_id, position, original, name, name_key, quantity, unit, ingredient_id, optional)
  select
    v_id,
    (x.ordinality - 1)::smallint,
    btrim(x.value ->> 'original'),
    btrim(x.value ->> 'name'),
    coalesce(x.value ->> 'name_key', ''),
    (x.value ->> 'quantity')::numeric,
    nullif(btrim(x.value ->> 'unit'), ''),
    (x.value ->> 'ingredient_id')::integer,
    coalesce((x.value ->> 'optional')::boolean, false)
  from jsonb_array_elements(p_ingredients) with ordinality as x(value, ordinality);

  return v_id;
end;
$$;

revoke execute on function public.save_household_recipe(uuid, uuid, jsonb, jsonb) from public, anon;
grant execute on function public.save_household_recipe(uuid, uuid, jsonb, jsonb) to authenticated;

-- ── match_local_recipes: pantry coverage per recipe ─────────────────────────

-- For the shared library plus the household's own recipes: how many (non-optional,
-- non-basic) ingredients the pantry covers and how many are missing, by library id
-- or normalized name. The app sends the pantry's ids and name keys (already
-- widened, e.g. "brown rice" also sends "rice") and re-checks the winners with the
-- same rules as Spoonacular results. Runs as the caller, so RLS applies.
create function public.match_local_recipes(
  p_household_id uuid,
  p_ingredient_ids integer[],
  p_name_keys text[],
  p_ignore_ids integer[] default '{}',
  p_ignore_keys text[] default '{}',
  p_meal_type text default null,
  p_max_minutes integer default null,
  p_query text default null,
  p_max_missing integer default 3,
  p_limit integer default 200
)
returns table (recipe_id uuid, have_count integer, missing_count integer)
language sql
stable
security invoker
set search_path = ''
as $$
  with pattern as (
    -- "chicken curry" → "%chicken%curry%": every word, in order. Wildcards typed by
    -- the user are escaped.
    select case
      when nullif(btrim(p_query), '') is null then null
      else '%' || array_to_string(
        regexp_split_to_array(
          regexp_replace(lower(btrim(left(p_query, 100))), '([\\%_])', '\\\1', 'g'),
          '\s+'
        ),
        '%'
      ) || '%'
    end as value
  ),
  candidates as (
    select r.id
    from public.recipes r, pattern
    where (r.household_id is null or r.household_id = p_household_id)
      and (p_meal_type is null or p_meal_type = any (r.meal_types))
      and (p_max_minutes is null or r.ready_in_minutes <= p_max_minutes)
      and (pattern.value is null or lower(r.title) like pattern.value)
  ),
  counted as (
    select
      c.id,
      count(ri.recipe_id) filter (where m.matched)::integer as have_count,
      count(ri.recipe_id) filter (where not m.matched)::integer as missing_count
    from candidates c
    left join public.recipe_ingredients ri
      on ri.recipe_id = c.id
      and not ri.optional
      and not coalesce(ri.ingredient_id = any (p_ignore_ids), false)
      and not coalesce(ri.name_key = any (p_ignore_keys), false)
    cross join lateral (
      select coalesce(ri.ingredient_id = any (p_ingredient_ids), false)
          or coalesce(ri.name_key = any (p_name_keys), false) as matched
    ) m
    group by c.id
  )
  select counted.id, counted.have_count, counted.missing_count
  from counted, pattern
  where counted.missing_count <= greatest(coalesce(p_max_missing, 3), 0)
    and (counted.have_count > 0 or pattern.value is not null)
  order by counted.missing_count, counted.have_count desc, counted.id
  limit least(greatest(coalesce(p_limit, 200), 1), 500);
$$;

revoke execute on function
  public.match_local_recipes(uuid, integer[], text[], integer[], text[], text, integer, text, integer, integer)
  from public, anon;
grant execute on function
  public.match_local_recipes(uuid, integer[], text[], integer[], text[], text, integer, text, integer, integer)
  to authenticated;

-- ── Photos (Storage) ────────────────────────────────────────────────────────

-- 5 MB, images only. The app also resizes photos before uploading them.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recipe-photos', 'recipe-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- "<household uuid>/<file>" → the household, or null for anything else.
create function private.photo_household(p_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when p_name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[^/]+$'
      then split_part(p_name, '/', 1)::uuid
  end;
$$;

grant execute on function private.photo_household(text) to authenticated;

create policy "Members see their household's recipe photos"
  on storage.objects for select to authenticated
  using (bucket_id = 'recipe-photos' and private.is_member(private.photo_household(name)));

create policy "Members upload their household's recipe photos"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'recipe-photos' and private.is_member(private.photo_household(name)));

create policy "Members replace their household's recipe photos"
  on storage.objects for update to authenticated
  using (bucket_id = 'recipe-photos' and private.is_member(private.photo_household(name)))
  with check (bucket_id = 'recipe-photos' and private.is_member(private.photo_household(name)));

create policy "Members delete their household's recipe photos"
  on storage.objects for delete to authenticated
  using (bucket_id = 'recipe-photos' and private.is_member(private.photo_household(name)));

-- ── saved_recipes: local recipes, and Spoonacular's image ───────────────────

alter table public.saved_recipes drop constraint saved_recipes_pkey;
alter table public.saved_recipes add column id uuid not null default gen_random_uuid();
alter table public.saved_recipes add constraint saved_recipes_pkey primary key (id);
alter table public.saved_recipes alter column recipe_id drop not null;
alter table public.saved_recipes
  add column local_recipe_id uuid references public.recipes (id) on delete cascade,
  add column image_url text check (image_url is null or (char_length(image_url) <= 300 and image_url ~* '^https://([a-z0-9-]+\.)?spoonacular\.com/')),
  add constraint saved_recipes_one_recipe check (num_nonnulls(recipe_id, local_recipe_id) = 1),
  add constraint saved_recipes_household_id_recipe_id_key unique (household_id, recipe_id),
  add constraint saved_recipes_household_id_local_recipe_id_key unique (household_id, local_recipe_id);

create index saved_recipes_local_recipe_id_idx on public.saved_recipes (local_recipe_id);

drop policy "Members save recipes for their household" on public.saved_recipes;
create policy "Members save recipes for their household"
  on public.saved_recipes for insert to authenticated
  with check (
    private.is_member(household_id)
    and (
      local_recipe_id is null
      or exists (
        select 1 from public.recipes r
        where r.id = local_recipe_id
          and (r.household_id is null or r.household_id = saved_recipes.household_id)
      )
    )
  );

grant insert (household_id, recipe_id, local_recipe_id, title, image_url) on table public.saved_recipes to authenticated;

-- ── cook_recipe: optional local recipe ──────────────────────────────────────

-- Same as before, plus p_local_recipe_id. p_recipe_id (Spoonacular's) may be null
-- when a local recipe is cooked. The activity log's details get whichever is set.
drop function public.cook_recipe(uuid, integer, text, jsonb);

create function public.cook_recipe(
  p_household_id uuid,
  p_recipe_id integer,
  p_recipe_title text,
  p_deductions jsonb,
  p_local_recipe_id uuid default null
)
returns table (item_id uuid, name text, unit text, quantity_before numeric, quantity_after numeric)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_line jsonb;
  v_amount numeric;
  v_title text := nullif(btrim(p_recipe_title), '');
begin
  if jsonb_typeof(p_deductions) is distinct from 'array' or jsonb_array_length(p_deductions) = 0 then
    raise exception 'Pick at least one thing to take out of the pantry.' using errcode = '22023';
  end if;
  if v_title is null or char_length(v_title) > 200 then
    raise exception 'The recipe needs a title.' using errcode = '22023';
  end if;

  perform set_config(
    'lazychef.cooking',
    jsonb_strip_nulls(jsonb_build_object(
      'recipe_id', p_recipe_id,
      'local_recipe_id', p_local_recipe_id,
      'recipe_title', v_title
    ))::text,
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
      quantity_after := null; -- untracked: nothing to take
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

revoke execute on function public.cook_recipe(uuid, integer, text, jsonb, uuid) from public, anon;
grant execute on function public.cook_recipe(uuid, integer, text, jsonb, uuid) to authenticated;
