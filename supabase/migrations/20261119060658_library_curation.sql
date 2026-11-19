-- Library curation · Hide recipes from discovery for good.
--
-- recipes.hidden: set by the server (secret key) on shared-library recipes that were cut from the
-- library (drinks, and dishes few Americans would know). Unlike `extended`, Extended search does
-- not bring them back: match_local_recipes always skips them. They still open directly, so a
-- saved recipe or a past cook keeps working. Households can't set it (no column grant).

alter table public.recipes add column hidden boolean not null default false;

-- ── match_local_recipes: same signature, plus "not hidden" ──────────────────

create or replace function public.match_local_recipes(
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
  -- Extended search: include recipes flagged extended (unusual, regional, duplicates).
  p_extended boolean default false
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
      and (p_extended or not r.extended)
      and not r.hidden
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
