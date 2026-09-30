-- LazyChef · Phase 6: saved recipes and shopping-trip stats.
--
-- saved_recipes: the household's shared favorites. Spoonacular's terms allow
-- keeping a recipe's id and title, so that's all we keep; the image URL is
-- built from the id and the ingredients come from the hourly cache.
--
-- 'shopped': complete_shopping_trip() now marks its pantry changes, so the
-- activity log (and the Stats page) can tell a shopping trip from someone
-- typing food in. Trips put away before this migration stay as added/restocked.

alter type public.activity_action add value if not exists 'shopped';

-- ── saved_recipes ────────────────────────────────────────────────────────────

create table public.saved_recipes (
  household_id uuid not null references public.households (id) on delete cascade,
  recipe_id integer not null check (recipe_id > 0),
  title text not null check (char_length(title) between 1 and 200),
  saved_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (household_id, recipe_id)
);

create index saved_recipes_saved_by_idx on public.saved_recipes (saved_by);

-- Who saved it comes from the session, not the client.
create function private.stamp_saved_recipe()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.saved_by := coalesce((select auth.uid()), new.saved_by);
  new.created_at := now();
  return new;
end;
$$;

create trigger stamp_saved_recipe
  before insert on public.saved_recipes
  for each row execute function private.stamp_saved_recipe();

create trigger broadcast_changes
  after insert or update or delete on public.saved_recipes
  for each row execute function private.broadcast_household_change('household_id');

alter table public.saved_recipes enable row level security;

create policy "Members see their household's saved recipes"
  on public.saved_recipes for select to authenticated
  using (private.is_member(household_id));

create policy "Members save recipes for their household"
  on public.saved_recipes for insert to authenticated
  with check (private.is_member(household_id));

create policy "Members unsave their household's recipes"
  on public.saved_recipes for delete to authenticated
  using (private.is_member(household_id));

revoke all on table public.saved_recipes from anon, authenticated;
grant select, delete on table public.saved_recipes to authenticated;
grant insert (household_id, recipe_id, title) on table public.saved_recipes to authenticated;

-- ── Activity trigger: knows when it's running inside a shopping trip ─────────

create or replace function private.log_pantry_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.pantry_items;
  v_action public.activity_action;
  v_amount numeric;
  v_details jsonb := '{}'::jsonb;
  -- Set (transaction-locally) by cook_recipe(): {"recipe_id": …, "recipe_title": …}.
  v_cooking jsonb := nullif(current_setting('lazychef.cooking', true), '')::jsonb;
  -- Set (transaction-locally) by complete_shopping_trip().
  v_shopping boolean := coalesce(nullif(current_setting('lazychef.shopping', true), ''), '0') = '1';
begin
  if tg_op = 'DELETE' then
    v_item := old;
  else
    v_item := new;
  end if;

  -- Cascading from a deleted household: there's nothing left to log against.
  if not exists (select 1 from public.households h where h.id = v_item.household_id) then
    return null;
  end if;

  if v_shopping and tg_op <> 'DELETE' then
    -- Everything a trip adds or tops up counts as bought, including untracked
    -- items ("milk") whose amount doesn't change.
    v_action := 'shopped';
    v_amount := case
      when tg_op = 'INSERT' then new.quantity
      when new.quantity is not null and old.quantity is not null and new.unit = old.unit
        then nullif(greatest(new.quantity - old.quantity, 0), 0)
      else null
    end;
  elsif tg_op = 'INSERT' then
    v_action := 'added';
    v_amount := new.quantity;
  elsif tg_op = 'DELETE' then
    v_action := 'removed';
    v_amount := old.quantity;
  elsif new.quantity is distinct from old.quantity
        and new.unit = old.unit
        and new.quantity is not null
        and old.quantity is not null then
    if new.quantity < old.quantity and v_cooking is not null then
      v_action := 'cooked';
      v_details := v_cooking;
    else
      v_action := case when new.quantity < old.quantity then 'used' else 'restocked' end;
    end if;
    v_amount := abs(new.quantity - old.quantity);
  elsif (new.name, new.quantity, new.unit, new.category, new.expires_on, new.is_staple)
        is distinct from (old.name, old.quantity, old.unit, old.category, old.expires_on, old.is_staple) then
    v_action := 'updated';
    v_details := jsonb_build_object(
      'before', jsonb_build_object(
        'name', old.name, 'quantity', old.quantity, 'unit', old.unit,
        'category', old.category, 'expires_on', old.expires_on, 'is_staple', old.is_staple
      )
    );
  else
    return null; -- nothing a housemate would care about
  end if;

  insert into public.activity_log (household_id, actor_id, action, item_name, quantity, unit, batch_id, details)
  values (v_item.household_id, (select auth.uid()), v_action, v_item.name, v_amount, v_item.unit, txid_current(), v_details);
  return null;
end;
$$;

-- ── complete_shopping_trip: same as before, logged as 'shopped' ─────────────

create or replace function public.complete_shopping_trip(
  p_household_id uuid,
  p_list_item_ids uuid[],
  p_pantry_items jsonb
)
returns setof uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_expected integer;
  v_removed integer;
begin
  select count(distinct x)::integer into v_expected from unnest(p_list_item_ids) as t(x);
  if v_expected = 0 then
    raise exception 'Nothing to put away.' using errcode = '22023';
  end if;

  -- Take them off the list first. Concurrent trips wait on these row locks, then
  -- find fewer rows and stop before anything is added twice.
  with removed as (
    delete from public.shopping_list_items
    where household_id = p_household_id
      and id = any (p_list_item_ids)
    returning id
  )
  select count(*)::integer into v_removed from removed;

  if v_removed <> v_expected then
    raise exception 'Someone already put some of these away. Refresh and try again.' using errcode = 'P0001';
  end if;

  perform set_config('lazychef.shopping', '1', true);
  return query select * from public.add_pantry_items(p_household_id, coalesce(p_pantry_items, '[]'::jsonb));
  perform set_config('lazychef.shopping', '', true);
end;
$$;
