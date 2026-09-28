-- LazyChef · Phase 2: pantry items, categories and the activity log.
--
-- Every change to a pantry item is attributed and logged by triggers, so the
-- activity feed can't be skipped or faked. Quantity changes that should compose
-- (two people using eggs at once) go through adjust_pantry_quantity().

create type public.item_category as enum (
  'produce', 'bakery', 'meat', 'seafood', 'dairy', 'frozen', 'grains', 'baking',
  'canned', 'condiments', 'spices', 'snacks', 'beverages', 'other'
);

-- Later phases add values (cooked, shopped, …) with ALTER TYPE … ADD VALUE.
create type public.activity_action as enum ('added', 'used', 'restocked', 'updated', 'removed');

-- ── Tables ───────────────────────────────────────────────────────────────────

create table public.pantry_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  -- null means "not tracked", typical for staples like salt.
  quantity numeric check (quantity is null or quantity >= 0),
  unit text not null default 'count' check (char_length(unit) between 1 and 24),
  category public.item_category not null default 'other',
  expires_on date,
  -- Always on hand: counts as available for recipes and is never deducted.
  is_staple boolean not null default false,
  -- Spoonacular ingredient id, when known, to match recipe ingredients exactly.
  ingredient_id integer,
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index pantry_items_household_id_idx on public.pantry_items (household_id);
create index pantry_items_created_by_idx on public.pantry_items (created_by);
create index pantry_items_updated_by_idx on public.pantry_items (updated_by);

-- A household's manual category fixes, keyed by normalized ingredient name,
-- so "oat milk → dairy" sticks the next time someone adds it.
create table public.category_overrides (
  household_id uuid not null references public.households (id) on delete cascade,
  ingredient_key text not null check (char_length(ingredient_key) between 1 and 80),
  category public.item_category not null,
  updated_at timestamptz not null default now(),
  primary key (household_id, ingredient_key)
);

create table public.activity_log (
  id bigint generated always as identity primary key,
  household_id uuid not null references public.households (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  action public.activity_action not null,
  item_name text not null,
  -- Size of the change (always positive) for added/used/restocked/removed, in `unit`.
  quantity numeric,
  unit text,
  -- Rows written by the same request share a batch (one transaction id), so a
  -- shopping trip shows up as one entry.
  batch_id bigint not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index activity_log_household_created_idx on public.activity_log (household_id, created_at desc);
create index activity_log_actor_id_idx on public.activity_log (actor_id);

-- ── Triggers ─────────────────────────────────────────────────────────────────

-- Who created or last changed an item comes from the session, not the client.
create function private.stamp_pantry_item()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce((select auth.uid()), new.created_by);
    new.updated_by := new.created_by;
  else
    new.updated_by := coalesce((select auth.uid()), new.updated_by);
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create trigger stamp_pantry_item
  before insert or update on public.pantry_items
  for each row execute function private.stamp_pantry_item();

create function private.log_pantry_activity()
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

  if tg_op = 'INSERT' then
    v_action := 'added';
    v_amount := new.quantity;
  elsif tg_op = 'DELETE' then
    v_action := 'removed';
    v_amount := old.quantity;
  elsif new.quantity is distinct from old.quantity
        and new.unit = old.unit
        and new.quantity is not null
        and old.quantity is not null then
    v_action := case when new.quantity < old.quantity then 'used' else 'restocked' end;
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

create trigger log_activity
  after insert or update or delete on public.pantry_items
  for each row execute function private.log_pantry_activity();

create trigger broadcast_changes
  after insert or update or delete on public.pantry_items
  for each row execute function private.broadcast_household_change('household_id');

create trigger broadcast_changes
  after insert on public.activity_log
  for each row execute function private.broadcast_household_change('household_id');

-- ── Functions ────────────────────────────────────────────────────────────────
-- Both run as the caller (security invoker), so RLS and column grants apply.

-- Change an amount relative to what's there now. Never goes below zero.
-- Returns the new quantity, or null if the item isn't visible to the caller.
create function public.adjust_pantry_quantity(p_item_id uuid, p_delta numeric)
returns numeric
language sql
security invoker
set search_path = ''
as $$
  update public.pantry_items
  set quantity = greatest(coalesce(quantity, 0) + p_delta, 0)
  where id = p_item_id
  returning quantity;
$$;

-- Adds a batch of items in one transaction (so the activity feed groups them).
-- Each element is either
--   {"merge_into": "<item id>", "quantity": 2, "expires_on": "2026-10-04"}
--     to top up an existing item (quantity already converted to that item's unit), or
--   {"name", "quantity", "unit", "category", "expires_on", "is_staple", "ingredient_id"}
--     for a new item.
-- Returns the affected item ids, in input order.
create function public.add_pantry_items(p_household_id uuid, p_items jsonb)
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
      update public.pantry_items
      set quantity = case
            when quantity is null or v_item ->> 'quantity' is null then quantity
            else quantity + (v_item ->> 'quantity')::numeric
          end,
          -- A restocked item that had run out takes the new date; otherwise keep the earliest.
          expires_on = case
            when quantity = 0 then (v_item ->> 'expires_on')::date
            else least(expires_on, (v_item ->> 'expires_on')::date)
          end
      where id = (v_item ->> 'merge_into')::uuid
        and household_id = p_household_id
      returning id into v_id;

      if v_id is null then
        raise exception 'That pantry item no longer exists.' using errcode = 'P0002';
      end if;
    else
      insert into public.pantry_items (household_id, name, quantity, unit, category, expires_on, is_staple, ingredient_id)
      values (
        p_household_id,
        btrim(v_item ->> 'name'),
        (v_item ->> 'quantity')::numeric,
        coalesce(nullif(v_item ->> 'unit', ''), 'count'),
        coalesce((v_item ->> 'category')::public.item_category, 'other'),
        (v_item ->> 'expires_on')::date,
        coalesce((v_item ->> 'is_staple')::boolean, false),
        (v_item ->> 'ingredient_id')::integer
      )
      returning id into v_id;
    end if;
    return next v_id;
  end loop;
end;
$$;

revoke execute on function
  public.adjust_pantry_quantity(uuid, numeric),
  public.add_pantry_items(uuid, jsonb)
from public, anon;

grant execute on function
  public.adjust_pantry_quantity(uuid, numeric),
  public.add_pantry_items(uuid, jsonb)
to authenticated;

-- ── Row level security ───────────────────────────────────────────────────────

alter table public.pantry_items enable row level security;
alter table public.category_overrides enable row level security;
alter table public.activity_log enable row level security;

create policy "Members see their household's pantry"
  on public.pantry_items for select to authenticated
  using (private.is_member(household_id));

create policy "Members add to their household's pantry"
  on public.pantry_items for insert to authenticated
  with check (private.is_member(household_id));

create policy "Members update their household's pantry"
  on public.pantry_items for update to authenticated
  using (private.is_member(household_id))
  with check (private.is_member(household_id));

create policy "Members remove from their household's pantry"
  on public.pantry_items for delete to authenticated
  using (private.is_member(household_id));

create policy "Members manage their household's category fixes"
  on public.category_overrides for all to authenticated
  using (private.is_member(household_id))
  with check (private.is_member(household_id));

create policy "Members read their household's activity"
  on public.activity_log for select to authenticated
  using (private.is_member(household_id));

-- Clients can't set who created/changed an item, move it to another household,
-- or write the activity log directly.
revoke all on table public.pantry_items, public.category_overrides, public.activity_log from anon, authenticated;
grant select, delete on table public.pantry_items to authenticated;
grant insert (household_id, name, quantity, unit, category, expires_on, is_staple, ingredient_id)
  on table public.pantry_items to authenticated;
grant update (name, quantity, unit, category, expires_on, is_staple, ingredient_id)
  on table public.pantry_items to authenticated;
grant select, insert, update, delete on table public.category_overrides to authenticated;
grant select on table public.activity_log to authenticated;
