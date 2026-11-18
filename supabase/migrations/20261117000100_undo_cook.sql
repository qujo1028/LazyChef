-- LazyChef · Undo for "I cooked this" that really undoes it.
--
-- Undo used to put the amounts back through add_pantry_items(), which logged them
-- as "restocked" and left the "cooked" rows in the activity log. Cook counts, the
-- cooking streak and the feed all read those rows, so an undone cook still counted.
--
-- cook_recipe() now also returns its batch_id (the transaction id every "cooked"
-- row it logs shares), and undo_cook() puts the amounts back and deletes both that
-- batch's "cooked" rows and the "restocked" rows the put-back itself logs.

-- ── cook_recipe: also returns batch_id ──────────────────────────────────────

drop function public.cook_recipe(uuid, integer, text, jsonb, uuid);

create function public.cook_recipe(
  p_household_id uuid,
  p_recipe_id integer,
  p_recipe_title text,
  p_deductions jsonb,
  p_local_recipe_id uuid default null
)
returns table (
  item_id uuid,
  name text,
  unit text,
  quantity_before numeric,
  quantity_after numeric,
  batch_id bigint
)
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

  batch_id := txid_current(); -- same value log_pantry_activity() writes

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

-- ── undo_cook ────────────────────────────────────────────────────────────────

-- Undoes one of the caller's own cooks: adds p_amounts back
-- ([{"item_id": "<pantry item id>", "amount": 1.5}, …], amounts > 0) and removes
-- that cook from the activity log, all or nothing. Items deleted or untracked
-- since are skipped; expiry dates are left as they are. Security definer only to
-- delete activity rows, which members can't touch directly.
create function public.undo_cook(p_household_id uuid, p_batch_id bigint, p_amounts jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line jsonb;
  v_amount numeric;
begin
  if (select auth.uid()) is null or not private.is_member(p_household_id) then
    raise exception 'Not a member of this household.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_amounts) is distinct from 'array' then
    raise exception 'p_amounts must be a JSON array.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.activity_log a
    where a.household_id = p_household_id
      and a.batch_id = p_batch_id
      and a.action = 'cooked'
      and a.actor_id = (select auth.uid())
  ) then
    raise exception 'That cook was already undone.' using errcode = 'P0002';
  end if;

  for v_line in select value from jsonb_array_elements(p_amounts) loop
    v_amount := (v_line ->> 'amount')::numeric;
    if v_amount is null or v_amount <= 0 or v_amount > 1000000 then
      raise exception 'Amounts to put back have to be more than 0.' using errcode = '22023';
    end if;
    update public.pantry_items p
    set quantity = p.quantity + v_amount
    where p.id = (v_line ->> 'item_id')::uuid
      and p.household_id = p_household_id
      and p.quantity is not null;
  end loop;

  delete from public.activity_log a
  where a.household_id = p_household_id
    and (
      (a.batch_id = p_batch_id and a.action = 'cooked')
      or (a.batch_id = txid_current() and a.action = 'restocked')
    );
end;
$$;

revoke execute on function public.undo_cook(uuid, bigint, jsonb) from public, anon;
grant execute on function public.undo_cook(uuid, bigint, jsonb) to authenticated;
