# Habit Phase 2 schema design (input for W6)

Output of the 1a Plan agent, 2026-11-18. W6 follows this; flag disagreements to the lead.

## UPDATE 2026-11-18: PR #39 merged
`supabase/migrations/20261117000100_undo_cook.sql` is on main. `cook_recipe` now also returns `batch_id`, and `undo_cook()`
already puts amounts back and deletes the cook's rows. W6 must build on that instead of adding its own `undo_cook`: read that
migration first, keep its signature, and only add what is still missing (the fallback 'cooked' row for zero-deduction cooks,
quick log, goals, challenges, the after-delete broadcast if #39 lacks one). Tests 11 and 12 below may already exist in
supabase/tests/undo-cook.test.mjs.

## Findings about today's code
- Latest `cook_recipe` is in `20261005000100_local_recipes.sql`, signature `(uuid, integer, text, jsonb, uuid)`. Latest
  `private.log_pantry_activity` is in `20261001000100_saved_recipes.sql`.
- A cook writes 'cooked' rows only when a tracked quantity drops. Untracked items, items at 0, or skipping everything leave
  NO row. Empty `p_deductions` raises, and cook-sheet.tsx returns early when `deductions.length === 0`.
- `undoCook` does NOT remove the cook: it calls `add_pantry_items` (adds 'restocked' rows); the 'cooked' rows stay and count.
  `rate_recipe` also keys off those rows.
- `details` also carries `local_recipe_id`, so try_new compares both `recipe_id` and `local_recipe_id`.

## Reliable cook record: fallback row in activity_log (no cook_events table)
Keeps "one cook = one distinct (batch_id, actor_id) of 'cooked' rows", so stats.ts, admin_popular and rate_recipe keep working.
- Redefine `cook_recipe` (drop and recreate, same args): allow empty `p_deductions`; after the loop, if no 'cooked' row exists for
  (household, txid_current(), auth.uid()), insert one with item_name = title, quantity null, details = cooking json || {"no_items":true}.
  Return `jsonb {batch_id, items:[...]}` instead of a table (a table return has zero rows for an empty cook, so no batch_id for undo).
- New `undo_cook(p_household_id uuid, p_batch_id bigint, p_items jsonb) returns void`: security definer, is_member check; restores
  amounts the way the add_pantry_items merge does, with `lazychef.undoing` set so the trigger logs nothing; deletes activity_log rows
  where batch_id = p_batch_id, actor_id = auth.uid(), action = 'cooked', younger than 1 day. Redefine `log_pantry_activity` to skip
  logging while `lazychef.undoing` is set.

## SQL outline
```
habit_goals(
  user_id uuid pk references profiles on delete cascade,
  nights_per_week smallint not null default 3 check (between 1 and 7),
  reminder_time time null,
  active_days smallint[] not null default '{1,2,3,4,5,6,7}'
    check (active_days <@ '{1..7}' and cardinality between 1 and 7),  -- ISO, Mon=1
  updated_at timestamptz not null default now())
RLS: select using (user_id = (select auth.uid())); revoke all; grant select.
set_my_habit_goal(p_nights_per_week integer, p_reminder_time time, p_active_days integer[]) returns habit_goals
  -- definer, upsert, sorts and dedupes days

challenges(
  id uuid pk default gen_random_uuid(),
  user_id uuid not null references profiles on delete cascade,
  household_id uuid null references households on delete set null,
  kind text check (in ('streak3','try_new')),
  status text not null default 'active' check (in ('active','completed','expired')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  check ((status = 'completed') = (completed_at is not null)))
unique index challenges_one_active on challenges(user_id) where status = 'active';
index on challenges(household_id)
RLS: own rows select only; revoke all; grant select.
start_challenge(p_household_id uuid, p_kind text) returns challenges   -- is_member; expires any active one first
complete_challenge(p_id uuid) returns challenges
expire_challenge(p_id uuid) returns challenges

log_quick_cook(p_household_id uuid, p_title text default null) returns bigint  -- batch_id
  -- definer, is_member, one 'cooked' row: item_name = coalesce(title, 'Home-cooked meal'),
  -- details = {"quick":true, "recipe_title":...} (no recipe ids); undone via undo_cook(h, batch, '[]')

activity_log (actor_id, created_at) where action = 'cooked'
activity_log (household_id, created_at) where action = 'cooked'
```
Every function: `set search_path = ''`, EXECUTE revoked from public and anon, granted to authenticated, raise 42501 when
auth.uid() is null. try_new counts a cook only when recipe_id or local_recipe_id is present and that id has no earlier 'cooked'
row by this actor; quick cooks are excluded automatically.

## RLS and realtime
- Housemates already read each other's cook rows ("Members read their household's activity"); no new policy for the leaderboard.
- Goals and challenges are own-row only.
- activity_log: add an `after delete` broadcast so undo updates housemates' rings and the board; return early when the household
  is gone to avoid a broadcast flood on household deletion.
- habit_goals and challenges: NO broadcast (the household channel is readable by all members, so it would leak them).

## Account deletion
Both new tables cascade from profiles. Activity rows keep actor_id null (current policy), so they stop counting.

## Tests (supabase/tests/habit.test.mjs)
1. Goal defaults, upsert replaces, days sorted/deduped, bounds 0/8 rejected, bad weekday rejected.
2. Own goal only; housemate sees 0 rows.
3. Direct insert/update/delete on both tables denied.
4. Signed-out callers denied on every RPC and both tables.
5. One active challenge; starting a second expires the first.
6. Housemate cannot see, complete or expire your challenge.
7. Cannot complete an expired or completed challenge.
8. Non-member cannot start a challenge or quick log in someone else's household.
9. Cook that deducts nothing writes exactly one 'cooked' row.
10. Normal cook is one batch.
11. undo_cook deletes only the caller's rows for that batch, restores pantry, logs no 'restocked' rows.
12. Housemate cannot undo your cook.
13. Quick log counts as a cook and not as try_new.
14. Housemates read each other's cook rows; non-member cannot.
15. Undo broadcasts a DELETE on the household channel.
16. Account deletion removes goal and challenges; cook rows lose their actor.
17. Household deletion cascades with no broadcast flood.
18. rate_recipe still works after a no-item cook.

## src/types/database.ts
Add tables habit_goals, challenges; functions set_my_habit_goal, start_challenge, complete_challenge, expire_challenge,
log_quick_cook, undo_cook; cook_recipe Returns becomes Json. Update actions.ts (cookRecipe, undoCook) and cook-sheet (allow zero
deductions, keep batch_id). Feed hides the item line for rows with no_items or quick.

## Migration order
Land push notifications first, rebase onto origin/main, then name this file with a fresh `date -u +%Y%m%d%H%M%S`.

## Open questions and lead answers
1. reminder_time here or in notification_prefs? Lead: here (habit_goals), per the user's plan. W7 reads the timezone from device_tokens.
2. Ring counts cooks or distinct nights? USER: distinct cook days everywhere (ring, tiers, leaderboard).
3. Rate-limit quick log? Lead: no, counting days caps padding at 1 per day.
4. Challenge expiry and server verification? Lead: expiry = started_at + 7 days (computed, no column). complete_challenge verifies
   progress on the server and takes p_time_zone.
5. Streaks across households? Lead: current household only.
6. nights_per_week > count(active_days)? Lead: reject in the RPC; the UI clamps.
7. Undo window? Lead: keep 1 day.
8. challenges.household_id on household delete? Lead: set null (as designed).
