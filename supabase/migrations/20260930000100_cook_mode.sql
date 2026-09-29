-- LazyChef · Phase 5: cook mode.
--
-- "I cooked this" takes a recipe's ingredients out of the pantry in one
-- transaction. Each item's change is logged by the usual activity trigger, as
-- "cooked" (not "used"), with the recipe in `details`, and every row shares the
-- transaction's batch_id, so the feed shows one "Alex cooked Chicken Tikka" entry.
--
-- Also: add_pantry_items can now turn a ran-out row back into an untracked one
-- ({"merge_into": id, "untrack": true}), so typing "eggs" when eggs ran out
-- reuses that row instead of adding a second "eggs".

alter type public.activity_action add value if not exists 'cooked';

-- ── Activity trigger: knows when it's running inside cook_recipe() ──────────

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

-- ── cook_recipe ──────────────────────────────────────────────────────────────

-- Takes amounts out of the household's pantry for a cooked recipe, all or
-- nothing. p_deductions: [{"item_id": "<pantry item id>", "amount": 1.5}, …],
-- amounts > 0 and already in each item's unit. Like adjust_pantry_quantity(),
-- amounts stop at 0. Untracked items (quantity null) are left alone. An item
-- listed twice is taken from twice. Returns each item before and after, so the
-- app can offer Undo and "add to list" for anything that ran out.
create function public.cook_recipe(
  p_household_id uuid,
  p_recipe_id integer,
  p_recipe_title text,
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
    jsonb_build_object('recipe_id', p_recipe_id, 'recipe_title', v_title)::text,
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

revoke execute on function public.cook_recipe(uuid, integer, text, jsonb) from public, anon;
grant execute on function public.cook_recipe(uuid, integer, text, jsonb) to authenticated;

-- ── add_pantry_items: "untrack" a ran-out row ────────────────────────────────

-- Same as before, plus {"merge_into": id, "untrack": true} to make an item
-- untracked (quantity null) again, for "eggs" typed without an amount after
-- eggs ran out.
create or replace function public.add_pantry_items(p_household_id uuid, p_items jsonb)
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
            when coalesce((v_item ->> 'untrack')::boolean, false) then null
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
