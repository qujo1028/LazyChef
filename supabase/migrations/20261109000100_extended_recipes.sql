-- LazyChef · Extended search.
--
-- The shared TheMealDB library has 790 recipes from 63 countries. Everyday searches now
-- skip the ones most US households wouldn't make (hard-to-find ingredients, unusual meats
-- and offal, very regional dishes, near-duplicates, big projects); they only show when
-- someone turns on Extended search. Nothing is deleted.
--
-- The list lives in src/features/recipes/import/extended.ts, so `npm run recipes:import`
-- keeps the same flags. Household recipes are never extended.

alter table public.recipes
  add column extended boolean not null default false;

update public.recipes
set extended = true
where source = 'themealdb'
  and source_id in (
    '53483', '53527', '53169', '53284', '53529', '53495', '53430', '53049', '53276', '53334', '53329',
    '53392', '53406', '53156', '53147', '53127', '53050', '53396', '53481', '53496', '53456', '53460',
    '53559', '53548', '53440', '53457', '52894', '52878', '53071', '53070', '53421', '53359', '53068',
    '53307', '53463', '53466', '53018', '53300', '53580', '52979', '53401', '53438', '53311', '53458',
    '53454', '53562', '53126', '53190', '53361', '52939', '53418', '53420', '53141', '53360', '52976',
    '53564', '53508', '53330', '53455', '53358', '53516', '53063', '53289', '53542', '53446', '53524',
    '53477', '53561', '53505', '53512', '52977', '53291', '53419', '53056', '53563', '53571', '53567',
    '53379', '53387', '53382', '53285', '53031', '53149', '53254', '53139', '53123', '53188', '53030',
    '52835', '53342', '53399', '53043', '53079', '52918', '53122', '52906', '53341', '53464', '53413',
    '53061', '53572', '53509', '53465', '53025', '52896', '53131', '53381', '53012', '53346', '53041',
    '53397', '53452', '52967', '53552', '53354', '53355', '53348', '53145', '53335', '53220', '53398',
    '52971', '52769', '53445', '53449', '52974', '53494', '53502', '53286', '53216', '53027', '53434',
    '53408', '53414', '53128', '53412', '53407', '53427', '53426', '53424', '52973', '53467', '53146',
    '53504', '53472', '53474', '53221', '53433', '53515', '53402', '53400', '53140', '53132', '52968',
    '52880', '53423', '53048', '52927', '53029', '53403', '53223', '53377', '53051', '53497', '53117',
    '53129', '53121', '53500', '53422', '53501', '52943', '53150', '53537', '53429', '53520', '53017',
    '53471', '53292', '52837', '53224', '53566', '53298', '53162', '53306', '53521', '53045', '53323',
    '52932', '53499', '53410', '52921', '53230', '53574', '52933', '53124', '52809', '52941', '53118',
    '53315', '53052', '53388', '53511', '53171', '52936', '53498', '53503', '53337', '53577', '53314',
    '52836', '53054', '53470', '53215', '53409', '53395', '53023', '53432', '52964', '53163', '53183',
    '52881', '52793', '53558', '53130', '53113', '53187', '53447', '53119', '53535', '53026', '53444',
    '53194', '53165', '53318', '52926', '53391', '52975', '52972', '53114', '53325', '53326', '53062',
    '53225', '53394'
  );

-- ── match_local_recipes: same as before, plus p_extended ─────────────────────
-- A new parameter changes the signature, so drop the old one (an overload with defaults
-- would make calls ambiguous).

drop function public.match_local_recipes(uuid, integer[], text[], integer[], text[], text, integer, text, integer, integer);

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
  public.match_local_recipes(uuid, integer[], text[], integer[], text[], text, integer, text, integer, integer, boolean)
  from public, anon;
grant execute on function
  public.match_local_recipes(uuid, integer[], text[], integer[], text[], text, integer, text, integer, integer, boolean)
  to authenticated;
