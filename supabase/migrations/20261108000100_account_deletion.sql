-- LazyChef · Account deletion (App Store guideline 5.1.1(v)).
--
-- The app deletes an account by deleting the auth user with the secret key
-- (deleteAccount in src/features/account/actions.ts). auth.users → profiles →
-- household_members already cascade, and every "who did this" column is
-- `on delete set null`. This migration covers what those foreign keys don't:
--
-- 1. A household whose last member is gone is deleted with everything in it,
--    and one whose only owner is gone passes to its longest-standing member.
--    This now happens whenever a membership row goes away, however it went
--    (leave_household already did both itself; this keeps it true for deleted
--    accounts too, including ones deleted from the Supabase dashboard).
-- 2. Two stamping triggers deliberately keep who created a recipe and who
--    checked off a list line. They'd put a deleted person's id straight back
--    after the foreign key cleared it, so they now let go once the profile is gone.
--
-- Activity entries in shared households stay, with no actor ("Someone").
-- Recipe photos live in Storage, which SQL can't delete from; the app removes
-- the folders of households that were deleted.

-- ── 1. Empty and ownerless households ────────────────────────────────────────

create function private.handle_member_removed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Cascading from a deleted household: nothing left to tidy.
  if not exists (select 1 from public.households where id = old.household_id) then
    return null;
  end if;

  if not exists (select 1 from public.household_members where household_id = old.household_id) then
    -- Last one out: the household and everything in it goes away.
    delete from public.households where id = old.household_id;
  elsif not exists (
    select 1 from public.household_members
    where household_id = old.household_id and role = 'owner'
  ) then
    -- Hand ownership to whoever has been in the household longest.
    update public.household_members
    set role = 'owner'
    where (household_id, user_id) = (
      select m.household_id, m.user_id
      from public.household_members m
      where m.household_id = old.household_id
      order by m.joined_at, m.user_id
      limit 1
    );
  end if;
  return null;
end;
$$;

create trigger tidy_household
  after delete on public.household_members
  for each row execute function private.handle_member_removed();

-- ── 2. Stamps let go of deleted people ───────────────────────────────────────

create or replace function private.stamp_recipe()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce((select auth.uid()), new.created_by);
    new.created_at := now();
  else
    -- Who made it never changes, unless their account was deleted.
    if old.created_by is not null and exists (select 1 from public.profiles p where p.id = old.created_by) then
      new.created_by := old.created_by;
    end if;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.stamp_shopping_list_item()
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
    -- Already checked: keep who checked it and when (unless their account was deleted).
    new.checked_at := old.checked_at;
    if old.checked_by is not null and exists (select 1 from public.profiles p where p.id = old.checked_by) then
      new.checked_by := old.checked_by;
    end if;
  end if;
  return new;
end;
$$;
