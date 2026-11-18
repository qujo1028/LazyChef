-- Free households get a weekly allowance of AI recipe help (meal ideas, "Ask AI for an idea",
-- substitutions); Pro households (anyone in the household with Pro) are not counted.
-- One allowance per household, like Pro: housemates share it. It's a rolling 7 days, so there
-- is no time zone to agree on. The per-person hourly 'ai' bucket still applies to everyone.

create table public.ai_usage (
  id bigint generated always as identity primary key,
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  used_at timestamptz not null default now()
);

create index ai_usage_household_used_at on public.ai_usage (household_id, used_at);

alter table public.ai_usage enable row level security;

-- Members can see their household's usage. Only take_ai_allowance() writes.
create policy "Members read their AI usage" on public.ai_usage
  for select to authenticated
  using (private.is_member(household_id));

revoke all on table public.ai_usage from anon, authenticated;
grant select on table public.ai_usage to authenticated;

-- ── Allowance ─────────────────────────────────────────────────────────────────

-- Free plan: this many AI uses per household in any 7 days.
create function private.ai_free_weekly_limit()
returns integer
language sql
immutable
set search_path = ''
as $$ select 10 $$;

-- Takes one AI use for the household, if it has one left.
--   allowed:   whether the caller may ask the AI now (always true with Pro)
--   pro:       whether the household has Pro (then nothing is counted)
--   used:      uses in the last 7 days, including this one when allowed
--   lim:       the free weekly limit
--   resets_at: when the oldest counted use drops out (null when nothing is counted)
create function public.take_ai_allowance(p_household_id uuid)
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
    return query select false, false, v_used, v_limit, v_oldest + interval '7 days';
    return;
  end if;

  insert into public.ai_usage (household_id, user_id) values (p_household_id, v_user);
  return query select true, false, v_used + 1, v_limit, coalesce(v_oldest, now()) + interval '7 days';
end;
$$;

revoke execute on function public.take_ai_allowance(uuid) from public, anon;
grant execute on function public.take_ai_allowance(uuid) to authenticated;
revoke execute on function private.ai_free_weekly_limit() from public, anon, authenticated;
