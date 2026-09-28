-- LazyChef · Phase 1: profiles, households, membership and invites.
--
-- Everything a household shares hangs off households.id. Access is decided by
-- private.is_member(), which the RLS policies in later phases reuse. Joining,
-- creating and leaving households only happen through the functions below, so
-- clients never insert membership rows directly.

create extension if not exists pgcrypto with schema extensions;

-- Helpers used by RLS live outside the API-exposed schemas.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;
alter default privileges in schema private revoke execute on functions from public;

create type public.household_role as enum ('owner', 'member');

-- ── Tables ───────────────────────────────────────────────────────────────────

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60),
  avatar_url text,
  active_household_id uuid,
  created_at timestamptz not null default now()
);

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  -- 8 characters with look-alikes (I, L, O, 0, 1) removed.
  invite_code text not null unique check (invite_code ~ '^[A-HJKMNP-Z2-9]{8}$'),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.profiles
  add constraint profiles_active_household_id_fkey
  foreign key (active_household_id) references public.households (id) on delete set null;

create table public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.household_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create index household_members_user_id_idx on public.household_members (user_id);
create index households_created_by_idx on public.households (created_by);
create index profiles_active_household_id_idx on public.profiles (active_household_id);

-- ── Private helpers ──────────────────────────────────────────────────────────

create function private.generate_invite_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  bytes bytea := extensions.gen_random_bytes(8);
  code text := '';
begin
  for i in 0..7 loop
    code := code || substr(alphabet, (get_byte(bytes, i) % 31) + 1, 1);
  end loop;
  return code;
end;
$$;

create function private.normalize_invite_code(p_code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
$$;

-- security definer so policies on household_members can call it without recursing.
create function private.is_member(p_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = p_household_id
      and m.user_id = (select auth.uid())
  );
$$;

create function private.is_owner(p_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = p_household_id
      and m.user_id = (select auth.uid())
      and m.role = 'owner'
  );
$$;

create function private.shares_household(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_members mine
    join public.household_members theirs on theirs.household_id = mine.household_id
    where mine.user_id = (select auth.uid())
      and theirs.user_id = p_user_id
  );
$$;

-- Realtime topics are named 'household:<uuid>'.
create function private.is_topic_member(p_topic text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.household_members m
    where m.user_id = (select auth.uid())
      and p_topic = 'household:' || m.household_id::text
  );
$$;

grant execute on function
  private.is_member(uuid),
  private.is_owner(uuid),
  private.shares_household(uuid),
  private.is_topic_member(text)
to authenticated;

-- ── Profiles are created on sign-up ──────────────────────────────────────────

create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    left(coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Cook'
    ), 60),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Anyone who signed up before this migration ran.
insert into public.profiles (id, display_name, avatar_url)
select
  u.id,
  left(coalesce(
    nullif(btrim(u.raw_user_meta_data ->> 'display_name'), ''),
    nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
    nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
    'Cook'
  ), 60),
  u.raw_user_meta_data ->> 'avatar_url'
from auth.users u
on conflict (id) do nothing;

-- ── Household functions (the only way to create, join or leave) ──────────────

create function public.create_household(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_name text := btrim(coalesce(p_name, ''));
  v_household uuid;
begin
  if v_user is null then
    raise exception 'You need to be signed in.' using errcode = '42501';
  end if;
  if char_length(v_name) not between 1 and 60 then
    raise exception 'Household names need 1 to 60 characters.' using errcode = '22023';
  end if;

  loop
    begin
      insert into public.households (name, invite_code, created_by)
      values (v_name, private.generate_invite_code(), v_user)
      returning id into v_household;
      exit;
    exception when unique_violation then
      -- Invite code collision (vanishingly rare): draw another one.
    end;
  end loop;

  insert into public.household_members (household_id, user_id, role)
  values (v_household, v_user, 'owner');

  update public.profiles set active_household_id = v_household where id = v_user;
  return v_household;
end;
$$;

create function public.get_invite_preview(p_code text)
returns table (household_id uuid, household_name text, member_count integer, is_member boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select
    h.id,
    h.name,
    (select count(*)::integer from public.household_members m where m.household_id = h.id),
    exists (
      select 1 from public.household_members m
      where m.household_id = h.id and m.user_id = (select auth.uid())
    )
  from public.households h
  where h.invite_code = private.normalize_invite_code(p_code)
    and (select auth.uid()) is not null;
$$;

create function public.join_household(p_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_household uuid;
begin
  if v_user is null then
    raise exception 'You need to be signed in.' using errcode = '42501';
  end if;

  select id into v_household
  from public.households
  where invite_code = private.normalize_invite_code(p_code);

  if v_household is null then
    raise exception 'That invite code doesn''t match any household.' using errcode = 'P0002';
  end if;

  insert into public.household_members (household_id, user_id)
  values (v_household, v_user)
  on conflict (household_id, user_id) do nothing;

  update public.profiles set active_household_id = v_household where id = v_user;
  return v_household;
end;
$$;

create function public.regenerate_invite_code(p_household_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
begin
  if not private.is_owner(p_household_id) then
    raise exception 'Only the household owner can reset the invite code.' using errcode = '42501';
  end if;

  loop
    begin
      update public.households
      set invite_code = private.generate_invite_code()
      where id = p_household_id
      returning invite_code into v_code;
      exit;
    exception when unique_violation then
      -- Collision: try again.
    end;
  end loop;

  return v_code;
end;
$$;

create function public.leave_household(p_household_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_role public.household_role;
begin
  delete from public.household_members
  where household_id = p_household_id and user_id = v_user
  returning role into v_role;

  if v_role is null then
    raise exception 'You''re not a member of that household.' using errcode = '42501';
  end if;

  if not exists (select 1 from public.household_members where household_id = p_household_id) then
    -- Last one out: the household and everything in it goes away.
    delete from public.households where id = p_household_id;
  elsif v_role = 'owner' and not exists (
    select 1 from public.household_members
    where household_id = p_household_id and role = 'owner'
  ) then
    -- Hand ownership to whoever has been in the household longest.
    update public.household_members
    set role = 'owner'
    where (household_id, user_id) = (
      select m.household_id, m.user_id
      from public.household_members m
      where m.household_id = p_household_id
      order by m.joined_at
      limit 1
    );
  end if;

  update public.profiles
  set active_household_id = (
    select m.household_id from public.household_members m
    where m.user_id = v_user
    order by m.joined_at
    limit 1
  )
  where id = v_user
    and (active_household_id is null or active_household_id = p_household_id);
end;
$$;

create function public.remove_member(p_household_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_owner(p_household_id) then
    raise exception 'Only the household owner can remove people.' using errcode = '42501';
  end if;
  if p_user_id = (select auth.uid()) then
    raise exception 'Use "Leave household" to remove yourself.' using errcode = '22023';
  end if;

  delete from public.household_members
  where household_id = p_household_id and user_id = p_user_id;

  update public.profiles
  set active_household_id = (
    select m.household_id from public.household_members m
    where m.user_id = p_user_id
    order by m.joined_at
    limit 1
  )
  where id = p_user_id and active_household_id = p_household_id;
end;
$$;

revoke execute on function
  public.create_household(text),
  public.get_invite_preview(text),
  public.join_household(text),
  public.regenerate_invite_code(uuid),
  public.leave_household(uuid),
  public.remove_member(uuid, uuid)
from public, anon;

grant execute on function
  public.create_household(text),
  public.get_invite_preview(text),
  public.join_household(text),
  public.regenerate_invite_code(uuid),
  public.leave_household(uuid),
  public.remove_member(uuid, uuid)
to authenticated;

-- ── Row level security ───────────────────────────────────────────────────────

alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;

create policy "Read your own profile and your housemates'"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or private.shares_household(id));

create policy "Update your own profile"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (
    id = (select auth.uid())
    and (active_household_id is null or private.is_member(active_household_id))
  );

create policy "Members can see their households"
  on public.households for select to authenticated
  using (private.is_member(id));

create policy "Owners can rename their households"
  on public.households for update to authenticated
  using (private.is_owner(id))
  with check (private.is_owner(id));

create policy "Members can see who is in their households"
  on public.household_members for select to authenticated
  using (private.is_member(household_id));

-- Table grants: reads go through RLS; the only direct writes are the columns
-- below. Everything else happens inside the functions above.
revoke all on table public.profiles, public.households, public.household_members from anon, authenticated;
grant select on table public.profiles, public.households, public.household_members to authenticated;
grant update (display_name, avatar_url, active_household_id) on table public.profiles to authenticated;
grant update (name) on table public.households to authenticated;

-- ── Realtime: changes go to a private channel per household ──────────────────

create function private.broadcast_household_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- tg_argv[0] names the column that holds the household id.
  v_household text := coalesce(to_jsonb(new), to_jsonb(old)) ->> tg_argv[0];
begin
  perform realtime.broadcast_changes(
    'household:' || v_household,
    tg_op,
    tg_op,
    tg_table_name,
    tg_table_schema,
    new,
    old
  );
  return null;
end;
$$;

create trigger broadcast_changes
  after insert or update or delete on public.household_members
  for each row execute function private.broadcast_household_change('household_id');

create trigger broadcast_changes
  after update or delete on public.households
  for each row execute function private.broadcast_household_change('id');

create policy "Household members can listen to their household channel"
  on realtime.messages for select to authenticated
  using (private.is_topic_member((select realtime.topic())));
