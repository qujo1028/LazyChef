-- LazyChef · Push notifications (iOS and Android app).
--
-- Three kinds of push, each with its own switch: "expiring" (pantry food expires soon),
-- "list" (a housemate added to the shopping list) and "joined" (someone joined the household).
--
-- device_tokens:      one row per phone. The app registers its APNs/FCM token through
--                     register_device_token(), which also moves a token to whoever is signed in
--                     now (one phone, two accounts). People can read and delete their own rows.
-- notification_prefs: one row per person, the three switches. Missing row = all on.
-- notification_log:   what was sent, so a push goes out once (per local day, per 5 minutes of
--                     list changes, per join). Server only: no access for signed-in users.
--
-- The server sends with the secret key (service_role, bypasses RLS). Everything here is
-- personal, not household data, so there is no household_id and no realtime broadcast.
-- All three tables cascade from auth.users, so deleting an account removes them.

-- ── Device tokens ────────────────────────────────────────────────────────────

create table public.device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  token text not null unique check (char_length(token) between 1 and 4096),
  -- IANA name ("America/New_York"), so the expiring push goes out at a sensible local time.
  timezone text not null default 'UTC' check (char_length(timezone) between 1 and 64),
  app_version text check (char_length(app_version) <= 40),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index device_tokens_user_id on public.device_tokens (user_id);

alter table public.device_tokens enable row level security;

create policy "Read your own devices"
  on public.device_tokens for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "Remove your own devices"
  on public.device_tokens for delete
  to authenticated
  using (user_id = (select auth.uid()));

revoke all on table public.device_tokens from anon, authenticated;
grant select, delete on table public.device_tokens to authenticated;

-- Saves this phone's push token for the caller (insert or refresh). A token that belonged to
-- someone else moves to the caller: the phone now belongs to whoever signed in on it. An
-- unknown time zone falls back to UTC. Keeps each person's 10 most recently seen devices.
create function public.register_device_token(
  p_token text,
  p_platform text,
  p_timezone text,
  p_app_version text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_timezone text := coalesce(nullif(btrim(p_timezone), ''), 'UTC');
begin
  if v_user is null then
    raise exception 'Sign in to turn on notifications' using errcode = '42501';
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = v_timezone) then
    v_timezone := 'UTC';
  end if;

  insert into public.device_tokens as d (user_id, platform, token, timezone, app_version, last_seen_at)
  values (v_user, p_platform, btrim(p_token), v_timezone, nullif(btrim(p_app_version), ''), now())
  on conflict (token) do update set
    user_id = excluded.user_id,
    platform = excluded.platform,
    timezone = excluded.timezone,
    app_version = excluded.app_version,
    last_seen_at = now();

  delete from public.device_tokens d
  where d.user_id = v_user
    and d.id not in (
      select k.id from public.device_tokens k
      where k.user_id = v_user
      order by k.last_seen_at desc, k.id
      limit 10
    );
end;
$$;

revoke execute on function public.register_device_token(text, text, text, text) from public, anon;
grant execute on function public.register_device_token(text, text, text, text) to authenticated;

-- ── Notification switches ────────────────────────────────────────────────────

create table public.notification_prefs (
  user_id uuid primary key references auth.users (id) on delete cascade,
  expiring boolean not null default true,
  list boolean not null default true,
  joined boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.notification_prefs enable row level security;

create policy "Read your own notification settings"
  on public.notification_prefs for select
  to authenticated
  using (user_id = (select auth.uid()));

revoke all on table public.notification_prefs from anon, authenticated;
grant select on table public.notification_prefs to authenticated;

-- Saves the caller's switches. A null leaves that switch as it is (on, for a new row).
create function public.set_my_notification_prefs(
  p_expiring boolean,
  p_list boolean,
  p_joined boolean
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
    raise exception 'Sign in to change notifications' using errcode = '42501';
  end if;

  insert into public.notification_prefs as p (user_id, expiring, list, joined, updated_at)
  values (v_user, coalesce(p_expiring, true), coalesce(p_list, true), coalesce(p_joined, true), now())
  on conflict (user_id) do update set
    expiring = coalesce(p_expiring, p.expiring),
    list = coalesce(p_list, p.list),
    joined = coalesce(p_joined, p.joined),
    updated_at = now();
end;
$$;

revoke execute on function public.set_my_notification_prefs(boolean, boolean, boolean) from public, anon;
grant execute on function public.set_my_notification_prefs(boolean, boolean, boolean) to authenticated;

-- ── Sent log (dedupe) ────────────────────────────────────────────────────────

-- Inserting a row claims a push; the unique key makes a second claim fail, so the same push
-- can't go out twice even when two requests race. Example keys: "expiring:2026-11-20"
-- (recipient's local date), "list:<household>:<actor>:<5-minute bucket>" (one row for the
-- person who changed the list), "joined:<household>:<new member>".
create table public.notification_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('expiring', 'list', 'joined')),
  dedupe_key text not null check (char_length(dedupe_key) between 1 and 200),
  sent_at timestamptz not null default now(),
  unique (user_id, kind, dedupe_key)
);

create index notification_log_sent_at on public.notification_log (sent_at);

-- RLS on with no policies: only the server (secret key) reads or writes it.
alter table public.notification_log enable row level security;
revoke all on table public.notification_log from anon, authenticated;
