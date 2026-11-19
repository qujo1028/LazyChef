-- LazyChef · Personal weekly cook goal (P6).
-- Each person picks how many nights a week they aim to cook (1 to 7, default 3). The weekly
-- ring and Activity read it. It stays per person (own-row RLS like the rest of
-- user_preferences) and is never broadcast. Saved only through set_my_weekly_goal(), which
-- leaves the food preferences alone; set_my_preferences() leaves the goal alone.

alter table public.user_preferences
  add column weekly_goal smallint not null default 3
    check (weekly_goal between 1 and 7);

create function public.set_my_weekly_goal(p_goal integer)
returns smallint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_goal smallint;
begin
  if v_user is null then
    raise exception 'Sign in to save your goal' using errcode = '42501';
  end if;
  if p_goal is null or p_goal < 1 or p_goal > 7 then
    raise exception 'Pick a goal from 1 to 7 nights' using errcode = '22023';
  end if;

  insert into public.user_preferences as p (user_id, weekly_goal, updated_at)
  values (v_user, p_goal, now())
  on conflict (user_id) do update set
    weekly_goal = excluded.weekly_goal,
    updated_at = now()
  returning p.weekly_goal into v_goal;

  return v_goal;
end;
$$;

revoke execute on function public.set_my_weekly_goal(integer) from public, anon;
grant execute on function public.set_my_weekly_goal(integer) to authenticated;
