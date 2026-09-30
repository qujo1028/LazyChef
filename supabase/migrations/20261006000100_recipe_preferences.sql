-- LazyChef · Recipe preferences.
--
-- recipe_preferences: one row per household, shared by its members. What "Make
-- now", "Almost there" and search should leave out:
--   cuisines           the cuisine groups the household likes (empty = all). The
--                      app turns groups ("Caribbean") into the raw cuisines stored
--                      on recipes ("Jamaican", "Barbados", …).
--   hidden_meal_types  meal types never suggested (sauces, drinks, …).
--   max_ingredients    "easy": at most this many ingredients (null = any).
--   max_minutes        "quick": at most this many minutes, where a recipe says.
--
-- match_local_recipes() gains the same filters (all optional, so the app from
-- before this migration keeps working).

-- Cuisine group names: at most 40, each 1 to 40 characters.
create function private.valid_cuisines(p_cuisines text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(cardinality(p_cuisines), 0) <= 40
    and not exists (select 1 from unnest(p_cuisines) as c(name) where char_length(coalesce(c.name, '')) not between 1 and 40);
$$;

create table public.recipe_preferences (
  household_id uuid primary key references public.households (id) on delete cascade,
  cuisines text[] not null default '{}' check (private.valid_cuisines(cuisines)),
  hidden_meal_types text[] not null default array['sauce', 'marinade', 'beverage', 'drink']
    check (private.valid_meal_types(hidden_meal_types)),
  max_ingredients integer check (max_ingredients is null or max_ingredients between 3 and 30),
  max_minutes integer check (max_minutes is null or max_minutes between 5 and 240),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

create index recipe_preferences_updated_by_idx on public.recipe_preferences (updated_by);

create function private.stamp_recipe_preferences()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_by := coalesce((select auth.uid()), new.updated_by);
  new.updated_at := now();
  return new;
end;
$$;

create trigger stamp_recipe_preferences
  before insert or update on public.recipe_preferences
  for each row execute function private.stamp_recipe_preferences();

create trigger broadcast_changes
  after insert or update or delete on public.recipe_preferences
  for each row execute function private.broadcast_household_change('household_id');

alter table public.recipe_preferences enable row level security;

create policy "Members see their household's recipe preferences"
  on public.recipe_preferences for select to authenticated
  using (private.is_member(household_id));

create policy "Members set their household's recipe preferences"
  on public.recipe_preferences for insert to authenticated
  with check (private.is_member(household_id));

create policy "Members change their household's recipe preferences"
  on public.recipe_preferences for update to authenticated
  using (private.is_member(household_id))
  with check (private.is_member(household_id));

revoke all on table public.recipe_preferences from anon, authenticated;
grant select on table public.recipe_preferences to authenticated;
grant insert (household_id, cuisines, hidden_meal_types, max_ingredients, max_minutes) on table public.recipe_preferences to authenticated;
grant update (cuisines, hidden_meal_types, max_ingredients, max_minutes) on table public.recipe_preferences to authenticated;

-- ── match_local_recipes: preference filters ─────────────────────────────────

drop function public.match_local_recipes(uuid, integer[], text[], integer[], text[], text, integer, text, integer, integer);

-- Same as before, plus:
--   p_cuisines         raw cuisines to keep (null = any). Recipes without a cuisine
--                      (most household recipes) are always kept.
--   p_hide_types       drop recipes with any of these meal types.
--   p_max_ingredients  drop recipes with more (non-optional) ingredient lines.
--   p_max_minutes      as before; recipes that don't say how long are kept when
--                      p_keep_untimed (a preference), dropped otherwise (a filter).
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
  p_limit integer default 200,
  p_cuisines text[] default null,
  p_hide_types text[] default '{}',
  p_max_ingredients integer default null,
  p_keep_untimed boolean default false
)
returns table (recipe_id uuid, have_count integer, missing_count integer)
language sql
stable
security invoker
set search_path = ''
as $$
  with pattern as (
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
      and (p_max_minutes is null
           or r.ready_in_minutes <= p_max_minutes
           or (p_keep_untimed and r.ready_in_minutes is null))
      and (pattern.value is null or lower(r.title) like pattern.value)
      and (p_cuisines is null or r.cuisine is null or r.cuisine = any (p_cuisines))
      and not (r.meal_types && coalesce(p_hide_types, '{}'))
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
    and (p_max_ingredients is null
         or (select count(*) from public.recipe_ingredients ri
             where ri.recipe_id = counted.id and not ri.optional) <= p_max_ingredients)
  order by counted.missing_count, counted.have_count desc, counted.id
  limit least(greatest(coalesce(p_limit, 200), 1), 500);
$$;

revoke execute on function
  public.match_local_recipes(uuid, integer[], text[], integer[], text[], text, integer, text, integer, integer, text[], text[], integer, boolean)
  from public, anon;
grant execute on function
  public.match_local_recipes(uuid, integer[], text[], integer[], text[], text, integer, text, integer, integer, text[], text[], integer, boolean)
  to authenticated;
