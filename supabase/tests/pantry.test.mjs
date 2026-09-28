import assert from "node:assert/strict"
import { before, describe, test } from "node:test"

import { assertRejects, createTestDb } from "./harness.mjs"

describe("pantry", () => {
  let t, alex, blair, casey, maple, caseyHome

  const activity = (household) =>
    t.q("select action, item_name, quantity::float8 as quantity, unit, actor_id, batch_id from public.activity_log where household_id = $1 order by id", [household])

  before(async () => {
    t = await createTestDb()
    alex = await t.createUser("a@test.dev", { full_name: "Alex" })
    blair = await t.createUser("b@test.dev", { full_name: "Blair" })
    casey = await t.createUser("c@test.dev", { full_name: "Casey" })
    maple = await t.as(alex, async () => (await t.q("select public.create_household('Maple') as id"))[0].id)
    const [{ invite_code }] = await t.q("select invite_code from public.households where id = $1", [maple])
    await t.as(blair, () => t.q("select public.join_household($1)", [invite_code]))
    caseyHome = await t.as(casey, async () => (await t.q("select public.create_household('Casey Home') as id"))[0].id)
  })

  test("adding a batch inserts items, stamps the author, and logs one batch", async () => {
    const items = [
      { name: "chicken breast", quantity: 2, unit: "lb", category: "meat", ingredient_id: 5062 },
      { name: " eggs ", quantity: 12, unit: "count", category: "dairy", expires_on: "2026-10-10" },
      { name: "salt", quantity: null, unit: "count", category: "spices", is_staple: true },
    ]
    const ids = await t.as(alex, async () =>
      (await t.q("select * from public.add_pantry_items($1, $2)", [maple, JSON.stringify(items)])).map((r) => r.add_pantry_items),
    )
    assert.equal(ids.length, 3)
    const rows = await t.q("select * from public.pantry_items where household_id = $1 order by created_at, name", [maple])
    const eggs = rows.find((r) => r.name === "eggs")
    assert.ok(eggs, "name is trimmed")
    assert.equal(Number(eggs.quantity), 12)
    assert.equal(rows.find((r) => r.name === "salt").is_staple, true)
    assert.equal(rows.find((r) => r.name === "salt").quantity, null)
    assert.ok(rows.every((r) => r.created_by === alex && r.updated_by === alex))

    const log = await activity(maple)
    assert.deepEqual(log.map((r) => r.action), ["added", "added", "added"])
    assert.equal(new Set(log.map((r) => r.batch_id)).size, 1, "one request = one batch")
    assert.ok(log.every((r) => r.actor_id === alex))
  })

  test("topping up merges quantity and keeps the earliest expiry", async () => {
    const [eggs] = await t.q("select id from public.pantry_items where household_id = $1 and name = 'eggs'", [maple])
    await t.as(blair, () =>
      t.q("select * from public.add_pantry_items($1, $2)", [
        maple,
        JSON.stringify([{ merge_into: eggs.id, quantity: 6, expires_on: "2026-10-20" }]),
      ]),
    )
    const [row] = await t.q("select quantity::float8 as quantity, expires_on::text, updated_by from public.pantry_items where id = $1", [eggs.id])
    assert.deepEqual(row, { quantity: 18, expires_on: "2026-10-10", updated_by: blair })
    const last = (await activity(maple)).at(-1)
    assert.deepEqual([last.action, last.quantity, last.actor_id], ["restocked", 6, blair])
  })

  test("using and adjusting compose and never go below zero", async () => {
    const [chicken] = await t.q("select id from public.pantry_items where household_id = $1 and name = 'chicken breast'", [maple])
    await t.as(alex, async () => {
      const [{ adjust_pantry_quantity: left }] = await t.q("select public.adjust_pantry_quantity($1, -0.5)", [chicken.id])
      assert.equal(Number(left), 1.5)
    })
    await t.as(blair, async () => {
      const [{ adjust_pantry_quantity: left }] = await t.q("select public.adjust_pantry_quantity($1, -5)", [chicken.id])
      assert.equal(Number(left), 0)
    })
    const log = (await activity(maple)).slice(-2)
    assert.deepEqual(log.map((r) => [r.action, r.quantity]), [["used", 0.5], ["used", 1.5]])
  })

  test("a ran-out item restocked takes the new expiry date", async () => {
    const [chicken] = await t.q("select id from public.pantry_items where household_id = $1 and name = 'chicken breast'", [maple])
    await t.q("update public.pantry_items set expires_on = '2026-09-01' where id = $1", [chicken.id])
    await t.as(alex, () =>
      t.q("select * from public.add_pantry_items($1, $2)", [maple, JSON.stringify([{ merge_into: chicken.id, quantity: 3, expires_on: "2026-10-05" }])]),
    )
    const [row] = await t.q("select quantity::float8 as quantity, expires_on::text from public.pantry_items where id = $1", [chicken.id])
    assert.deepEqual(row, { quantity: 3, expires_on: "2026-10-05" })
  })

  test("edits are logged, and authorship can't be spoofed", async () => {
    const [salt] = await t.q("select id from public.pantry_items where household_id = $1 and name = 'salt'", [maple])
    await t.as(blair, async () => {
      await t.q("update public.pantry_items set category = 'other' where id = $1", [salt.id])
      await assertRejects(() => t.q("update public.pantry_items set created_by = $1 where id = $2", [casey, salt.id]), /permission denied/)
      await assertRejects(() => t.q("update public.pantry_items set household_id = $1 where id = $2", [caseyHome, salt.id]), /permission denied/)
    })
    const last = (await activity(maple)).at(-1)
    assert.deepEqual([last.action, last.item_name, last.actor_id], ["updated", "salt", blair])
    const [row] = await t.q("select updated_by from public.pantry_items where id = $1", [salt.id])
    assert.equal(row.updated_by, blair)
  })

  test("outsiders can't read, add to, change or delete another household's pantry", async () => {
    const [eggs] = await t.q("select id from public.pantry_items where household_id = $1 and name = 'eggs'", [maple])
    await t.as(casey, async () => {
      assert.equal((await t.q("select count(*)::int as n from public.pantry_items")).at(0).n, 0)
      assert.equal((await t.q("select count(*)::int as n from public.activity_log")).at(0).n, 0)
      await assertRejects(
        () => t.q("select * from public.add_pantry_items($1, $2)", [maple, JSON.stringify([{ name: "x", quantity: 1, unit: "count" }])]),
        /row-level security/,
      )
      await assertRejects(
        () => t.q("select * from public.add_pantry_items($1, $2)", [maple, JSON.stringify([{ merge_into: eggs.id, quantity: 1 }])]),
        /no longer exists/,
      )
      const [{ adjust_pantry_quantity: result }] = await t.q("select public.adjust_pantry_quantity($1, -1)", [eggs.id])
      assert.equal(result, null)
      assert.equal((await t.q("delete from public.pantry_items where id = $1 returning id", [eggs.id])).length, 0)
      await assertRejects(() => t.q("insert into public.activity_log (household_id, action, item_name, batch_id) values ($1, 'added', 'x', 1)", [caseyHome]), /permission denied/)
    })
    const [row] = await t.q("select quantity::float8 as quantity from public.pantry_items where id = $1", [eggs.id])
    assert.equal(row.quantity, 18)
  })

  test("category fixes are shared within the household only", async () => {
    await t.as(blair, () =>
      t.q("insert into public.category_overrides (household_id, ingredient_key, category) values ($1, 'oat milk', 'dairy')", [maple]),
    )
    await t.as(alex, async () => assert.equal((await t.q("select category from public.category_overrides")).at(0).category, "dairy"))
    await t.as(casey, async () => {
      assert.equal((await t.q("select count(*)::int as n from public.category_overrides")).at(0).n, 0)
      await assertRejects(
        () => t.q("insert into public.category_overrides (household_id, ingredient_key, category) values ($1, 'x', 'dairy')", [maple]),
        /row-level security/,
      )
    })
  })

  test("pantry and activity changes reach members' realtime channel only", async () => {
    const topic = `household:${maple}`
    const tables = (user) =>
      t.as(user, async () => (await t.q("select distinct payload->>'table' as t from realtime.messages order by 1")).map((r) => r.t), { topic })
    const seen = await tables(blair)
    assert.ok(seen.includes("pantry_items") && seen.includes("activity_log"))
    assert.deepEqual(await tables(casey), [])
  })

  test("deleting logs 'removed'; a deleted household takes its pantry and log with it", async () => {
    const [salt] = await t.q("select id from public.pantry_items where household_id = $1 and name = 'salt'", [maple])
    await t.as(alex, () => t.q("delete from public.pantry_items where id = $1", [salt.id]))
    assert.equal((await activity(maple)).at(-1).action, "removed")

    await t.as(blair, () => t.q("select public.leave_household($1)", [maple]))
    await t.as(alex, () => t.q("select public.leave_household($1)", [maple]))
    const counts = await t.q(
      "select (select count(*) from public.pantry_items where household_id = $1)::int as items, (select count(*) from public.activity_log where household_id = $1)::int as log",
      [maple],
    )
    assert.deepEqual(counts[0], { items: 0, log: 0 })
  })

  test("signed-out requests get nothing", async () => {
    await t.as(null, async () => {
      await assertRejects(() => t.q("select count(*) from public.pantry_items"), /permission denied/)
      await assertRejects(() => t.q("select public.adjust_pantry_quantity(gen_random_uuid(), 1)"), /permission denied/)
    })
  })
})
