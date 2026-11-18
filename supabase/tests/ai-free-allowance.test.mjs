import assert from "node:assert/strict"
import { before, describe, test } from "node:test"

import { assertRejects, createTestDb } from "./harness.mjs"

describe("Free weekly AI allowance", () => {
  let t, alex, blair, casey, maple, oak

  const take = (user, household) =>
    t.as(user, async () => (await t.q("select * from public.take_ai_allowance($1)", [household]))[0])
  const usage = (household) => t.q("select count(*)::int as n from public.ai_usage where household_id = $1", [household])

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

  test("housemates share 10 uses, then it says no with a reset time", async () => {
    for (let i = 1; i <= 10; i++) {
      const r = await take(i % 2 ? alex : blair, maple)
      assert.equal(r.allowed, true)
      assert.equal(r.pro, false)
      assert.equal(r.used, i)
      assert.equal(r.lim, 10)
    }
    const over = await take(blair, maple)
    assert.equal(over.allowed, false)
    assert.equal(over.used, 10)
    assert.ok(over.resets_at instanceof Date && over.resets_at > new Date())
    assert.equal((await usage(maple))[0].n, 10)
  })

  test("other households have their own allowance", async () => {
    const r = await take(casey, oak)
    assert.equal(r.allowed, true)
    assert.equal(r.used, 1)
  })

  test("uses older than 7 days stop counting", async () => {
    await t.q("update public.ai_usage set used_at = now() - interval '7 days 1 minute' where household_id = $1", [maple])
    const r = await take(alex, maple)
    assert.equal(r.allowed, true)
    assert.equal(r.used, 1)
  })

  test("Pro households are never counted", async () => {
    await t.q(
      `insert into public.subscriptions (user_id, has_entitlement, expires_at, product_id, store, period_type, will_renew)
       values ($1, true, now() + interval '30 days', 'lazychef_pro_monthly', 'app_store', 'normal', true)`,
      [blair],
    )
    const before = (await usage(maple))[0].n
    for (let i = 0; i < 12; i++) {
      const r = await take(alex, maple)
      assert.equal(r.allowed, true)
      assert.equal(r.pro, true)
    }
    assert.equal((await usage(maple))[0].n, before)
  })

  test("outsiders and anon can't take another household's allowance", async () => {
    await assertRejects(() => take(casey, maple), /Not a member/)
    await assertRejects(() => take(null, maple), /permission denied/)
  })

  test("members only read their own household's usage and can't write it", async () => {
    const rows = await t.as(casey, () => t.q("select household_id from public.ai_usage"))
    assert.ok(rows.every((r) => r.household_id === oak))
    await assertRejects(
      () => t.as(casey, () => t.q("insert into public.ai_usage (household_id, user_id) values ($1, $2)", [oak, casey])),
      /permission denied/,
    )
    await assertRejects(() => t.as(casey, () => t.q("delete from public.ai_usage where household_id = $1", [oak])), /permission denied/)
  })
})
