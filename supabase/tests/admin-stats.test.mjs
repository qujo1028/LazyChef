import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { before, describe, test } from "node:test"

import { assertRejects, createTestDb } from "./harness.mjs"

const MIGRATION = readFileSync(
  join(import.meta.dirname, "..", "migrations", "20261118060000_admin_dashboard.sql"),
  "utf8",
)

const near = (actual, expected, eps = 0.001) =>
  assert.ok(Math.abs(Number(actual) - expected) < eps, `expected ${actual} to be about ${expected}`)

// Every new public function, with a harmless call. Ones with side effects are marked.
const FUNCTIONS = [
  "select * from public.admin_rate_limit_stats()",
  "select * from public.admin_ai_usage_stats()",
  "select * from public.admin_ai_top_households(5)",
  "select * from public.admin_pro_stats()",
  "select * from public.admin_user_stats()",
  "select * from public.admin_signups_daily(7)",
  "select * from public.admin_revenue_stats()",
  "select * from public.admin_revenue_monthly(3)",
  "select * from public.admin_usage_stats()",
  "select * from public.admin_activity_daily(7)",
  "select * from public.admin_daily_counters(current_date - 1, current_date + 1)",
  "select * from public.admin_daily_snapshots(current_date - 1, current_date + 1)",
  "select public.admin_capture_daily_snapshot()",
  "select * from public.admin_activation_funnel(current_date - 30)",
  "select * from public.admin_retention_cohorts(4)",
  "select * from public.admin_popular(30, 5)",
  "select * from public.admin_revenuecat_recent(5)",
  "select * from public.admin_find_user('nobody@test.dev')",
  "select public.admin_grant_comp(gen_random_uuid(), null, 'x')",
  "select public.admin_revoke_comp(gen_random_uuid())",
  "select public.admin_log_action(gen_random_uuid(), 'x@test.dev', 'permissions_check', 'none', '{}')",
  "select * from public.admin_audit_recent(5)",
  "select public.bump_daily_metric('ai_error:timeout')",
]
// Can't succeed with the made-up ids above, even as service_role.
const NEEDS_REAL_ARGS = new Set(["select public.admin_grant_comp(gen_random_uuid(), null, 'x')"])

describe("Admin dashboard data layer", () => {
  let t, alex, blair, casey, dana, erin, maple, oak, fern, today

  const asService = async (fn) => {
    await t.db.exec("set role service_role")
    try {
      return await fn()
    } finally {
      await t.db.exec("reset role")
    }
  }
  const svc = (sql, params) => asService(() => t.q(sql, params))
  const svcOne = async (sql, params) => (await svc(sql, params))[0]
  const takeRate = (user, bucket) =>
    t.as(user, async () => (await t.q("select public.take_rate_limit($1) as ok", [bucket]))[0].ok)
  const takeAi = (user, household) =>
    t.as(user, async () => (await t.q("select * from public.take_ai_allowance($1)", [household]))[0])
  const counters = async () => {
    const rows = await svc("select metric, n::int as n from public.admin_daily_counters($1::date, $1::date)", [today])
    return Object.fromEntries(rows.map((r) => [r.metric, r.n]))
  }
  const ago = (interval) => `now() - interval '${interval}'`

  before(async () => {
    t = await createTestDb()
    // Supabase's auth.users has these; the harness's stand-in doesn't.
    await t.q("alter table auth.users add column last_sign_in_at timestamptz")
    today = (await t.q("select (now() at time zone 'utc')::date::text as d"))[0].d

    alex = await t.createUser("a@test.dev", { full_name: "Alex" })
    blair = await t.createUser("b@test.dev", { full_name: "Blair" })
    casey = await t.createUser("c@test.dev", { full_name: "Casey" })
    dana = await t.createUser("d@test.dev", { full_name: "Dana" })
    erin = await t.createUser("e@test.dev", { full_name: "Erin" })
    maple = await t.as(alex, async () => (await t.q("select public.create_household('Maple') as id"))[0].id)
    oak = await t.as(casey, async () => (await t.q("select public.create_household('Oak') as id"))[0].id)
    fern = await t.as(erin, async () => (await t.q("select public.create_household('Fern') as id"))[0].id)
    const [{ invite_code }] = await t.q("select invite_code from public.households where id = $1", [maple])
    await t.as(blair, () => t.q("select public.join_household($1)", [invite_code]))
    // A household nobody is in.
    await t.q("insert into public.households (name, invite_code) values ('Empty', 'AAAAAAAA')")

    // Ages: alex 40 days, blair 10 days, casey 3 days, dana a minute, erin just now.
    const setAge = (id, interval) => t.q(`update public.profiles set created_at = ${ago(interval)} where id = $1`, [id])
    await setAge(alex, "40 days")
    await setAge(blair, "10 days")
    await setAge(casey, "3 days")
    await setAge(dana, "1 minute")
    await t.q(`update public.households set created_at = ${ago("40 days")} where id = $1`, [maple])
    await t.q(`update public.households set created_at = ${ago("3 days")} where id = $1`, [oak])
    await t.q(`update auth.users set last_sign_in_at = ${ago("2 days")} where id = $1`, [casey])
    await t.q(`update auth.users set last_sign_in_at = ${ago("20 days")} where id = $1`, [blair])
  })

  describe("permissions", () => {
    for (const sql of FUNCTIONS) {
      const name = sql.match(/public\.(\w+)/)[1]
      test(`${name}: anon and signed-in people are refused`, async () => {
        await assertRejects(() => t.as(null, () => t.q(sql)), /permission denied/)
        await assertRejects(() => t.as(alex, () => t.q(sql)), /permission denied/)
      })
    }

    test("service_role can call them", async () => {
      for (const sql of FUNCTIONS) {
        if (NEEDS_REAL_ARGS.has(sql)) continue
        await svc(sql)
      }
    })

    test("the private tables and helpers are closed to every API role", async () => {
      for (const table of ["daily_counters", "daily_snapshots", "admin_audit_log"]) {
        await assertRejects(() => t.as(null, () => t.q(`select * from private.${table}`)), /permission denied/)
        await assertRejects(() => t.as(alex, () => t.q(`select * from private.${table}`)), /permission denied/)
        await assertRejects(() => svc(`select * from private.${table}`), /permission denied/)
        await assertRejects(() => t.as(alex, () => t.q(`delete from private.${table}`)), /permission denied/)
      }
      for (const fn of ["private.bump_daily('x')", "private.admin_mrr_est()", "private.admin_paying_user_ids()"]) {
        await assertRejects(() => t.as(alex, () => t.q(`select * from ${fn}`)), /permission denied/)
        await assertRejects(() => t.as(null, () => t.q(`select * from ${fn}`)), /permission denied/)
      }
    })

    test("every admin function is security definer with an empty search_path", async () => {
      const rows = await t.q(`
        select p.proname, p.prosecdef, p.proconfig
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and (p.proname like 'admin\\_%' or p.proname = 'bump_daily_metric')`)
      assert.equal(rows.length, FUNCTIONS.length)
      for (const r of rows) {
        assert.equal(r.prosecdef, true, r.proname)
        assert.ok(r.proconfig.includes("search_path=\"\""), `${r.proname}: ${r.proconfig}`)
      }
    })
  })

  describe("rate limits", () => {
    test("the allowlist is unchanged", async () => {
      assert.equal(await takeRate(alex, "nonsense"), null)
      assert.equal(await takeRate(alex, "invite_miss"), null)
      assert.equal(await takeRate(alex, "admin"), null)
      assert.equal(await takeRate(alex, "recipe_search"), true)
      assert.equal(await takeRate(alex, "recipe_open"), true)
      assert.equal(await takeRate(alex, "ingredient_lookup"), true)
      assert.equal(await takeRate(alex, "pro_sync"), true)
      const c = await counters()
      assert.equal(c["ai_calls"], undefined)
      assert.equal(Object.keys(c).filter((k) => k.startsWith("rate_limited:")).length, 0)
    })

    test("ai counts allowed calls, and refused calls count as rate_limited:ai", async () => {
      for (let i = 0; i < 30; i++) assert.equal(await takeRate(blair, "ai"), true)
      assert.equal((await counters())["ai_calls"], 30)
      assert.equal(await takeRate(blair, "ai"), false)
      assert.equal(await takeRate(blair, "ai"), false)
      const c = await counters()
      assert.equal(c["ai_calls"], 30)
      assert.equal(c["rate_limited:ai"], 2)
    })

    test("other buckets' refusals count under their own name", async () => {
      for (let i = 0; i < 15; i++) assert.equal(await takeRate(casey, "recipe_search"), true)
      assert.equal(await takeRate(casey, "recipe_search"), false)
      assert.equal((await counters())["rate_limited:recipe_search"], 1)
    })

    test("admin_rate_limit_stats", async () => {
      const rows = await svc("select bucket, max_hits, window_length::text as w, active_users, users_at_limit, hits_24h::int as hits from public.admin_rate_limit_stats()")
      assert.deepEqual(rows.map((r) => r.bucket), ["recipe_search", "recipe_open", "ingredient_lookup", "ai", "invite_miss", "pro_sync"])
      const by = Object.fromEntries(rows.map((r) => [r.bucket, r]))
      assert.equal(by.ai.max_hits, 30)
      assert.equal(by.ai.w, "01:00:00")
      assert.equal(by.ai.active_users, 1)
      assert.equal(by.ai.users_at_limit, 1)
      assert.equal(by.ai.hits, 30)
      assert.equal(by.recipe_search.active_users, 2) // alex once, casey 15 times
      assert.equal(by.recipe_search.users_at_limit, 1)
      assert.equal(by.recipe_search.hits, 16)
      assert.equal(by.invite_miss.max_hits, 10)
      assert.equal(by.invite_miss.active_users, 0)
      assert.equal(by.invite_miss.hits, 0)
    })
  })

  describe("AI allowance", () => {
    test("free uses, then a refusal, count separately", async () => {
      for (let i = 0; i < 10; i++) assert.equal((await takeAi(erin, fern)).allowed, true)
      assert.equal((await takeAi(erin, fern)).allowed, false)
      assert.equal((await takeAi(erin, fern)).allowed, false)
      const c = await counters()
      assert.equal(c["ai_allowance_free"], 10)
      assert.equal(c["ai_allowance_denied"], 2)
      assert.equal(c["ai_allowance_pro"], undefined)
    })

    test("admin_ai_usage_stats and admin_ai_top_households", async () => {
      await t.q(`insert into public.ai_usage (household_id, user_id, used_at) values ($1, $2, ${ago("3 days")})`, [oak, casey])
      const s = await svcOne("select * from public.admin_ai_usage_stats()")
      assert.equal(s.uses_24h, 10)
      assert.equal(s.uses_7d, 11)
      assert.equal(s.households_active_7d, 2)
      assert.equal(s.households_at_limit, 1)
      assert.equal(s.free_weekly_limit, 10)
      const top = await svc("select * from public.admin_ai_top_households(10)")
      assert.deepEqual(top.map((r) => [r.household_name, r.uses_7d, r.at_limit]), [["Fern", 10, true], ["Oak", 1, false]])
      assert.equal((await svc("select * from public.admin_ai_top_households(1)")).length, 1)
      // Oak's use is old news for the 24 hour number, and the table is cleaned up like the app does.
      await t.q("delete from public.ai_usage where household_id = $1", [oak])
    })
  })

  describe("stats on a seeded world", () => {
    before(async () => {
      // Activity: alex adds rice (an activity row as alex); a cook at Oak.
      await t.as(alex, () =>
        t.q("insert into public.pantry_items (household_id, name, quantity, unit, category) values ($1, 'Rice', 2, 'kg', 'grains')", [maple]),
      )
      await t.as(alex, () =>
        t.q("insert into public.pantry_items (household_id, name, quantity, unit, category) values ($1, ' rice ', 1, 'kg', 'grains')", [maple]),
      )
      await t.q(
        `insert into public.activity_log (household_id, actor_id, action, item_name, batch_id, details, created_at)
         values ($1, $2, 'cooked', 'Flour', 7, '{"recipe_title": "Pancakes"}', now() - interval '1 hour'),
                ($1, $2, 'cooked', 'Eggs', 7, '{"recipe_title": "Pancakes"}', now() - interval '1 hour'),
                ($1, $2, 'removed', 'Milk', 8, '{}', now() - interval '1 hour')`,
        [oak, casey],
      )
      await t.q("insert into public.shopping_list_items (household_id, name) values ($1, 'Salt')", [maple])
      await t.q("insert into public.shopping_list_items (household_id, name, checked_at) values ($1, 'Pepper', now())", [maple])
      await t.q("insert into public.saved_recipes (household_id, recipe_id, title, saved_by) values ($1, 11, 'Pancakes', $2), ($3, 11, 'Pancakes', $4)", [
        oak, casey, maple, alex,
      ])
      await t.q("insert into public.recipe_ratings (household_id, user_id, recipe_ref, rating) values ($1, $2, '11', 1), ($1, $3, '11', 1), ($1, $2, '99', -1)", [
        maple, alex, blair,
      ])

      // Subscriptions: alex monthly (App Store), casey yearly (Play Store, won't renew),
      // blair on a trial, dana a sandbox test.
      const sub = (user, product, store, period, sandbox, renew, days) =>
        t.q(
          `insert into public.subscriptions (user_id, has_entitlement, expires_at, product_id, store, period_type, is_sandbox, will_renew)
           values ($1, true, now() + interval '${days} days', $2, $3, $4, $5, $6)`,
          [user, product, store, period, sandbox, renew],
        )
      await sub(alex, "monthly", "app_store", "normal", false, true, 20)
      await sub(casey, "yearly", "play_store", "normal", false, false, 300)
      await sub(blair, "monthly", "app_store", "trial", false, true, 5)
      await sub(dana, "monthly", "app_store", "normal", true, true, 20)

      const ms = (daysFromNow) => `(extract(epoch from now() + interval '${daysFromNow} days') * 1000)::bigint`
      let n = 0
      const ev = (type, user, env, daysAgo, payload) =>
        t.q(
          `insert into public.revenuecat_events (id, type, app_user_id, environment, event_at, payload)
           values ($1, $2, $3, $4, now() - interval '${daysAgo} days', $5::jsonb || jsonb_build_object('environment', $4::text))`,
          [`e${++n}`, type, user, env, JSON.stringify(payload)],
        )
      const purchased = (await t.q(`select ${ms(-0)} as ms`))[0].ms
      const month = Number(purchased) + 30 * 86400000
      const year = Number(purchased) + 365 * 86400000
      // alex: a renewal 35 days ago, the latest purchase 5 days ago (monthly: 4.99).
      await ev("RENEWAL", alex, "PRODUCTION", 35, { price: 4.99, product_id: "monthly", store: "APP_STORE", purchased_at_ms: Number(purchased), expiration_at_ms: month })
      await ev("INITIAL_PURCHASE", alex, "PRODUCTION", 5, { price: 4.99, product_id: "monthly", store: "APP_STORE", period_type: "NORMAL", purchased_at_ms: Number(purchased), expiration_at_ms: month })
      // casey: yearly, 39.99 over 12 months, 3.3325 a month.
      await ev("INITIAL_PURCHASE", casey, "PRODUCTION", 0, { price: 39.99, product_id: "yearly", store: "PLAY_STORE", period_type: "NORMAL", purchased_at_ms: Number(purchased), expiration_at_ms: year })
      // blair: a free trial start.
      await ev("INITIAL_PURCHASE", blair, "PRODUCTION", 3, { price: 0, product_id: "monthly", store: "APP_STORE", period_type: "TRIAL" })
      // a refund of alex's 4.99, and someone whose subscription ended.
      await ev("CANCELLATION", alex, "PRODUCTION", 10, { price: -4.99, product_id: "monthly", store: "APP_STORE" })
      await ev("EXPIRATION", dana, "PRODUCTION", 2, { product_id: "monthly", store: "APP_STORE" })
      // sandbox: never counted as money.
      await ev("INITIAL_PURCHASE", dana, "SANDBOX", 1, { price: 9.99, product_id: "monthly", store: "APP_STORE", purchased_at_ms: Number(purchased), expiration_at_ms: month })
    })

    test("admin_user_stats", async () => {
      const s = await svcOne("select * from public.admin_user_stats()")
      assert.equal(s.users_total, 5)
      assert.equal(s.new_24h, 2) // dana, erin
      assert.equal(s.new_7d, 3) // + casey
      assert.equal(s.new_30d, 4) // + blair
      // Active: alex (pantry), erin (AI) today; + casey (sign-in 2d, and a cook) this week; + blair (sign-in 20d) this month.
      assert.equal(s.dau, 3)
      assert.equal(s.wau, 3)
      assert.equal(s.mau, 4)
      assert.equal(s.households_total, 4)
      assert.equal(s.households_new_7d, 3) // oak, fern, empty
      assert.equal(s.households_new_30d, 3)
      near(s.avg_members, 1.33, 0.01) // (2 + 1 + 1) / 3, ignoring the empty one
      near(s.multi_member_share, 0.3333, 0.0001)
      assert.equal(s.empty_households, 1)
    })

    test("admin_signups_daily has a row for every day, oldest first", async () => {
      const rows = await svc("select day::text as day, users, households from public.admin_signups_daily(5)")
      assert.equal(rows.length, 5)
      assert.equal(rows.at(-1).day, today)
      assert.ok(rows[0].day < rows[4].day)
      const total = rows.reduce((a, r) => a + r.users, 0)
      assert.equal(total, 3) // casey (3 days ago), dana, erin
      const wide = await svc("select count(*)::int as n, sum(users)::int as users from public.admin_signups_daily(60)")
      assert.equal(wide[0].n, 60)
      assert.equal(wide[0].users, 5)
      assert.equal((await svc("select * from public.admin_signups_daily(1000)")).length, 365)
    })

    test("admin_pro_stats", async () => {
      const s = await svcOne("select * from public.admin_pro_stats()")
      assert.equal(s.active_subscriptions, 2) // alex, casey
      assert.equal(s.trials, 1)
      assert.equal(s.not_renewing, 1) // casey
      assert.equal(s.sandbox, 1)
      assert.equal(s.comps_active, 0)
      assert.equal(s.pro_households, 2) // maple (alex, blair), oak (casey)
      assert.deepEqual(s.by_store, { app_store: 1, play_store: 1 })
    })

    test("admin_revenue_stats: production only, a refund, monthly and yearly MRR", async () => {
      const s = await svcOne("select * from public.admin_revenue_stats()")
      near(s.gross_all_time, 4.99 + 4.99 + 39.99) // sandbox excluded
      near(s.gross_30d, 4.99 + 39.99) // the 35-day-old renewal is out
      assert.ok(Number(s.gross_month) >= 39.99 && Number(s.gross_month) <= Number(s.gross_30d) + 0.001)
      near(s.refunds_30d, 4.99)
      near(s.net_30d_est, (4.99 + 39.99 - 4.99) * 0.7)
      near(s.mrr_est, 4.99 + 39.99 / 12)
      assert.equal(s.paying_users, 2)
      assert.equal(s.trials_started_30d, 1)
      assert.equal(s.expirations_30d, 1)
      assert.equal(s.sandbox_events_30d, 1)
    })

    test("admin_revenue_monthly has zero months and no sandbox money", async () => {
      const rows = await svc("select month::text as month, gross::float8 as gross, refunds::float8 as refunds from public.admin_revenue_monthly(14)")
      assert.equal(rows.length, 14)
      assert.ok(rows[0].month < rows[13].month)
      assert.ok(rows[0].gross === 0 && rows[0].refunds === 0)
      near(rows.reduce((a, r) => a + r.gross, 0), 4.99 + 4.99 + 39.99)
      near(rows.reduce((a, r) => a + r.refunds, 0), 4.99)
      assert.equal((await svc("select * from public.admin_revenue_monthly(0)")).length, 1)
    })

    test("admin_revenuecat_recent hides who and what was paid", async () => {
      const rows = await svc("select * from public.admin_revenuecat_recent(50)")
      assert.equal(rows.length, 7)
      assert.deepEqual(Object.keys(rows[0]).sort(), ["environment", "event_at", "product_id", "received_at", "store", "type"])
      assert.equal(rows[0].type, "INITIAL_PURCHASE") // casey's, the newest
      assert.equal(rows[0].store, "PLAY_STORE")
      assert.equal((await svc("select * from public.admin_revenuecat_recent(2)")).length, 2)
    })

    test("admin_usage_stats", async () => {
      const rows = await svc("select metric, all_time::int as all_time, d30::int as d30, d7::int as d7 from public.admin_usage_stats()")
      const by = Object.fromEntries(rows.map((r) => [r.metric, r]))
      assert.equal(by.pantry_items_now.all_time, 2)
      assert.equal(by.pantry_items_now.d30, null)
      assert.equal(by.pantry_items_added.all_time, 2)
      assert.equal(by.pantry_items_added.d7, 2)
      assert.equal(by["activity:added"].all_time, 2)
      assert.equal(by["activity:cooked"].all_time, 2)
      assert.equal(by["activity:removed"].d7, 1)
      assert.equal(by["activity:shopped"].all_time, 0) // every enum value has a row
      for (const a of ["added", "used", "restocked", "updated", "removed", "cooked", "shopped"]) assert.ok(by[`activity:${a}`], a)
      assert.equal(by.shopping_items.all_time, 2)
      assert.equal(by.saved_recipes.all_time, 2)
      assert.equal(by.ratings_up.all_time, 2)
      assert.equal(by.ratings_down.all_time, 1)
      assert.equal(by.ai_calls.all_time, 30)
      assert.equal(by.ai_allowance_free.all_time, 10)
      assert.equal(by.ai_allowance_pro.all_time, 0)
      assert.equal(by.spoonacular_points.all_time, 0)
      await t.q("insert into public.spoonacular_usage (day, points_used, requests) values (current_date, 12.4, 3), (current_date - 20, 5, 1)")
      const sp = (await svc("select all_time::int as a, d30::int as m, d7::int as w from public.admin_usage_stats() where metric = 'spoonacular_points'"))[0]
      assert.deepEqual(sp, { a: 17, m: 17, w: 12 })
    })

    test("admin_activity_daily", async () => {
      const rows = await svc("select day::text as day, action, n from public.admin_activity_daily(7)")
      const sum = (a) => rows.filter((r) => r.action === a).reduce((x, r) => x + r.n, 0)
      assert.equal(sum("added"), 2)
      assert.equal(sum("cooked"), 2)
      assert.equal(sum("removed"), 1)
    })

    test("admin_activation_funnel", async () => {
      const rows = await svc("select step, label, users from public.admin_activation_funnel(current_date - 30)")
      // Signed up in the last 30 days: blair, casey, dana, erin.
      assert.deepEqual(rows.map((r) => r.step), [1, 2, 3, 4, 5, 6])
      assert.deepEqual(rows.map((r) => r.users), [4, 3, 1, 1, 1, 2])
      const all = await svc("select users from public.admin_activation_funnel(null)")
      assert.equal(all[0].users, 5)
    })

    test("admin_retention_cohorts", async () => {
      const rows = await svc("select cohort_week::text as w, size, week_n, active from public.admin_retention_cohorts(4)")
      assert.ok(rows.length >= 4) // 4 cohorts, week 0 each, more for older ones
      assert.ok(rows.every((r) => r.week_n >= 0))
      const thisWeek = rows.filter((r) => r.week_n === 0).sort((a, b) => (a.w < b.w ? 1 : -1))[0]
      assert.ok(thisWeek.size >= 1) // erin signed up this week
      // Everyone is counted once per cohort, and nobody is active more than they signed up.
      assert.ok(rows.every((r) => r.active <= r.size))
      const total = rows.filter((r) => r.week_n === 0).reduce((a, r) => a + r.size, 0)
      assert.ok(total >= 4 && total <= 5) // alex (40 days) is out of the last 4 weeks
    })

    test("admin_popular", async () => {
      const rows = await svc("select list, name, n from public.admin_popular(30, 5)")
      const list = (l) => rows.filter((r) => r.list === l).map((r) => [r.name, r.n])
      assert.deepEqual(list("cooked"), [["Pancakes", 1]]) // one cook, two ingredients
      assert.deepEqual(list("saved"), [["Pancakes", 2]])
      assert.deepEqual(list("rated_up"), [["Pancakes", 2]]) // ref 11 resolves to a saved title
      assert.deepEqual(list("rated_down"), [["99", 1]]) // no title: the ref
      assert.deepEqual(list("pantry"), [["rice", 2]])
      assert.deepEqual(list("wasted"), [["milk", 1]])
      assert.ok(!JSON.stringify(rows).includes("Maple")) // no household names
      assert.equal((await svc("select * from public.admin_popular(30, 1)")).filter((r) => r.list === "saved").length, 1)
    })
  })

  describe("snapshots", () => {
    test("capturing twice leaves one row with the right totals", async () => {
      await svc("select public.admin_capture_daily_snapshot()")
      await svc("select public.admin_capture_daily_snapshot()")
      const rows = await svc("select * from public.admin_daily_snapshots($1::date, $1::date)", [today])
      assert.equal(rows.length, 1)
      const s = rows[0]
      assert.equal(s.users_total, 5)
      assert.equal(s.households_total, 4)
      assert.equal(s.multi_member_households, 1)
      assert.equal(s.pro_households, 2)
      assert.equal(s.paying_users, 2)
      assert.equal(s.trials_active, 1)
      assert.equal(s.comps_active, 0)
      near(s.mrr_est_usd, 4.99 + 39.99 / 12)
      assert.equal(s.pantry_items_total, 2)
      assert.equal(s.shopping_items_open, 1)
      assert.equal(s.saved_recipes_total, 2)
      near(s.spoonacular_points_used, 12.4)
    })

    test("the live numbers and the snapshot agree", async () => {
      const live = await svcOne("select * from public.admin_revenue_stats()")
      const snap = await svcOne("select * from public.admin_daily_snapshots($1::date, $1::date)", [today])
      near(snap.mrr_est_usd, live.mrr_est)
      assert.equal(snap.paying_users, live.paying_users)
    })

    test("future days are refused", async () => {
      await assertRejects(() => svc("select public.admin_capture_daily_snapshot(current_date + 2)"), /not be in the future|not in the future/)
    })

    test("the migration's back-fill gives every past day users and households", async () => {
      // The migration ran on an empty database, so run its back-fill statement now.
      const statement = MIGRATION.match(/insert into private\.daily_snapshots \(day, users_total, households_total\)[\s\S]*?on conflict \(day\) do nothing;/)
      assert.ok(statement, "back-fill statement found")
      await t.db.exec(statement[0])
      const rows = await svc(
        "select day::text as day, users_total, households_total, pro_households, mrr_est_usd from public.admin_daily_snapshots(current_date - 60, current_date)",
      )
      const by = Object.fromEntries(rows.map((r) => [r.day, r]))
      const dayOf = async (interval) => (await t.q(`select ((now() - interval '${interval}') at time zone 'utc')::date::text as d`))[0].d
      // 40 days ago: alex and Maple. Today is the captured row, not the back-fill.
      assert.equal(by[await dayOf("40 days")].users_total, 1)
      assert.equal(by[await dayOf("40 days")].households_total, 1)
      assert.equal(by[await dayOf("10 days")].users_total, 2) // + blair
      assert.equal(by[await dayOf("1 day")].users_total, 3) // + casey (dana and erin are newer)
      assert.equal(by[await dayOf("1 day")].households_total, 2) // maple and oak; fern and the empty one are new
      assert.equal(by[await dayOf("1 day")].pro_households, null)
      assert.equal(by[today].users_total, 5)
      // From the first sign-up to yesterday, with today's captured row on top.
      assert.equal(rows.length, 41)
    })

    test("admin_daily_snapshots rejects a silly range", async () => {
      await assertRejects(() => svc("select * from public.admin_daily_snapshots(current_date - 500, current_date)"), /at most 400 days/)
      await assertRejects(() => svc("select * from public.admin_daily_counters(current_date, current_date - 1)"), /at most 400 days/)
    })
  })

  describe("support", () => {
    test("find_user matches an exact email only, any case", async () => {
      const found = await svcOne("select * from public.admin_find_user($1)", ["  A@Test.dev "])
      assert.equal(found.user_id, alex)
      assert.equal(found.email, "a@test.dev")
      assert.equal(found.display_name, "Alex")
      assert.equal(found.pro_source, "subscription")
      assert.equal(found.comp_expires_at, null)
      assert.deepEqual(found.households.map((h) => [h.name, h.role, h.members]), [["Maple", "owner", 2]])
      assert.equal(Object.keys(found).includes("payload"), false)

      assert.equal((await svc("select * from public.admin_find_user('a@test')")).length, 0)
      assert.equal((await svc("select * from public.admin_find_user('@test.dev')")).length, 0)
      assert.equal((await svc("select * from public.admin_find_user('%@%')")).length, 0)
      assert.equal((await svc("select * from public.admin_find_user('a_test.dev@')")).length, 0)
      assert.equal((await svc("select * from public.admin_find_user('nobody@test.dev')")).length, 0)
    })

    test("find_user rejects bad input", async () => {
      for (const bad of ["", "no-at-sign", "test.dev", "x".repeat(320) + "@a", null]) {
        await assertRejects(() => svc("select * from public.admin_find_user($1)", [bad]), /full email/)
      }
      await assert.rejects(() => svc("select * from public.admin_find_user($1)", ["x".repeat(321)]), (e) => e.code === "22023")
    })

    test("find_user shows a housemate's Pro as 'household'", async () => {
      const fred = await t.createUser("f@test.dev", { full_name: "Fred" })
      assert.equal((await svcOne("select * from public.admin_find_user('f@test.dev')")).pro_source, null)
      const [{ invite_code }] = await t.q("select invite_code from public.households where id = $1", [oak])
      await t.as(fred, () => t.q("select public.join_household($1)", [invite_code]))
      assert.equal((await svcOne("select * from public.admin_find_user('f@test.dev')")).pro_source, "household")
    })

    test("a comp turns Pro on and off", async () => {
      const gina = await t.createUser("g@test.dev", { full_name: "Gina" })
      const isPro = async () => (await t.q("select private.user_is_pro($1) as pro", [gina]))[0].pro
      assert.equal(await isPro(), false)
      const future = new Date(Date.now() + 30 * 86400000).toISOString()
      await svc("select public.admin_grant_comp($1, $2, $3)", [gina, future, "  friend of the app "])
      assert.equal(await isPro(), true)
      const found = await svcOne("select * from public.admin_find_user('g@test.dev')")
      assert.equal(found.pro_source, "comp")
      assert.equal(found.comp_note, "friend of the app")
      assert.ok(found.comp_expires_at instanceof Date)
      assert.equal((await svcOne("select comps_active from public.admin_pro_stats()")).comps_active, 1)

      // Granting again changes it instead of failing.
      await svc("select public.admin_grant_comp($1, null, null)", [gina])
      assert.equal((await t.q("select count(*)::int as n, max(note) as note from private.pro_comps where user_id = $1", [gina]))[0].n, 1)

      assert.equal((await svcOne("select public.admin_revoke_comp($1) as r", [gina])).r, true)
      assert.equal(await isPro(), false)
      assert.equal((await svcOne("select public.admin_revoke_comp($1) as r", [gina])).r, false)
      assert.equal((await svcOne("select * from public.admin_find_user('g@test.dev')")).pro_source, null)
    })

    test("a comp can't be granted to nobody, with a long note, or already expired", async () => {
      await assertRejects(() => svc("select public.admin_grant_comp(gen_random_uuid(), null, 'x')"), /No such user/)
      await assertRejects(() => svc("select public.admin_grant_comp(null, null, 'x')"), /No such user/)
      await assertRejects(() => svc("select public.admin_grant_comp($1, null, $2)", [dana, "n".repeat(201)]), /200 characters/)
      await assertRejects(() => svc("select public.admin_grant_comp($1, now() - interval '1 day', 'x')", [dana]), /in the future/)
      assert.equal((await t.q("select count(*)::int as n from private.pro_comps where user_id = $1", [dana]))[0].n, 0)
    })
  })

  describe("audit log", () => {
    test("log then recent round-trips, newest first", async () => {
      const a = await svcOne("select public.admin_log_action($1, 'q@test.dev', 'grant_comp', $2, $3::jsonb) as id", [
        alex, dana, JSON.stringify({ note: "friend" }),
      ])
      const b = await svcOne("select public.admin_log_action(null, null, 'find_user', 'x@test.dev') as id")
      assert.ok(b.id > a.id)
      const rows = await svc("select * from public.admin_audit_recent(10)")
      assert.equal(rows.length, 3) // the permission check logged one too (service_role call)
      assert.equal(rows[0].id, b.id)
      assert.equal(rows[0].action, "find_user")
      assert.equal(rows[0].target, "x@test.dev")
      assert.deepEqual(rows[0].details, {})
      assert.equal(rows[1].admin_user_id, alex)
      assert.equal(rows[1].admin_email, "q@test.dev")
      assert.deepEqual(rows[1].details, { note: "friend" })
      assert.equal((await svc("select * from public.admin_audit_recent(1)")).length, 1)
    })

    test("bad entries are refused", async () => {
      await assertRejects(() => svc("select public.admin_log_action(null, null, '', 'x')"), /Bad action/)
      await assertRejects(() => svc("select public.admin_log_action(null, null, $1, 'x')", ["a".repeat(61)]), /Bad action/)
      await assertRejects(() => svc("select public.admin_log_action(null, null, 'a', $1)", ["t".repeat(201)]), /too long/)
      await assertRejects(() => svc("select public.admin_log_action(null, null, 'a', 'b', $1::jsonb)", [JSON.stringify({ x: "y".repeat(4001) })]), /too long/)
    })

    test("entries can't be changed or deleted, even by the owner", async () => {
      await assertRejects(() => t.q("update private.admin_audit_log set action = 'x'"), /append-only/)
      await assertRejects(() => t.q("delete from private.admin_audit_log"), /append-only/)
    })
  })

  describe("bump_daily_metric", () => {
    test("accepts the fixed metrics and counts them", async () => {
      for (const m of ["ai_error:timeout", "ai_error:timeout", "spoonacular_cache:hit", "spoonacular_cache:miss", "spoonacular_error:http_402"]) {
        await svc("select public.bump_daily_metric($1)", [m])
      }
      const c = await counters()
      assert.equal(c["ai_error:timeout"], 3) // the permission check bumped it once
      assert.equal(c["spoonacular_cache:hit"], 1)
      assert.equal(c["spoonacular_cache:miss"], 1)
      assert.equal(c["spoonacular_error:http_402"], 1)
    })

    test("rejects anything else", async () => {
      for (const m of ["foo", "", "ai_error:Timeout", "ai_error:", "ai_error:" + "a".repeat(31), "spoonacular_cache:other", "ai_calls", "rate_limited:ai", "ai_error:x\nfoo", null]) {
        await assert.rejects(() => svc("select public.bump_daily_metric($1)", [m]), (e) => e.code === "22023", String(m))
      }
    })
  })

  describe("Pro households are counted apart", () => {
    test("a Pro household's AI use counts as ai_allowance_pro", async () => {
      assert.equal((await takeAi(alex, maple)).pro, true)
      assert.equal((await takeAi(blair, maple)).pro, true)
      assert.equal((await counters())["ai_allowance_pro"], 2)
    })
  })
})
