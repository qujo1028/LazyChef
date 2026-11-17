-- LazyChef · Pro subscriptions (RevenueCat).
--
-- RevenueCat is the source of truth. Its webhook tells the server "something changed for
-- these people"; the server then asks RevenueCat for each person's current state and saves
-- it here (service_role only). So duplicate or out-of-order webhooks can't leave a stale row.
--
-- Pro is shared: a household has Pro when any member has it (one subscription covers the
-- house). Comps (free Pro given by hand) live in private.pro_comps.

-- ── Subscriptions: one row per person, the "pro" entitlement ─────────────────

create table public.subscriptions (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  -- RevenueCat lists the entitlement (active or expired).
  has_entitlement boolean not null default false,
  -- When it ends, grace period included. Null with has_entitlement = lifetime.
  expires_at timestamptz,
  product_id text check (product_id is null or char_length(product_id) <= 200),
  -- app_store, play_store, promotional, stripe, ...
  store text check (store is null or char_length(store) <= 40),
  -- trial, intro, normal, promotional, prepaid
  period_type text check (period_type is null or char_length(period_type) <= 40),
  is_sandbox boolean not null default false,
  -- False once the person turned off auto-renew (it still runs until expires_at).
  will_renew boolean not null default false,
  billing_issue_at timestamptz,
  -- Where the person manages it (App Store / Play Store subscriptions page).
  management_url text check (management_url is null or char_length(management_url) <= 500),
  synced_at timestamptz not null default now()
);

-- People read their own row (the Pro card); nobody but the server writes.
alter table public.subscriptions enable row level security;

create policy "People see their own subscription"
  on public.subscriptions for select
  to authenticated
  using (user_id = (select auth.uid()));

revoke all on table public.subscriptions from public, anon, authenticated;
grant select on table public.subscriptions to authenticated;
grant select, insert, update, delete on table public.subscriptions to service_role;

-- ── Webhook log: every RevenueCat event once (idempotency + later analytics) ─

create table public.revenuecat_events (
  id text primary key check (char_length(id) between 1 and 200),
  type text not null check (char_length(type) between 1 and 60),
  app_user_id text,
  environment text,
  event_at timestamptz,
  payload jsonb not null,
  received_at timestamptz not null default now()
);

create index revenuecat_events_app_user_id_idx on public.revenuecat_events (app_user_id);
create index revenuecat_events_type_event_at_idx on public.revenuecat_events (type, event_at);

alter table public.revenuecat_events enable row level security;
revoke all on table public.revenuecat_events from public, anon, authenticated;
grant select, insert, update, delete on table public.revenuecat_events to service_role;

-- ── Comps: free Pro given by hand ─────────────────────────────────────────────
-- insert into private.pro_comps (user_id, note) values ('<user id>', 'founder');

create table private.pro_comps (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  note text check (note is null or char_length(note) <= 200),
  -- Null = never ends.
  expires_at timestamptz,
  granted_at timestamptz not null default now()
);

revoke all on table private.pro_comps from public, anon, authenticated;
grant usage on schema private to service_role;
grant select, insert, update, delete on table private.pro_comps to service_role;

-- ── Checks ────────────────────────────────────────────────────────────────────

-- Whether this person has Pro of their own (subscription or comp), right now.
create function private.user_is_pro(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.subscriptions s
    where s.user_id = p_user_id
      and s.has_entitlement
      and (s.expires_at is null or s.expires_at > now())
  ) or exists (
    select 1 from private.pro_comps c
    where c.user_id = p_user_id
      and (c.expires_at is null or c.expires_at > now())
  );
$$;

-- Whether anyone in the household has Pro. Every Pro check on the server goes through here.
create function private.household_is_pro(p_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = p_household_id
      and private.user_is_pro(m.user_id)
  );
$$;

revoke execute on function private.user_is_pro(uuid), private.household_is_pro(uuid) from public, anon, authenticated;

-- The Pro card and the paywall: my own status, and whether the household has Pro through
-- someone else. Members only (an outsider gets no row).
create function public.get_pro_status(p_household_id uuid)
returns table (
  household_pro boolean,
  me_pro boolean,
  -- 'subscription' or 'comp' when I have my own Pro.
  me_source text,
  -- A housemate whose Pro covers the household, when I don't have my own.
  sponsor_name text,
  expires_at timestamptz,
  will_renew boolean,
  period_type text,
  store text,
  billing_issue_at timestamptz,
  management_url text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_sub public.subscriptions;
  v_sub_active boolean;
  v_comp boolean;
  v_me boolean;
begin
  if v_user is null or not private.is_member(p_household_id) then
    return;
  end if;

  select * into v_sub from public.subscriptions s where s.user_id = v_user;
  v_sub_active := coalesce(v_sub.has_entitlement and (v_sub.expires_at is null or v_sub.expires_at > now()), false);
  v_comp := exists (
    select 1 from private.pro_comps c
    where c.user_id = v_user and (c.expires_at is null or c.expires_at > now())
  );
  v_me := v_sub_active or v_comp;

  household_pro := v_me or private.household_is_pro(p_household_id);
  me_pro := v_me;
  me_source := case when v_sub_active then 'subscription' when v_comp then 'comp' end;
  sponsor_name := case when v_me then null else (
    select p.display_name
    from public.household_members m
    join public.profiles p on p.id = m.user_id
    where m.household_id = p_household_id
      and m.user_id <> v_user
      and private.user_is_pro(m.user_id)
    order by m.joined_at
    limit 1
  ) end;
  expires_at := case when v_sub_active then v_sub.expires_at end;
  will_renew := case when v_sub_active then v_sub.will_renew end;
  period_type := case when v_sub_active then v_sub.period_type end;
  store := case when v_sub_active then v_sub.store end;
  billing_issue_at := case when v_sub_active then v_sub.billing_issue_at end;
  management_url := v_sub.management_url;
  return next;
end;
$$;

revoke execute on function public.get_pro_status(uuid) from public, anon;
grant execute on function public.get_pro_status(uuid) to authenticated;

-- ── Rate limit for "refresh my Pro status" ────────────────────────────────────
-- After a purchase or restore, the app asks the server to fetch the person's state from
-- RevenueCat right away (the webhook can lag). Each call hits RevenueCat's API.

create or replace function private.rate_limit_rule(p_bucket text, out max_hits integer, out window_length interval)
language sql
immutable
set search_path = ''
as $$
  select r.max_hits, r.window_length
  from (values
    -- Each costs Spoonacular points (the free plan is 50 a day, shared by everyone).
    ('recipe_search', 15, interval '1 hour'),
    ('recipe_open', 40, interval '1 hour'),
    ('ingredient_lookup', 20, interval '1 hour'),
    -- Wrong invite codes: plenty for typos, useless for guessing.
    ('invite_miss', 10, interval '15 minutes'),
    -- Asking RevenueCat for my own subscription (purchase, restore, opening the app).
    ('pro_sync', 30, interval '1 hour')
  ) as r (bucket, max_hits, window_length)
  where r.bucket = p_bucket;
$$;

create or replace function public.take_rate_limit(p_bucket text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select private.take_rate_limit(p_bucket)
  where p_bucket in ('recipe_search', 'recipe_open', 'ingredient_lookup', 'pro_sync');
$$;
