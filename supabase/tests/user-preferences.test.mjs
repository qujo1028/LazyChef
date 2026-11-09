import assert from "node:assert/strict"
import { before, describe, test } from "node:test"

import { assertRejects, createTestDb } from "./harness.mjs"

describe("user preferences", () => {
  let t, alex, blair

  const save = (diet, allergies, cuisines, world) =>
    t.q("select public.set_my_preferences($1, $2, $3, $4)", [diet, allergies, cuisines, world])
  const mine = async () => (await t.q("select diet, allergies, cuisines, world_recipes from public.user_preferences"))

  before(async () => {
    t = await createTestDb()
    alex = await t.createUser("a@test.dev", { full_name: "Alex" })
    blair = await t.createUser("b@test.dev", { full_name: "Blair" })
  })

  test("saving creates your row, sorted and without duplicates", async () => {
    await t.as(alex, () => save("vegetarian", ["peanut", "dairy", "peanut"], ["thai", "italian"], true))
    const rows = await t.as(alex, mine)
    assert.deepEqual(rows, [{ diet: "vegetarian", allergies: ["dairy", "peanut"], cuisines: ["italian", "thai"], world_recipes: true }])
  })

  test("saving again replaces the row", async () => {
    await t.as(alex, () => save("none", [], [], false))
    const rows = await t.as(alex, mine)
    assert.deepEqual(rows, [{ diet: "none", allergies: [], cuisines: [], world_recipes: false }])
  })

  test("you only see your own preferences", async () => {
    await t.as(blair, () => save("vegan", ["soy"], [], false))
    assert.equal((await t.as(alex, mine)).length, 1)
    assert.equal((await t.as(alex, mine))[0].diet, "none")
    assert.equal((await t.as(blair, mine))[0].diet, "vegan")
  })

  test("nobody can write the table directly", async () => {
    await assertRejects(
      () => t.as(alex, () => t.q("insert into public.user_preferences (user_id, diet) values ($1, 'vegan')", [blair])),
      /permission denied/,
    )
    await assertRejects(
      () => t.as(alex, () => t.q("update public.user_preferences set diet = 'vegan'")),
      /permission denied/,
    )
  })

  test("signed-out callers can't save or read", async () => {
    await assertRejects(() => t.as(null, () => save("vegan", [], [], false)), /permission denied/)
    await assertRejects(() => t.as(null, mine), /permission denied/)
  })

  test("unknown values are rejected", async () => {
    await assertRejects(() => t.as(alex, () => save("carnivore", [], [], false)), /check constraint/)
    await assertRejects(() => t.as(alex, () => save("none", ["kale"], [], false)), /check constraint/)
    await assertRejects(() => t.as(alex, () => save("none", [], ["martian"], false)), /check constraint/)
  })

  test("deleting the account deletes the preferences", async () => {
    await t.q("delete from auth.users where id = $1", [blair])
    const [{ n }] = await t.q("select count(*)::int as n from public.user_preferences where user_id = $1", [blair])
    assert.equal(n, 0)
  })
})
