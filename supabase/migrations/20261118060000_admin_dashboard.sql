-- LazyChef · Admin dashboard data layer.
--
-- Everything the /admin pages read or write, as service_role-only functions:
--   * private.daily_counters / daily_snapshots / admin_audit_log: the only new tables. They
--     live in the private schema and no API role (anon, authenticated, service_role) can touch
--     them directly. Only the functions below do, as their owner.
--   * public.admin_* functions: aggregates for the dashboard, plus find-user, comps and the
--     audit log. Every one is `security definer`, `set search_path = ''`, and executable by
--     service_role ONLY. The app server calls them with the secret key, after requireAdmin().
--     They return aggregates, never personal data, with two exceptions:
--       admin_find_user       the one user a support admin looked up, by exact email
--       admin_audit_recent    the admin's own email, as written to the audit log
--   * take_rate_limit / take_ai_allowance now count what they do (daily counters), nothing
--     else about them changes: same signatures, same allowlist, same grants.
--   * bump_daily_metric: lets the server count a few fixed kinds of event (AI errors,
--     Spoonacular cache hits and errors). The metric name must match a strict pattern.
--
-- Unlike the household functions, these have no auth.uid() check: no signed-in user can run
-- them at all (EXECUTE is granted to service_role only), and the server re-checks the admin
-- with requireAdmin() (ADMIN_EMAILS) before calling them with the secret key.

-- ── Tables (private) ──────────────────────────────────────────────────────────

-- One number per (UTC day, metric). Written only by private.bump_daily().
create table private.daily_counters (
  day date not null,
  metric text not null check (char_length(metric) between 1 and 60),
  n bigint not null default 0 check (n >= 0),
  primary key (day, metric)
);

-- One row per UTC day: totals as of the end of that day. Written by
-- admin_capture_daily_snapshot() and the back-fill below. Columns other than day are
-- nullable because back-filled days only know users and households.
create table private.daily_snapshots (
  day date primary key,
  captured_at timestamptz not null default now(),
  users_total integer,
  households_total integer,
  multi_member_households integer,
  pro_households integer,
  paying_users integer,
  trials_active integer,
  comps_active integer,
  mrr_est_usd numeric,
  pantry_items_total integer,
  shopping_items_open integer,
  saved_recipes_total integer,
  spoonacular_points_used numeric
);

-- Who did what in the admin dashboard. Append-only (see the trigger below).
create table private.admin_audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  admin_user_id uuid,
  admin_email text,
  action text not null check (char_length(action) between 1 and 60),
  target text not null default '' check (char_length(target) <= 200),
  details jsonb not null default '{}'::jsonb
);

create index admin_audit_log_at_idx on private.admin_audit_log (at desc);

-- Closed to every API role. RLS on with no policies is a second lock. The functions below
-- run as the table owner, so they are unaffected by either.
alter table private.daily_counters enable row level security;
alter table private.daily_snapshots enable row level security;
alter table private.admin_audit_log enable row level security;
revoke all on table private.daily_counters, private.daily_snapshots, private.admin_audit_log
  from public, anon, authenticated, service_role;

-- The audit log can be added to, not rewritten.
create function private.admin_audit_log_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'The admin audit log is append-only.' using errcode = '42501';
end;
$$;

create trigger admin_audit_log_append_only
  before update or delete on private.admin_audit_log
  for each row execute function private.admin_audit_log_append_only();

-- Indexes the dashboard's date-range queries need (none of these existed).
create index if not exists activity_log_created_at_idx on public.activity_log (created_at);
create index if not exists profiles_created_at_idx on public.profiles (created_at);
create index if not exists revenuecat_events_event_at_idx on public.revenuecat_events (event_at);

-- ── Counting ──────────────────────────────────────────────────────────────────

-- Adds p_by to today's (UTC) counter for a metric. Called by other functions, never by an API role.
create function private.bump_daily(p_metric text, p_by integer default 1)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_metric is null or p_by is null or p_by < 1 then
    return;
  end if;
  insert into private.daily_counters as c (day, metric, n)
  values ((now() at time zone 'utc')::date, p_metric, p_by)
  on conflict (day, metric) do update set n = c.n + excluded.n;
end;
$$;

revoke execute on function private.bump_daily(text, integer) from public, anon, authenticated;

-- ── Rewrites: same signatures and grants, now counting ───────────────────────

-- Same allowlist as 20261110082751_ai_rate_limit.sql, exactly. An unknown bucket (including
-- invite_miss, which only the invite functions take) still returns NULL and counts nothing.
-- The only change: 'ai' calls that were allowed count as ai_calls, and refused calls count as
-- rate_limited:<bucket>.
create or replace function public.take_rate_limit(p_bucket text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_allowed boolean;
begin
  if p_bucket is null or p_bucket not in ('recipe_search', 'recipe_open', 'ingredient_lookup', 'pro_sync', 'ai') then
    return null;
  end if;

  v_allowed := private.take_rate_limit(p_bucket);

  if v_allowed then
    if p_bucket = 'ai' then
      perform private.bump_daily('ai_calls');
    end if;
  else
    perform private.bump_daily('rate_limited:' || p_bucket);
  end if;
  return v_allowed;
end;
$$;

revoke execute on function public.take_rate_limit(text) from public, anon;
grant execute on function public.take_rate_limit(text) to authenticated;

-- Same body as 20261118041804_ai_free_allowance.sql, plus a daily count of Pro, free and
-- refused uses.
create or replace function public.take_ai_allowance(p_household_id uuid)
returns table (allowed boolean, pro boolean, used integer, lim integer, resets_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_limit integer := private.ai_free_weekly_limit();
  v_used integer;
  v_oldest timestamptz;
begin
  if v_user is null or not private.is_member(p_household_id) then
    raise exception 'Not a member of this household' using errcode = '42501';
  end if;

  if private.household_is_pro(p_household_id) then
    perform private.bump_daily('ai_allowance_pro');
    return query select true, true, 0, v_limit, null::timestamptz;
    return;
  end if;

  -- One at a time per household, so two taps can't both take the last use.
  perform 1 from public.households h where h.id = p_household_id for update;

  delete from public.ai_usage u
  where u.household_id = p_household_id and u.used_at < now() - interval '8 days';

  select count(*)::integer, min(u.used_at) into v_used, v_oldest
  from public.ai_usage u
  where u.household_id = p_household_id and u.used_at > now() - interval '7 days';

  if v_used >= v_limit then
    perform private.bump_daily('ai_allowance_denied');
    return query select false, false, v_used, v_limit, v_oldest + interval '7 days';
    return;
  end if;

  insert into public.ai_usage (household_id, user_id) values (p_household_id, v_user);
  perform private.bump_daily('ai_allowance_free');
  return query select true, false, v_used + 1, v_limit, coalesce(v_oldest, now()) + interval '7 days';
end;
$$;

revoke execute on function public.take_ai_allowance(uuid) from public, anon;
grant execute on function public.take_ai_allowance(uuid) to authenticated;

-- ── Back-fills ────────────────────────────────────────────────────────────────

-- Free AI uses per UTC day, from what ai_usage still holds (it keeps about 8 days).
insert into private.daily_counters (day, metric, n)
select (u.used_at at time zone 'utc')::date, 'ai_allowance_free', count(*)
from public.ai_usage u
group by 1
on conflict (day, metric) do nothing;

-- Users and households at the end of each past UTC day, so the growth chart has history.
-- Counts rows that exist today, so accounts deleted since then are missed (approximate).
insert into private.daily_snapshots (day, users_total, households_total)
select d::date,
  (select count(*)::integer from public.profiles p
    where p.created_at < ((d::date + 1)::timestamp at time zone 'utc')),
  (select count(*)::integer from public.households h
    where h.created_at < ((d::date + 1)::timestamp at time zone 'utc'))
from generate_series(
  (select (min(p.created_at) at time zone 'utc')::date from public.profiles p),
  (now() at time zone 'utc')::date - 1,
  interval '1 day'
) as d
on conflict (day) do nothing;

-- ── Shared helpers: live stats and snapshots use the same SQL ────────────────

-- People with a real, active, paid subscription now. Not sandbox, not a trial, not a
-- RevenueCat "promotional" grant (those are free). Comps are counted separately.
create function private.admin_paying_user_ids()
returns setof uuid
language sql
stable
set search_path = ''
as $$
  select s.user_id
  from public.subscriptions s
  where s.has_entitlement
    and (s.expires_at is null or s.expires_at > now())
    and not s.is_sandbox
    and lower(coalesce(s.period_type, '')) not in ('trial', 'promotional')
    and lower(coalesce(s.store, '')) <> 'promotional';
$$;

-- Estimated monthly recurring revenue in USD. For each paying person: their latest PRODUCTION
-- purchase or renewal with a positive price, divided by how many months it covers (from its
-- purchase and expiry times, at least 1; 1 when either is missing). Gross price, before the
-- store's cut.
create function private.admin_mrr_est()
returns numeric
language sql
stable
set search_path = ''
as $$
  with latest as (
    select distinct on (e.app_user_id)
      nullif(e.payload ->> 'price', '')::numeric as price,
      nullif(e.payload ->> 'purchased_at_ms', '')::numeric as purchased_ms,
      nullif(e.payload ->> 'expiration_at_ms', '')::numeric as expires_ms
    from public.revenuecat_events e
    where upper(coalesce(e.environment, e.payload ->> 'environment', '')) = 'PRODUCTION'
      and e.type in ('INITIAL_PURCHASE', 'RENEWAL')
      and e.app_user_id in (select u::text from private.admin_paying_user_ids() as u)
      and nullif(e.payload ->> 'price', '')::numeric > 0
    order by e.app_user_id, coalesce(e.event_at, e.received_at) desc
  )
  select coalesce(sum(
    l.price / greatest(
      case
        when l.purchased_ms is null or l.expires_ms is null then 1
        else round((l.expires_ms - l.purchased_ms) / (30.44 * 86400000))
      end,
      1)
  ), 0)
  from latest l;
$$;

revoke execute on function private.admin_paying_user_ids(), private.admin_mrr_est()
  from public, anon, authenticated;

-- ── Functions: limits and AI ─────────────────────────────────────────────────

-- Per rate-limit bucket: the limit, how many people have a live window, how many of those are
-- at the limit, and hits in windows started in the last 24 hours. Old windows are deleted as
-- each person's next one starts, so hits_24h is a lower bound.
create function public.admin_rate_limit_stats()
returns table (
  bucket text,
  max_hits integer,
  window_length interval,
  active_users integer,
  users_at_limit integer,
  hits_24h bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    b.bucket,
    r.max_hits,
    r.window_length,
    coalesce(c.active_users, 0)::integer,
    coalesce(c.users_at_limit, 0)::integer,
    coalesce(c.hits_24h, 0)::bigint
  from unnest(array['recipe_search', 'recipe_open', 'ingredient_lookup', 'ai', 'invite_miss', 'pro_sync'])
    with ordinality as b (bucket, ord)
  cross join lateral private.rate_limit_rule(b.bucket) as r
  left join lateral (
    select
      count(*) filter (where l.window_start > now() - r.window_length) as active_users,
      count(*) filter (where l.window_start > now() - r.window_length and l.hits >= r.max_hits) as users_at_limit,
      sum(l.hits) filter (where l.window_start > now() - interval '24 hours') as hits_24h
    from private.rate_limits l
    where l.bucket = b.bucket
  ) as c on true
  order by b.ord;
$$;

-- AI recipe help in the last 24 hours and 7 days, from ai_usage (free households only; Pro
-- uses are not stored, see the ai_allowance_pro counter). Households at the weekly limit
-- exclude any that have Pro since.
create function public.admin_ai_usage_stats()
returns table (
  uses_24h integer,
  uses_7d integer,
  households_active_7d integer,
  households_at_limit integer,
  free_weekly_limit integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (count(*) filter (where u.used_at > now() - interval '24 hours'))::integer,
    (count(*) filter (where u.used_at > now() - interval '7 days'))::integer,
    (count(distinct u.household_id) filter (where u.used_at > now() - interval '7 days'))::integer,
    (
      select count(*)::integer from (
        select u2.household_id
        from public.ai_usage u2
        where u2.used_at > now() - interval '7 days'
        group by u2.household_id
        having count(*) >= private.ai_free_weekly_limit()
          and not private.household_is_pro(u2.household_id)
      ) as x
    ),
    private.ai_free_weekly_limit()
  from public.ai_usage u;
$$;

-- The households using AI most in the last 7 days (1 to 100 of them). Household names only.
create function public.admin_ai_top_households(p_limit integer default 10)
returns table (household_id uuid, household_name text, uses_7d integer, at_limit boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select
    u.household_id,
    h.name,
    count(*)::integer,
    count(*) >= private.ai_free_weekly_limit() and not private.household_is_pro(u.household_id)
  from public.ai_usage u
  join public.households h on h.id = u.household_id
  where u.used_at > now() - interval '7 days'
  group by u.household_id, h.name
  order by 3 desc, h.name, u.household_id
  limit least(greatest(coalesce(p_limit, 10), 1), 100);
$$;

-- ── Functions: Pro, users, revenue ───────────────────────────────────────────

-- Active subscriptions and comps right now.
--   active_subscriptions  paying (see private.admin_paying_user_ids)
--   trials                active trials, not sandbox
--   not_renewing          paying people who turned auto-renew off
--   sandbox               active sandbox (test) subscriptions
--   comps_active          comps not yet expired
--   pro_households        households where anyone has Pro (subscription or comp)
--   by_store              {store: paying people}
create function public.admin_pro_stats()
returns table (
  active_subscriptions integer,
  trials integer,
  not_renewing integer,
  sandbox integer,
  comps_active integer,
  pro_households integer,
  by_store jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  with paying as (
    select s.*
    from public.subscriptions s
    where s.user_id in (select u from private.admin_paying_user_ids() as u)
  ),
  active as (
    select s.*
    from public.subscriptions s
    where s.has_entitlement and (s.expires_at is null or s.expires_at > now())
  )
  select
    (select count(*) from paying)::integer,
    (select count(*) from active a where not a.is_sandbox and lower(coalesce(a.period_type, '')) = 'trial')::integer,
    (select count(*) from paying p where not p.will_renew)::integer,
    (select count(*) from active a where a.is_sandbox)::integer,
    (select count(*) from private.pro_comps c where c.expires_at is null or c.expires_at > now())::integer,
    (
      select count(distinct m.household_id)
      from public.household_members m
      where private.user_is_pro(m.user_id)
    )::integer,
    coalesce(
      (select jsonb_object_agg(x.store, x.n)
        from (select coalesce(p.store, 'unknown') as store, count(*) as n from paying p group by 1) as x),
      '{}'::jsonb
    );
$$;

-- Sign-ups, activity and household shape. Active people = anyone with an activity-log row,
-- an AI use or a sign-in in the window (24 hours, 7 days, 30 days). avg_members and
-- multi_member_share (0 to 1) only count households that still have a member.
-- plpgsql because auth.users.last_sign_in_at is Supabase's.
create function public.admin_user_stats()
returns table (
  users_total integer,
  new_24h integer,
  new_7d integer,
  new_30d integer,
  dau integer,
  wau integer,
  mau integer,
  households_total integer,
  households_new_7d integer,
  households_new_30d integer,
  avg_members numeric,
  multi_member_share numeric,
  empty_households integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  return query
  with act as (
    select a.actor_id as uid, a.created_at as ts
    from public.activity_log a
    where a.actor_id is not null and a.created_at > now() - interval '30 days'
    union all
    select i.user_id, i.used_at
    from public.ai_usage i
    where i.user_id is not null and i.used_at > now() - interval '30 days'
    union all
    select u.id, u.last_sign_in_at
    from auth.users u
    where u.last_sign_in_at > now() - interval '30 days'
  ),
  active as (
    select
      count(distinct uid) filter (where ts > now() - interval '24 hours') as d,
      count(distinct uid) filter (where ts > now() - interval '7 days') as w,
      count(distinct uid) as m
    from act
  ),
  hh as (
    select h.id, h.created_at, (select count(*) from public.household_members m where m.household_id = h.id) as members
    from public.households h
  )
  select
    (select count(*) from public.profiles)::integer,
    (select count(*) from public.profiles p where p.created_at > now() - interval '24 hours')::integer,
    (select count(*) from public.profiles p where p.created_at > now() - interval '7 days')::integer,
    (select count(*) from public.profiles p where p.created_at > now() - interval '30 days')::integer,
    (select d from active)::integer,
    (select w from active)::integer,
    (select m from active)::integer,
    (select count(*) from hh)::integer,
    (select count(*) from hh where hh.created_at > now() - interval '7 days')::integer,
    (select count(*) from hh where hh.created_at > now() - interval '30 days')::integer,
    coalesce((select round(avg(hh.members), 2) from hh where hh.members > 0), 0)::numeric,
    coalesce((select round(count(*) filter (where hh.members >= 2)::numeric / nullif(count(*), 0), 4) from hh where hh.members > 0), 0)::numeric,
    (select count(*) from hh where hh.members = 0)::integer;
end;
$$;

-- New people and households per UTC day, oldest first, zero days included (1 to 365 days).
create function public.admin_signups_daily(p_days integer default 30)
returns table (day date, users integer, households integer)
language sql
stable
security definer
set search_path = ''
as $$
  select
    d::date,
    (select count(*)::integer from public.profiles p
      where p.created_at >= (d::date)::timestamp at time zone 'utc'
        and p.created_at < ((d::date + 1)::timestamp at time zone 'utc')),
    (select count(*)::integer from public.households h
      where h.created_at >= (d::date)::timestamp at time zone 'utc'
        and h.created_at < ((d::date + 1)::timestamp at time zone 'utc'))
  from generate_series(
    (now() at time zone 'utc')::date - (least(greatest(coalesce(p_days, 30), 1), 365) - 1),
    (now() at time zone 'utc')::date,
    interval '1 day'
  ) as d
  order by 1;
$$;

-- Money, from the RevenueCat event log, PRODUCTION only (test purchases are only counted in
-- sandbox_events_30d). Prices are USD before the store's cut.
--   gross_*          positive prices on purchases, renewals, one-off purchases and plan changes
--   refunds_30d      the absolute sum of negative prices (any event type)
--   net_30d_est      what we keep: price x takehome_percentage (70% when it's missing), gross + refunds
--   mrr_est          see private.admin_mrr_est
create function public.admin_revenue_stats()
returns table (
  gross_all_time numeric,
  gross_30d numeric,
  gross_month numeric,
  refunds_30d numeric,
  net_30d_est numeric,
  mrr_est numeric,
  paying_users integer,
  trials_started_30d integer,
  expirations_30d integer,
  sandbox_events_30d integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with ev as (
    select
      e.type,
      upper(coalesce(e.environment, e.payload ->> 'environment', '')) as env,
      coalesce(e.event_at, e.received_at) as ts,
      nullif(e.payload ->> 'price', '')::numeric as price,
      coalesce(nullif(e.payload ->> 'takehome_percentage', '')::numeric, 0.7) as takehome,
      upper(coalesce(e.payload ->> 'period_type', '')) as period_type
    from public.revenuecat_events e
  ),
  money as (
    select * from ev
    where env = 'PRODUCTION'
      and price is not null
      and ((price > 0 and type in ('INITIAL_PURCHASE', 'RENEWAL', 'NON_RENEWING_PURCHASE', 'PRODUCT_CHANGE')) or price < 0)
  )
  select
    coalesce((select sum(m.price) from money m where m.price > 0), 0),
    coalesce((select sum(m.price) from money m where m.price > 0 and m.ts > now() - interval '30 days'), 0),
    coalesce((select sum(m.price) from money m
      where m.price > 0 and m.ts >= (date_trunc('month', now() at time zone 'utc') at time zone 'utc')), 0),
    coalesce((select abs(sum(m.price)) from money m where m.price < 0 and m.ts > now() - interval '30 days'), 0),
    coalesce((select sum(m.price * m.takehome) from money m where m.ts > now() - interval '30 days'), 0),
    private.admin_mrr_est(),
    (select count(*) from private.admin_paying_user_ids())::integer,
    (select count(*) from ev where env = 'PRODUCTION' and type = 'INITIAL_PURCHASE' and period_type = 'TRIAL'
      and ts > now() - interval '30 days')::integer,
    (select count(*) from ev where env = 'PRODUCTION' and type = 'EXPIRATION'
      and ts > now() - interval '30 days')::integer,
    (select count(*) from ev where env = 'SANDBOX' and ts > now() - interval '30 days')::integer;
$$;

-- Gross and refunds per UTC month, oldest first, zero months included (1 to 60 months).
create function public.admin_revenue_monthly(p_months integer default 12)
returns table (month date, gross numeric, refunds numeric)
language sql
stable
security definer
set search_path = ''
as $$
  with ev as (
    select
      coalesce(e.event_at, e.received_at) as ts,
      e.type,
      nullif(e.payload ->> 'price', '')::numeric as price
    from public.revenuecat_events e
    where upper(coalesce(e.environment, e.payload ->> 'environment', '')) = 'PRODUCTION'
  )
  select
    m::date,
    coalesce((select sum(v.price) from ev v
      where v.price > 0
        and v.type in ('INITIAL_PURCHASE', 'RENEWAL', 'NON_RENEWING_PURCHASE', 'PRODUCT_CHANGE')
        and v.ts >= (m::date)::timestamp at time zone 'utc'
        and v.ts < ((m::date + interval '1 month')::timestamp at time zone 'utc')), 0),
    coalesce((select abs(sum(v.price)) from ev v
      where v.price < 0
        and v.ts >= (m::date)::timestamp at time zone 'utc'
        and v.ts < ((m::date + interval '1 month')::timestamp at time zone 'utc')), 0)
  from generate_series(
    (date_trunc('month', now() at time zone 'utc') - make_interval(months => least(greatest(coalesce(p_months, 12), 1), 60) - 1))::date,
    (date_trunc('month', now() at time zone 'utc'))::date,
    interval '1 month'
  ) as m
  order by 1;
$$;

-- ── Functions: usage ─────────────────────────────────────────────────────────

-- How much the app is used: all time, last 30 days, last 7 days. pantry_items_now has no
-- windows. activity:* rows count activity-log rows (one per pantry item touched, so one
-- cooked recipe is several rows). ai_*, from the daily counters (which start when this
-- migration ran, apart from the ai_usage back-fill). spoonacular_points keeps only about
-- 30 days, so all_time equals d30.
create function public.admin_usage_stats()
returns table (metric text, all_time bigint, d30 bigint, d7 bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select 'pantry_items_now', count(*)::bigint, null::bigint, null::bigint
  from public.pantry_items
  union all
  select 'pantry_items_added', count(*), count(*) filter (where t.created_at > now() - interval '30 days'),
    count(*) filter (where t.created_at > now() - interval '7 days')
  from public.pantry_items t
  union all
  select 'activity:' || e::text, count(a.id), count(a.id) filter (where a.created_at > now() - interval '30 days'),
    count(a.id) filter (where a.created_at > now() - interval '7 days')
  from unnest(enum_range(null::public.activity_action)) as e
  left join public.activity_log a on a.action = e
  group by e
  union all
  select 'shopping_items', count(*), count(*) filter (where t.created_at > now() - interval '30 days'),
    count(*) filter (where t.created_at > now() - interval '7 days')
  from public.shopping_list_items t
  union all
  select 'saved_recipes', count(*), count(*) filter (where t.created_at > now() - interval '30 days'),
    count(*) filter (where t.created_at > now() - interval '7 days')
  from public.saved_recipes t
  union all
  select 'ratings_up', count(*), count(*) filter (where t.created_at > now() - interval '30 days'),
    count(*) filter (where t.created_at > now() - interval '7 days')
  from public.recipe_ratings t where t.rating = 1
  union all
  select 'ratings_down', count(*), count(*) filter (where t.created_at > now() - interval '30 days'),
    count(*) filter (where t.created_at > now() - interval '7 days')
  from public.recipe_ratings t where t.rating = -1
  union all
  select k.metric,
    coalesce(sum(c.n), 0)::bigint,
    coalesce(sum(c.n) filter (where c.day > (now() at time zone 'utc')::date - 30), 0)::bigint,
    coalesce(sum(c.n) filter (where c.day > (now() at time zone 'utc')::date - 7), 0)::bigint
  from (values ('ai_calls'), ('ai_allowance_free'), ('ai_allowance_pro')) as k (metric)
  left join private.daily_counters c on c.metric = k.metric
  group by k.metric
  union all
  select 'spoonacular_points',
    round(coalesce(sum(s.points_used), 0))::bigint,
    round(coalesce(sum(s.points_used) filter (where s.day > (now() at time zone 'utc')::date - 30), 0))::bigint,
    round(coalesce(sum(s.points_used) filter (where s.day > (now() at time zone 'utc')::date - 7), 0))::bigint
  from public.spoonacular_usage s
  order by 1;
$$;

-- Activity-log rows per UTC day and action, for the last p_days days (1 to 365). Days with
-- nothing are left out.
create function public.admin_activity_daily(p_days integer default 30)
returns table (day date, action text, n integer)
language sql
stable
security definer
set search_path = ''
as $$
  select (a.created_at at time zone 'utc')::date, a.action::text, count(*)::integer
  from public.activity_log a
  where a.created_at >= (((now() at time zone 'utc')::date - (least(greatest(coalesce(p_days, 30), 1), 365) - 1))::timestamp at time zone 'utc')
  group by 1, 2
  order by 1, 2;
$$;

-- The daily counters between two UTC days, inclusive (at most 400 days).
create function public.admin_daily_counters(p_from date, p_to date)
returns table (day date, metric text, n bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 400 then
    raise exception 'Pick a range of at most 400 days.' using errcode = '22023';
  end if;
  return query
    select c.day, c.metric, c.n
    from private.daily_counters c
    where c.day between p_from and p_to
    order by c.day, c.metric;
end;
$$;

-- The daily snapshots between two UTC days, inclusive (at most 400 days).
create function public.admin_daily_snapshots(p_from date, p_to date)
returns table (
  day date,
  captured_at timestamptz,
  users_total integer,
  households_total integer,
  multi_member_households integer,
  pro_households integer,
  paying_users integer,
  trials_active integer,
  comps_active integer,
  mrr_est_usd numeric,
  pantry_items_total integer,
  shopping_items_open integer,
  saved_recipes_total integer,
  spoonacular_points_used numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 400 then
    raise exception 'Pick a range of at most 400 days.' using errcode = '22023';
  end if;
  return query
    select s.day, s.captured_at, s.users_total, s.households_total, s.multi_member_households,
      s.pro_households, s.paying_users, s.trials_active, s.comps_active, s.mrr_est_usd,
      s.pantry_items_total, s.shopping_items_open, s.saved_recipes_total, s.spoonacular_points_used
    from private.daily_snapshots s
    where s.day between p_from and p_to
    order by s.day;
end;
$$;

-- Saves today's totals (or another UTC day on or before today; the totals are always as of
-- now, so use that only to fill in a missing day). Running it again for the same day
-- overwrites the row.
create function public.admin_capture_daily_snapshot(p_day date default (now() at time zone 'utc')::date)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_pro record;
begin
  if p_day is null or p_day > (now() at time zone 'utc')::date then
    raise exception 'Pick a day that is not in the future.' using errcode = '22023';
  end if;

  select * into v_pro from public.admin_pro_stats();

  insert into private.daily_snapshots as s (
    day, captured_at, users_total, households_total, multi_member_households, pro_households,
    paying_users, trials_active, comps_active, mrr_est_usd, pantry_items_total,
    shopping_items_open, saved_recipes_total, spoonacular_points_used
  )
  values (
    p_day,
    now(),
    (select count(*) from public.profiles),
    (select count(*) from public.households),
    (select count(*) from (
      select m.household_id from public.household_members m group by m.household_id having count(*) >= 2
    ) as multi),
    v_pro.pro_households,
    v_pro.active_subscriptions,
    v_pro.trials,
    v_pro.comps_active,
    private.admin_mrr_est(),
    (select count(*) from public.pantry_items),
    (select count(*) from public.shopping_list_items i where i.checked_at is null),
    (select count(*) from public.saved_recipes),
    coalesce((select u.points_used from public.spoonacular_usage u where u.day = p_day), 0)
  )
  on conflict (day) do update set
    captured_at = excluded.captured_at,
    users_total = excluded.users_total,
    households_total = excluded.households_total,
    multi_member_households = excluded.multi_member_households,
    pro_households = excluded.pro_households,
    paying_users = excluded.paying_users,
    trials_active = excluded.trials_active,
    comps_active = excluded.comps_active,
    mrr_est_usd = excluded.mrr_est_usd,
    pantry_items_total = excluded.pantry_items_total,
    shopping_items_open = excluded.shopping_items_open,
    saved_recipes_total = excluded.saved_recipes_total,
    spoonacular_points_used = excluded.spoonacular_points_used;
end;
$$;

-- ── Functions: insights ──────────────────────────────────────────────────────

-- How far new people get, for everyone who signed up on or after p_since (UTC day; null =
-- everyone). Each step is counted on its own (it is not nested in the one before):
--   1 signed up   2 is in a household   3 household has a pantry item
--   4 household has cooked a recipe   5 household has 2 or more members   6 household has Pro
create function public.admin_activation_funnel(p_since date)
returns table (step integer, label text, users integer)
language sql
stable
security definer
set search_path = ''
as $$
  with cohort as (
    select p.id
    from public.profiles p
    where p.created_at >= (coalesce(p_since, date '1970-01-01')::timestamp at time zone 'utc')
  ),
  membership as (
    select m.user_id, m.household_id
    from public.household_members m
    where m.user_id in (select c.id from cohort c)
  ),
  households as (
    select distinct mb.household_id from membership mb
  ),
  flags as (
    select
      h.household_id,
      exists (select 1 from public.pantry_items i where i.household_id = h.household_id) as has_pantry,
      exists (select 1 from public.activity_log a where a.household_id = h.household_id and a.action = 'cooked') as has_cooked,
      (select count(*) from public.household_members m2 where m2.household_id = h.household_id) >= 2 as has_many,
      private.household_is_pro(h.household_id) as is_pro
    from households h
  )
  select 1, 'Signed up', (select count(*) from cohort)::integer
  union all
  select 2, 'In a household', (select count(distinct mb.user_id) from membership mb)::integer
  union all
  select 3, 'Household has a pantry item',
    (select count(distinct mb.user_id) from membership mb join flags f using (household_id) where f.has_pantry)::integer
  union all
  select 4, 'Household has cooked a recipe',
    (select count(distinct mb.user_id) from membership mb join flags f using (household_id) where f.has_cooked)::integer
  union all
  select 5, 'Household has 2 or more members',
    (select count(distinct mb.user_id) from membership mb join flags f using (household_id) where f.has_many)::integer
  union all
  select 6, 'Household has Pro',
    (select count(distinct mb.user_id) from membership mb join flags f using (household_id) where f.is_pro)::integer
  order by 1;
$$;

-- Weekly retention. Each row is one sign-up week (Monday start, UTC, the last p_weeks weeks,
-- 1 to 26) and one week after it: how many of that week's sign-ups did anything in the
-- activity log that week. week_n 0 is the sign-up week. Weeks that haven't started are left out.
create function public.admin_retention_cohorts(p_weeks integer default 8)
returns table (cohort_week date, size integer, week_n integer, active integer)
language sql
stable
security definer
set search_path = ''
as $$
  with this_week as (
    select date_trunc('week', now() at time zone 'utc')::date as d
  ),
  weeks as (
    select (tw.d - 7 * g) as cw
    from this_week tw, generate_series(0, least(greatest(coalesce(p_weeks, 8), 1), 26) - 1) as g
  ),
  cohort as (
    select w.cw, p.id
    from weeks w
    join public.profiles p
      on p.created_at >= (w.cw::timestamp at time zone 'utc')
     and p.created_at < ((w.cw + 7)::timestamp at time zone 'utc')
  ),
  grid as (
    select w.cw, k
    from weeks w, this_week tw, generate_series(0, (tw.d - w.cw) / 7) as k
  )
  select
    g.cw,
    (select count(*) from cohort c where c.cw = g.cw)::integer,
    g.k,
    (
      select count(distinct a.actor_id)
      from cohort c
      join public.activity_log a on a.actor_id = c.id
        and a.created_at >= ((g.cw + 7 * g.k)::timestamp at time zone 'utc')
        and a.created_at < ((g.cw + 7 * g.k + 7)::timestamp at time zone 'utc')
      where c.cw = g.cw
    )::integer
  from grid g
  order by g.cw, g.k;
$$;

-- What people cook, save, rate, stock and throw away, over the last p_days days (1 to 365),
-- top p_limit (1 to 50) of each list. Recipe and ingredient names only, no household names.
--   cooked     recipes cooked (one per cook, not per ingredient)
--   saved      saved recipe titles
--   rated_up / rated_down   thumbs, by recipe title (the recipe id when we can't find a title)
--   pantry     items added to pantries
--   wasted     items removed from pantries
create function public.admin_popular(p_days integer default 30, p_limit integer default 10)
returns table (list text, name text, n integer)
language sql
stable
security definer
set search_path = ''
as $$
  with p as (
    select now() - make_interval(days => least(greatest(coalesce(p_days, 30), 1), 365)) as since,
           least(greatest(coalesce(p_limit, 10), 1), 50) as lim
  )
  select x.list, x.name, x.n from (
    select 'cooked'::text as list, y.name, y.n,
      row_number() over (order by y.n desc, y.name) as rk
    from (
      select coalesce(nullif(btrim(a.details ->> 'recipe_title'), ''), a.item_name) as name,
        count(distinct a.household_id::text || ':' || a.batch_id::text)::integer as n
      from public.activity_log a, p
      where a.action = 'cooked' and a.created_at > p.since
      group by 1
    ) y
    union all
    select 'saved', y.name, y.n, row_number() over (order by y.n desc, y.name)
    from (
      select s.title as name, count(*)::integer as n
      from public.saved_recipes s, p
      where s.created_at > p.since
      group by s.title
    ) y
    union all
    select 'rated_up', y.name, y.n, row_number() over (order by y.n desc, y.name)
    from (
      select coalesce(
          (select r.title from public.recipes r where r.id::text = rr.recipe_ref),
          (select sr.title from public.saved_recipes sr where sr.recipe_id::text = rr.recipe_ref limit 1),
          rr.recipe_ref) as name,
        count(*)::integer as n
      from public.recipe_ratings rr, p
      where rr.rating = 1 and rr.updated_at > p.since
      group by rr.recipe_ref
    ) y
    union all
    select 'rated_down', y.name, y.n, row_number() over (order by y.n desc, y.name)
    from (
      select coalesce(
          (select r.title from public.recipes r where r.id::text = rr.recipe_ref),
          (select sr.title from public.saved_recipes sr where sr.recipe_id::text = rr.recipe_ref limit 1),
          rr.recipe_ref) as name,
        count(*)::integer as n
      from public.recipe_ratings rr, p
      where rr.rating = -1 and rr.updated_at > p.since
      group by rr.recipe_ref
    ) y
    union all
    select 'pantry', y.name, y.n, row_number() over (order by y.n desc, y.name)
    from (
      select lower(btrim(i.name)) as name, count(*)::integer as n
      from public.pantry_items i, p
      where i.created_at > p.since
      group by 1
    ) y
    union all
    select 'wasted', y.name, y.n, row_number() over (order by y.n desc, y.name)
    from (
      select lower(btrim(a.item_name)) as name, count(*)::integer as n
      from public.activity_log a, p
      where a.action = 'removed' and a.created_at > p.since
      group by 1
    ) y
  ) x, p
  where x.rk <= p.lim
  order by x.list, x.rk;
$$;

-- The latest RevenueCat events (1 to 200), newest first. No person and no payload: just
-- what happened, for which product, in which store and environment.
create function public.admin_revenuecat_recent(p_limit integer default 50)
returns table (
  type text,
  product_id text,
  store text,
  environment text,
  event_at timestamptz,
  received_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    e.type,
    e.payload ->> 'product_id',
    e.payload ->> 'store',
    coalesce(e.environment, e.payload ->> 'environment'),
    e.event_at,
    e.received_at
  from public.revenuecat_events e
  order by coalesce(e.event_at, e.received_at) desc, e.received_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

-- ── Functions: support ───────────────────────────────────────────────────────

-- Looks up ONE person by their exact email (case-insensitive, no partial matching). Returns
-- no row when nobody matches. This is the only function here that returns personal data.
--   pro_source  'subscription' or 'comp' (their own Pro), 'household' (covered by a
--               housemate), or null. Comp columns show the comp row even when it has expired.
-- plpgsql because auth.users.last_sign_in_at is Supabase's.
create function public.admin_find_user(p_email text)
returns table (
  user_id uuid,
  email text,
  display_name text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  pro_source text,
  comp_expires_at timestamptz,
  comp_note text,
  households jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if p_email is null or char_length(p_email) > 320 or position('@' in v_email) = 0 then
    raise exception 'Enter the full email address.' using errcode = '22023';
  end if;

  return query
    select
      u.id,
      u.email::text,
      p.display_name,
      p.created_at,
      u.last_sign_in_at,
      case
        when exists (
          select 1 from public.subscriptions s
          where s.user_id = u.id and s.has_entitlement and (s.expires_at is null or s.expires_at > now())
        ) then 'subscription'
        when exists (
          select 1 from private.pro_comps c2
          where c2.user_id = u.id and (c2.expires_at is null or c2.expires_at > now())
        ) then 'comp'
        when exists (
          select 1 from public.household_members m
          where m.user_id = u.id and private.household_is_pro(m.household_id)
        ) then 'household'
      end,
      c.expires_at,
      c.note,
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', h.id,
            'name', h.name,
            'role', m.role,
            'members', (select count(*) from public.household_members m3 where m3.household_id = h.id)
          ) order by m.joined_at
        )
        from public.household_members m
        join public.households h on h.id = m.household_id
        where m.user_id = u.id
      ), '[]'::jsonb)
    from auth.users u
    left join public.profiles p on p.id = u.id
    left join private.pro_comps c on c.user_id = u.id
    where lower(u.email) = v_email
    limit 1;
end;
$$;

-- Gives someone free Pro (or changes their comp). p_expires_at null = no end date; otherwise
-- it has to be in the future. The note is at most 200 characters.
create function public.admin_grant_comp(p_user_id uuid, p_expires_at timestamptz, p_note text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if p_user_id is null or not exists (select 1 from public.profiles p where p.id = p_user_id) then
    raise exception 'No such user.' using errcode = '22023';
  end if;
  if v_note is not null and char_length(v_note) > 200 then
    raise exception 'Keep the note under 200 characters.' using errcode = '22023';
  end if;
  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'The end date has to be in the future.' using errcode = '22023';
  end if;

  insert into private.pro_comps as c (user_id, note, expires_at, granted_at)
  values (p_user_id, v_note, p_expires_at, now())
  on conflict (user_id) do update
    set note = excluded.note, expires_at = excluded.expires_at, granted_at = now();
end;
$$;

-- Takes a comp away. Returns whether there was one.
create function public.admin_revoke_comp(p_user_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  delete from private.pro_comps c where c.user_id = p_user_id;
  return found;
end;
$$;

-- ── Functions: audit log ─────────────────────────────────────────────────────

-- Records an admin action. Returns the new row's id. details is capped at about 4 KB.
create function public.admin_log_action(
  p_admin_user_id uuid,
  p_admin_email text,
  p_action text,
  p_target text,
  p_details jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_details jsonb := coalesce(p_details, '{}'::jsonb);
  v_id bigint;
begin
  if p_action is null or char_length(p_action) not between 1 and 60 then
    raise exception 'Bad action name.' using errcode = '22023';
  end if;
  if char_length(coalesce(p_target, '')) > 200 then
    raise exception 'That target is too long.' using errcode = '22023';
  end if;
  if char_length(v_details::text) > 4000 then
    raise exception 'Those details are too long.' using errcode = '22023';
  end if;

  insert into private.admin_audit_log (admin_user_id, admin_email, action, target, details)
  values (p_admin_user_id, p_admin_email, p_action, coalesce(p_target, ''), v_details)
  returning id into v_id;
  return v_id;
end;
$$;

-- The latest audit entries (1 to 200), newest first. Includes the admin's email.
create function public.admin_audit_recent(p_limit integer default 50)
returns table (
  id bigint,
  at timestamptz,
  admin_user_id uuid,
  admin_email text,
  action text,
  target text,
  details jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select l.id, l.at, l.admin_user_id, l.admin_email, l.action, l.target, l.details
  from private.admin_audit_log l
  order by l.at desc, l.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

-- ── Function: server-side event counters ─────────────────────────────────────

-- Counts one event today. Only these names are accepted (AI errors by kind, Spoonacular
-- cache hits and misses, Spoonacular errors by kind), so the counters table can't be
-- filled with anything else.
create function public.bump_daily_metric(p_metric text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_metric is null
     or p_metric !~ '^(ai_error:[a-z_]{1,30}|spoonacular_cache:(hit|miss)|spoonacular_error:[a-z_0-9]{1,30})$' then
    raise exception 'Unknown metric.' using errcode = '22023';
  end if;
  perform private.bump_daily(p_metric);
end;
$$;

-- ── Permissions: service_role only ───────────────────────────────────────────

revoke execute on function
  public.admin_rate_limit_stats(),
  public.admin_ai_usage_stats(),
  public.admin_ai_top_households(integer),
  public.admin_pro_stats(),
  public.admin_user_stats(),
  public.admin_signups_daily(integer),
  public.admin_revenue_stats(),
  public.admin_revenue_monthly(integer),
  public.admin_usage_stats(),
  public.admin_activity_daily(integer),
  public.admin_daily_counters(date, date),
  public.admin_daily_snapshots(date, date),
  public.admin_capture_daily_snapshot(date),
  public.admin_activation_funnel(date),
  public.admin_retention_cohorts(integer),
  public.admin_popular(integer, integer),
  public.admin_revenuecat_recent(integer),
  public.admin_find_user(text),
  public.admin_grant_comp(uuid, timestamptz, text),
  public.admin_revoke_comp(uuid),
  public.admin_log_action(uuid, text, text, text, jsonb),
  public.admin_audit_recent(integer),
  public.bump_daily_metric(text)
from public, anon, authenticated;

grant execute on function
  public.admin_rate_limit_stats(),
  public.admin_ai_usage_stats(),
  public.admin_ai_top_households(integer),
  public.admin_pro_stats(),
  public.admin_user_stats(),
  public.admin_signups_daily(integer),
  public.admin_revenue_stats(),
  public.admin_revenue_monthly(integer),
  public.admin_usage_stats(),
  public.admin_activity_daily(integer),
  public.admin_daily_counters(date, date),
  public.admin_daily_snapshots(date, date),
  public.admin_capture_daily_snapshot(date),
  public.admin_activation_funnel(date),
  public.admin_retention_cohorts(integer),
  public.admin_popular(integer, integer),
  public.admin_revenuecat_recent(integer),
  public.admin_find_user(text),
  public.admin_grant_comp(uuid, timestamptz, text),
  public.admin_revoke_comp(uuid),
  public.admin_log_action(uuid, text, text, text, jsonb),
  public.admin_audit_recent(integer),
  public.bump_daily_metric(text)
to service_role;
