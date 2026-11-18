@AGENTS.md

# LazyChef

Shared-household pantry tracker + recipe finder. Next.js 16 (App Router, `src/proxy.ts` instead of
middleware), React 19, Tailwind v4 + shadcn/ui (radix, "nova"; buttons/inputs enlarged for touch),
Supabase, Spoonacular (Phase 2+).

## Commands
- `npm run typecheck`, `npm run lint`, `npm run build`
- `npm run test:db`: applies `supabase/migrations/*.sql` to PGlite with Supabase stand-ins
  (`supabase/tests/harness.mjs`) and runs `*.test.mjs`. Add a test file for each migration's RLS rules.

## Conventions
- Every household-scoped table has `household_id` and RLS via `private.is_member(household_id)`.
  Multi-step or privileged writes go through `security definer` functions in `public` with
  `set search_path = ''`, EXECUTE revoked from `anon`/`public`, and `auth.uid()` checks.
- Realtime: add `private.broadcast_household_change('<household id column>')` triggers to new tables;
  clients listen on the private `household:<id>` channel.
- `src/types/database.ts` mirrors the migrations. Update it with each migration (or regenerate).
- Server actions re-check auth (`requireViewer()`); the proxy is not the only gate.
- Spoonacular free tier: 50 points/day, parse = 1 point per ingredient, cache ≤ 1 hour. Keep keys server-only.

## Parallel work
- Before planning or briefing parallel sessions, run `git fetch origin` and base every worktree on `origin/main`, never a stale local `main`. Check whether a feature already exists there first.
- Migration lock: only one branch at a time may change `supabase/migrations/` or `src/types/database.ts`. The lead names the holder in the worker brief and in PROGRESS.md, and clears it when that branch merges. Other workers don't touch those files; if they need a schema change, they write it into the holder's queue or wait. Don't hand out the lock to a second branch while the first is open.
- Split work by feature, not by layer. Each worker session owns one whole feature, including its tests and its screens for each target (web or mobile).
- Shared packages (`packages/core`, `packages/db-types` once they exist): workers may add new files freely. Changing an existing exported function or type needs a note in the branch description, and the lead merges that change first.
- Workers commit to their own branch and rebase onto `origin/main` at the start of each session and again before reporting done. They never push to `main` and never open PRs; the lead session does that.
- Before reporting done, a worker runs `npm run typecheck && npm run lint && npm run test` (plus `npm run test:db` if it touched the DB), then runs `/code-review` on its own diff and fixes what it finds. The worker's report includes the review result, so the lead doesn't have to re-review from scratch.
- The lead session checks the report, merges each branch as soon as it's green rather than batching, reruns the checks on the merged result, then opens a PR. Pushes to `main` auto-deploy to Vercel, so the user merges the PR.
- Keep to 4 workers at once (up from 2-3). Use subagents for research or diff review inside a session.
