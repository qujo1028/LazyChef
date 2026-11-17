-- LazyChef · Food preferences (first-run flow).
--
-- One row per person: diet, allergies, liked cuisines and whether recipe ideas include
-- less familiar ("world") cuisines by default. Preferences are personal, not shared
-- with the household, so the row is scoped by user_id rather than household_id and
-- only its owner can read it. Writes go through set_my_preferences(), which only ever
-- touches the caller's own row. No realtime broadcast: nobody else watches this row.
--
-- The allowed values match src/features/preferences/options.ts.

create table public.user_preferences (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  diet text not null default 'none'
    check (diet in ('none', 'vegetarian', 'vegan', 'pescatarian')),
  allergies text[] not null default '{}'
    check (allergies <@ array['dairy', 'egg', 'gluten', 'peanut', 'tree-nut', 'fish', 'shellfish', 'soy', 'sesame']::text[]),
  cuisines text[] not null default '{}'
    check (cuisines <@ array['american', 'british', 'italian', 'mexican', 'chinese', 'japanese', 'thai', 'indian', 'french', 'spanish', 'greek']::text[]),
  world_recipes boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.user_preferences enable row level security;

create policy "Read your own food preferences"
  on public.user_preferences for select
  to authenticated
  using (user_id = (select auth.uid()));

revoke all on table public.user_preferences from anon, authenticated;
grant select on table public.user_preferences to authenticated;

-- Saves the caller's preferences (insert or replace). Duplicates are dropped and the
-- arrays sorted, so the row reads the same however the choices were tapped.
create function public.set_my_preferences(
  p_diet text,
  p_allergies text[],
  p_cuisines text[],
  p_world_recipes boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'Sign in to save your preferences' using errcode = '42501';
  end if;

  insert into public.user_preferences as p (user_id, diet, allergies, cuisines, world_recipes, updated_at)
  values (
    v_user,
    coalesce(p_diet, 'none'),
    coalesce((select array_agg(distinct a order by a) from unnest(p_allergies) a), '{}'),
    coalesce((select array_agg(distinct c order by c) from unnest(p_cuisines) c), '{}'),
    coalesce(p_world_recipes, false),
    now()
  )
  on conflict (user_id) do update set
    diet = excluded.diet,
    allergies = excluded.allergies,
    cuisines = excluded.cuisines,
    world_recipes = excluded.world_recipes,
    updated_at = now();
end;
$$;

revoke execute on function public.set_my_preferences(text, text[], text[], boolean) from public, anon;
grant execute on function public.set_my_preferences(text, text[], text[], boolean) to authenticated;
