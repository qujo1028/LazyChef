import assert from "node:assert/strict"
import { before, describe, test } from "node:test"

import { assertRejects, createTestDb } from "./harness.mjs"

describe("Pro subscriptions", () => {
  let t, alex, blair, casey, maple, oak

  const status = (user, household) => t.as(user, async () => (await t.q("select * from public.get_pro_status($1)", [household]))[0])
  const asService = async (fn) => {
    await t.db.exec("set role service_role")
    try {
      return await fn()
    } finally {
      await t.db.exec("reset role")
    }
  }

  before(async () => {
    t = await createTestDb()
    alex = await t.createUser("a@test.dev", { full_name: "Alex" })
    blair = await t.createUser("b@test.dev", { full_name: "Blair" })
    casey = await t.createUser("c@test.dev", { full_name: "Casey" })
    maple = await t.as(alex, async () => (await t.q("select public.create_household('Maple') as id"))[0].id)
    oak = await t.as(casey, async () => (await t.q("select public.create_household('Oak') as id"))[0].id)
    const [{ invite_code }] = await t.q("select invite_code from public.households where id = $1", [maple])
    await t.as(blair, () => t.q("select public.join_household($1)", [invite_code]))
  })

  test("nobody has Pro to start with", async () => {
    const s = await status(alex, maple)
    assert.equal(s.household_pro, false)
    assert.equal(s.me_pro, false)
    assert.equal(s.me_source, null)
    assert.equal(s.sponsor_name, null)
  })

  test("the server saves a subscription; it covers the whole household", async () => {
    await asService(() =>
      t.q(
        `insert into public.subscriptions (user_id, has_entitlement, expires_at, product_id, store, period_type, will_renew)
         values ($1, true, now() + interval '3 days', 'lazychef_pro_yearly', 'app_store', 'trial', true)`,
        [alex],
      ),
    )
    const mine = await status(alex, maple)
    assert.equal(mine.household_pro, true)
    assert.equal(mine.me_pro, true)
    assert.equal(mine.me_source, "subscription")
    assert.equal(mine.period_type, "trial")
    assert.equal(mine.will_renew, true)

    const housemate = await status(blair, maple)
    assert.equal(housemate.household_pro, true)
    assert.equal(housemate.me_pro, false)
    assert.equal(housemate.sponsor_name, "Alex")
    assert.equal(housemate.expires_at, null, "a housemate doesn't see the subscriber's details")

    // Another household isn't covered.
    assert.equal((await status(casey, oak)).household_pro, false)
  })

  test("an expired subscription isn't Pro", async () => {
    await asService(() => t.q("update public.subscriptions set expires_at = now() - interval '1 minute' where user_id = $1", [alex]))
    assert.equal((await status(alex, maple)).household_pro, false)
    assert.equal((await status(blair, maple)).household_pro, false)
    // Lifetime (no end date) is Pro.
    await asService(() => t.q("update public.subscriptions set expires_at = null where user_id = $1", [alex]))
    assert.equal((await status(blair, maple)).household_pro, true)
    // Lost entitlement isn't, whatever the date says.
    await asService(() => t.q("update public.subscriptions set has_entitlement = false where user_id = $1", [alex]))
    assert.equal((await status(alex, maple)).household_pro, false)
  })

  test("a comp gives Pro until it ends", async () => {
    await asService(() => t.q("insert into private.pro_comps (user_id, note) values ($1, 'founder')", [casey]))
    const s = await status(casey, oak)
    assert.equal(s.household_pro, true)
    assert.equal(s.me_source, "comp")
    await asService(() => t.q("update private.pro_comps set expires_at = now() - interval '1 second' where user_id = $1", [casey]))
    assert.equal((await status(casey, oak)).household_pro, false)
  })

  test("outsiders get nothing; signed-out callers can't call it", async () => {
    assert.equal(await status(casey, maple), undefined)
    await t.as(null, () => assertRejects(() => t.q("select * from public.get_pro_status($1)", [maple]), /permission denied/))
  })

  test("people read only their own subscription and can't write it", async () => {
    await asService(() => t.q("update public.subscriptions set has_entitlement = true where user_id = $1", [alex]))
    await t.as(alex, async () => {
      assert.equal((await t.q("select * from public.subscriptions")).length, 1)
      await assertRejects(() => t.q("update public.subscriptions set expires_at = null"), /permission denied/)
      await assertRejects(
        () => t.q("insert into public.subscriptions (user_id, has_entitlement) values ($1, true)", [alex]),
        /permission denied/,
      )
    })
    await t.as(blair, async () => {
      assert.equal((await t.q("select * from public.subscriptions")).length, 0, "housemates don't see it")
      await assertRejects(
        () => t.q("insert into public.subscriptions (user_id, has_entitlement) values ($1, true)", [blair]),
        /permission denied/,
      )
    })
  })

  test("comps, the webhook log and the private checks are closed to users", async () => {
    await t.as(alex, async () => {
      await assertRejects(() => t.q("select * from private.pro_comps"), /permission denied/)
      await assertRejects(() => t.q("insert into private.pro_comps (user_id) values ($1)", [alex]), /permission denied/)
      await assertRejects(() => t.q("select * from public.revenuecat_events"), /permission denied/)
      await assertRejects(() => t.q("select private.household_is_pro($1)", [maple]), /permission denied/)
      await assertRejects(() => t.q("select private.user_is_pro($1)", [alex]), /permission denied/)
    })
  })

  test("the webhook log keeps each event once", async () => {
    await asService(async () => {
      const insert = () =>
        t.q(
          `insert into public.revenuecat_events (id, type, app_user_id, payload) values ('evt_1', 'INITIAL_PURCHASE', $1, '{}')
           on conflict (id) do nothing returning id`,
          [alex],
        )
      assert.equal((await insert()).length, 1)
      assert.equal((await insert()).length, 0)
    })
  })

  test("refreshing Pro status is rate limited per person", async () => {
    const take = (user) => t.as(user, async () => (await t.q("select public.take_rate_limit('pro_sync') as ok"))[0].ok)
    for (let i = 0; i < 30; i++) assert.equal(await take(blair), true)
    assert.equal(await take(blair), false)
    assert.equal(await take(alex), true)
  })

  test("deleting an account removes its subscription and comp", async () => {
    await t.q("delete from auth.users where id = $1", [casey])
    const [{ n }] = await t.q("select count(*)::int as n from private.pro_comps where user_id = $1", [casey])
    assert.equal(n, 0)
  })
})
