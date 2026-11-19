-- LazyChef · Trending recipes for the Home tab.
-- get_trending_recipes() lists the library recipes (TheMealDB imports, household_id is
-- null) that the most different households cooked in the last 7 days. Household recipes
-- never show up. It returns only the recipe and a household count, never who cooked, and
-- a recipe needs at least 2 households so the list can't reveal what one household eats.
-- One household cooking the same thing 5 times still counts once.

-- Cooks across every household in the last week, without scanning the whole log.
create index activity_log_cooked_recent_idx
  on public.activity_log (created_at)
  where action = 'cooked';

create function public.get_trending_recipes(p_limit integer default 10)
returns table (
  id uuid,
  title text,
  image_url text,
  ready_in_minutes integer,
  household_count integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in to see trending recipes' using errcode = '42501';
  end if;

  return query
  with cooks as (
    select distinct a.household_id, a.details ->> 'local_recipe_id' as recipe_key
    from public.activity_log a
    where a.action = 'cooked'
      and a.created_at >= now() - interval '7 days'
      and a.details ? 'local_recipe_id'
  )
  select r.id, r.title, r.image_url, r.ready_in_minutes, count(*)::integer as household_count
  from cooks c
  -- Compared as text so a malformed id in details can't make the cast fail.
  join public.recipes r on r.id::text = c.recipe_key and r.household_id is null
  group by r.id, r.title, r.image_url, r.ready_in_minutes
  having count(*) >= 2
  order by household_count desc, r.title, r.id
  limit least(greatest(coalesce(p_limit, 10), 1), 50);
end;
$$;

revoke execute on function public.get_trending_recipes(integer) from public, anon;
grant execute on function public.get_trending_recipes(integer) to authenticated;
