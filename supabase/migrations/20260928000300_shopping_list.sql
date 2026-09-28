-- LazyChef · Phase 4 groundwork: the shared shopping list.
--
-- People check items off at the store, then "put away" the trip:
-- complete_shopping_trip() takes the checked items off the list and adds them
-- to the pantry in one transaction, so two housemates tapping it at once can't
-- add the same groceries twice.

create table public.shopping_list_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  -- null means no particular amount ("milk").
  quantity numeric check (quantity is null or quantity > 0),
  unit text check (unit is null or char_length(unit) between 1 and 24),
  category public.item_category not null default 'other',
  -- Spoonacular ingredient id, when known.
  ingredient_id integer,
  note text check (note is null or char_length(note) <= 200),
  -- The recipe it was added for. Spoonacular's terms allow keeping a recipe's id and title.
  recipe_id integer,
  recipe_title text check (recipe_title is null or char_length(recipe_title) <= 200),
  -- Set when someone puts it in the cart.
  checked_at timestamptz,
  checked_by uuid references public.profiles (id) on delete set null,
  added_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index shopping_list_items_household_id_idx on public.shopping_list_items (household_id);
create index shopping_list_items_added_by_idx on public.shopping_list_items (added_by);
create index shopping_list_items_checked_by_idx on public.shopping_list_items (checked_by);

-- ── Triggers ─────────────────────────────────────────────────────────────────

-- Who added and who checked off an item come from the session, and the time
-- from the server's clock, not the phone's.
create function private.stamp_shopping_list_item()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.added_by := coalesce((select auth.uid()), new.added_by);
    return new;
  end if;

  new.updated_at := now();
  if new.checked_at is null then
    new.checked_by := null;
  elsif old.checked_at is null then
    new.checked_at := now();
    new.checked_by := coalesce((select auth.uid()), new.checked_by);
  else
    -- Already checked: keep who checked it and when.
    new.checked_at := old.checked_at;
    new.checked_by := old.checked_by;
  end if;
  return new;
end;
$$;

create trigger stamp_shopping_list_item
  before insert or update on public.shopping_list_items
  for each row execute function private.stamp_shopping_list_item();

create trigger broadcast_changes
  after insert or update or delete on public.shopping_list_items
  for each row execute function private.broadcast_household_change('household_id');

-- ── Functions ────────────────────────────────────────────────────────────────
-- Both run as the caller (security invoker), so RLS and column grants apply.

-- Adds a batch of list items in one transaction. Each element is either
--   {"merge_into": "<list item id>", "quantity": 2}
--     to add more to an item that isn't checked off yet (quantity already in its unit), or
--   {"name", "quantity", "unit", "category", "ingredient_id", "note", "recipe_id", "recipe_title"}
--     for a new line.
-- Returns the affected list item ids, in input order.
create function public.add_to_shopping_list(p_household_id uuid, p_items jsonb)
returns setof uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_item jsonb;
  v_id uuid;
begin
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'p_items must be a JSON array.' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_id := null;
    if v_item ? 'merge_into' then
      update public.shopping_list_items
      set quantity = case
            when quantity is null or v_item ->> 'quantity' is null then quantity
            else quantity + (v_item ->> 'quantity')::numeric
          end
      where id = (v_item ->> 'merge_into')::uuid
        and household_id = p_household_id
        and checked_at is null
      returning id into v_id;

      if v_id is null then
        raise exception 'That list item was already checked off or removed.' using errcode = 'P0002';
      end if;
    else
      insert into public.shopping_list_items
        (household_id, name, quantity, unit, category, ingredient_id, note, recipe_id, recipe_title)
      values (
        p_household_id,
        btrim(v_item ->> 'name'),
        (v_item ->> 'quantity')::numeric,
        nullif(v_item ->> 'unit', ''),
        coalesce((v_item ->> 'category')::public.item_category, 'other'),
        (v_item ->> 'ingredient_id')::integer,
        nullif(btrim(v_item ->> 'note'), ''),
        (v_item ->> 'recipe_id')::integer,
        nullif(btrim(v_item ->> 'recipe_title'), '')
      )
      returning id into v_id;
    end if;
    return next v_id;
  end loop;
end;
$$;

-- Puts a shopping trip away: removes p_list_item_ids from the list and adds
-- p_pantry_items (same format as add_pantry_items; [] to just clear them).
-- If a housemate already put any of these away, nothing happens and it raises.
-- Returns the affected pantry item ids.
create function public.complete_shopping_trip(
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

  return query select * from public.add_pantry_items(p_household_id, coalesce(p_pantry_items, '[]'::jsonb));
end;
$$;

revoke execute on function
  public.add_to_shopping_list(uuid, jsonb),
  public.complete_shopping_trip(uuid, uuid[], jsonb)
from public, anon;

grant execute on function
  public.add_to_shopping_list(uuid, jsonb),
  public.complete_shopping_trip(uuid, uuid[], jsonb)
to authenticated;

-- ── Row level security ───────────────────────────────────────────────────────

alter table public.shopping_list_items enable row level security;

create policy "Members see their household's list"
  on public.shopping_list_items for select to authenticated
  using (private.is_member(household_id));

create policy "Members add to their household's list"
  on public.shopping_list_items for insert to authenticated
  with check (private.is_member(household_id));

create policy "Members update their household's list"
  on public.shopping_list_items for update to authenticated
  using (private.is_member(household_id))
  with check (private.is_member(household_id));

create policy "Members remove from their household's list"
  on public.shopping_list_items for delete to authenticated
  using (private.is_member(household_id));

-- Clients can't set who added or checked an item, or move it to another household.
revoke all on table public.shopping_list_items from anon, authenticated;
grant select, delete on table public.shopping_list_items to authenticated;
grant insert (household_id, name, quantity, unit, category, ingredient_id, note, recipe_id, recipe_title)
  on table public.shopping_list_items to authenticated;
grant update (name, quantity, unit, category, ingredient_id, note, checked_at)
  on table public.shopping_list_items to authenticated;
