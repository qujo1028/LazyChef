import assert from "node:assert/strict"
import { before, describe, test } from "node:test"

import { assertRejects, createTestDb } from "./harness.mjs"

const IDEA = {
  title: "Pantry Fried Rice",
  blurb: "Quick and cheap.",
  ready_in_minutes: 20,
  servings: 2,
  meal: "Dinner",
  ingredients: [
    { name: "rice", amount: 2, unit: "cup" },
    { name: "eggs", amount: 2, unit: "count" },
    { name: "salt", amount: null, unit: null },
  ],
  steps: ["Cook the rice.", "Fry it with the eggs."],
}

describe("AI recipes, cooking them, and ratings", () => {
  let t, alex, blair, casey, maple, caseyHome, ids

  const saveIdea = (user, household, recipe = IDEA) =>
    t.as(user, async () => (await t.q("select public.save_ai_recipe($1, $2) as id", [household, JSON.stringify(recipe)]))[0].id)
  const cookAi = (user, household, recipeId, deductions) =>
    t.as(user, () =>
      t.q(
        "select name, quantity_before::float8 as before, quantity_after::float8 as after from public.cook_ai_recipe($1, $2, $3)",
        [household, recipeId, JSON.stringify(deductions)],
      ),
    )
  const cookSpoon = (user, household, recipeId, deductions) =>
    t.as(user, () =>
      t.q("select * from public.cook_recipe($1, $2, 'Chicken Tikka Masala', $3)", [household, recipeId, JSON.stringify(deductions)]),
    )
  const rate = (user, household, kind, key, rating) =>
    t.as(user, async () => (await t.q("select public.rate_recipe($1, $2, $3, $4::smallint) as r", [household, kind, key, rating]))[0].r)
  const ratings = (user, household) =>
    t.as(user, () =>
      t.q(
        "select user_id, recipe_kind, recipe_key, rating from public.recipe_ratings where household_id = $1 order by recipe_kind, recipe_key, user_id",
        [household],
      ),
    )
  const quantity = async (id) => (await t.q("select quantity::float8 as quantity from public.pantry_items where id = $1", [id]))[0].quantity

  before(async () => {
    t = await createTestDb()
    alex = await t.createUser("a@test.dev", { full_name: "Alex" })
    blair = await t.createUser("b@test.dev", { full_name: "Blair" })
    casey = await t.createUser("c@test.dev", { full_name: "Casey" })
    maple = await t.as(alex, async () => (await t.q("select public.create_household('Maple') as id"))[0].id)
    const [{ invite_code }] = await t.q("select invite_code from public.households where id = $1", [maple])
    await t.as(blair, () => t.q("select public.join_household($1)", [invite_code]))
    caseyHome = await t.as(casey, async () => (await t.q("select public.create_household('Casey Home') as id"))[0].id)
    const [rice, eggs, salt] = await t.as(alex, async () =>
      (
        await t.q("select * from public.add_pantry_items($1, $2)", [
          maple,
          JSON.stringify([
            { name: "rice", quantity: 3, unit: "cup", category: "grains" },
            { name: "eggs", quantity: 4, unit: "count", category: "dairy" },
            { name: "salt", quantity: null, unit: "count", category: "spices", is_staple: true },
          ]),
        ])
      ).map((r) => r.add_pantry_items),
    )
    ids = { rice, eggs, salt }
  })

  test("members save an AI recipe, stamped with who saved it; shape is normalized", async () => {
    const id = await saveIdea(blair, maple)
    const rows = await t.as(alex, () => t.q("select * from public.ai_recipes where household_id = $1", [maple]))
    assert.equal(rows.length, 1)
    assert.equal(rows[0].id, id)
    assert.equal(rows[0].created_by, blair)
    assert.equal(rows[0].meal, "dinner")
    assert.deepEqual(rows[0].ingredients[2], { name: "salt", amount: null, unit: null })
  })

  test("bad shapes are rejected", async () => {
    const bad = [
      { ...IDEA, title: "  " },
      { ...IDEA, ingredients: [] },
      { ...IDEA, ingredients: [{ name: "rice", amount: -1, unit: "cup" }] },
      { ...IDEA, ingredients: [{ amount: 1 }] },
      { ...IDEA, steps: [] },
      { ...IDEA, steps: [5] },
      { ...IDEA, servings: "two" },
      "nope",
    ]
    for (const recipe of bad) await assertRejects(() => saveIdea(alex, maple, recipe), /./)
  })

  test("no direct writes, and other households can't see, save, or delete", async () => {
    await t.as(alex, () =>
      assertRejects(
        () =>
          t.q(
            "insert into public.ai_recipes (household_id, title, ingredients, steps) values ($1, 'X', '[{\"name\":\"a\"}]', '[\"b\"]')",
            [maple],
          ),
        /permission denied/,
      ),
    )
    await assertRejects(() => saveIdea(casey, maple), /not in that household/)
    assert.deepEqual(await t.as(casey, () => t.q("select id from public.ai_recipes where household_id = $1", [maple])), [])
    await t.as(casey, () => t.q("delete from public.ai_recipes where household_id = $1", [maple]))
    assert.equal((await t.q("select 1 from public.ai_recipes where household_id = $1", [maple])).length, 1)
  })

  test("members delete their household's AI recipes", async () => {
    const id = await saveIdea(alex, maple, { ...IDEA, title: "Temporary" })
    await t.as(blair, () => t.q("delete from public.ai_recipes where id = $1", [id]))
    assert.equal((await t.q("select 1 from public.ai_recipes where id = $1", [id])).length, 0)
  })

  test("cooking an AI recipe deducts the pantry and logs it with the AI ref", async () => {
    const [{ id }] = await t.q("select id from public.ai_recipes where title = 'Pantry Fried Rice'")
    const before = (await t.q("select count(*)::int as n from public.activity_log"))[0].n
    const result = await cookAi(blair, maple, id, [
      { item_id: ids.rice, amount: 2 },
      { item_id: ids.eggs, amount: 5 },
      { item_id: ids.salt, amount: 1 },
    ])
    assert.deepEqual(result.map((r) => [r.name, r.before, r.after]), [
      ["rice", 3, 1],
      ["eggs", 4, 0],
      ["salt", null, null],
    ])
    assert.equal(await quantity(ids.rice), 1)
    const rows = (await t.q("select action, item_name, actor_id, batch_id, details from public.activity_log order by id")).slice(before)
    assert.deepEqual(rows.map((r) => [r.action, r.item_name, r.actor_id]), [
      ["cooked", "rice", blair],
      ["cooked", "eggs", blair],
    ])
    assert.equal(new Set(rows.map((r) => r.batch_id)).size, 1)
    assert.deepEqual(rows[0].details, { recipe_kind: "ai", ai_recipe_id: id, recipe_title: "Pantry Fried Rice" })
    assert.equal(rows[0].details.recipe_id, undefined)
  })

  test("cook_ai_recipe refuses other households' recipes and outsiders", async () => {
    const [{ id }] = await t.q("select id from public.ai_recipes where title = 'Pantry Fried Rice'")
    await assertRejects(() => cookAi(casey, maple, id, [{ item_id: ids.rice, amount: 1 }]), /isn't saved|row-level|violates/)
    await assertRejects(() => cookAi(casey, caseyHome, id, [{ item_id: ids.rice, amount: 1 }]), /isn't saved/)
    assert.equal(await quantity(ids.rice), 1)
  })

  test("a Spoonacular cook still logs recipe_id and nothing AI-ish", async () => {
    await cookSpoon(alex, maple, 715538, [{ item_id: ids.rice, amount: 0.5 }])
    const [row] = await t.q("select details from public.activity_log where action = 'cooked' and actor_id = $1 order by id desc limit 1", [alex])
    assert.deepEqual(row.details, { recipe_id: 715538, recipe_title: "Chicken Tikka Masala" })
  })

  test("rating needs the caller to have cooked it", async () => {
    const [{ id }] = await t.q("select id from public.ai_recipes where title = 'Pantry Fried Rice'")
    // Blair cooked the AI recipe; Alex didn't. Alex cooked Spoonacular 715538; Blair didn't.
    await assertRejects(() => rate(alex, maple, "ai", id, 1), /once you've cooked/)
    await assertRejects(() => rate(blair, maple, "spoonacular", "715538", 1), /once you've cooked/)
    await assertRejects(() => rate(blair, maple, "spoonacular", "999", 1), /once you've cooked/)
    assert.equal(await rate(blair, maple, "ai", id, 1), 1)
    assert.equal(await rate(alex, maple, "spoonacular", "715538", -1), -1)
  })

  test("one vote per member per recipe, and it can change", async () => {
    const [{ id }] = await t.q("select id from public.ai_recipes where title = 'Pantry Fried Rice'")
    await rate(blair, maple, "ai", id, -1)
    const mine = (await ratings(blair, maple)).filter((r) => r.recipe_kind === "ai")
    assert.equal(mine.length, 1)
    assert.equal(mine[0].rating, -1)
    // Both housemates see each other's votes.
    assert.equal((await ratings(alex, maple)).length, 2)
  })

  test("invalid ratings and refs are rejected", async () => {
    await assertRejects(() => rate(alex, maple, "spoonacular", "715538", 0), /valid rating/)
    await assertRejects(() => rate(alex, maple, "spoonacular", "715538", 2), /valid rating/)
    await assertRejects(() => rate(alex, maple, "other", "1", 1), /valid rating/)
    await assertRejects(() => rate(alex, maple, "spoonacular", "abc", 1), /valid rating/)
    await assertRejects(() => rate(alex, maple, "ai", "123", 1), /valid rating/)
  })

  test("ratings: no direct writes, no cross-household reads or writes", async () => {
    await t.as(alex, () =>
      assertRejects(
        () => t.q("insert into public.recipe_ratings (household_id, user_id, recipe_kind, recipe_key, rating) values ($1, $2, 'spoonacular', '1', 1)", [maple, alex]),
        /permission denied/,
      ),
    )
    await t.as(alex, () => assertRejects(() => t.q("update public.recipe_ratings set rating = 1"), /permission denied/))
    assert.deepEqual(await ratings(casey, maple), [])
    await assertRejects(() => rate(casey, maple, "spoonacular", "715538", 1), /not in that household/)
    // Casey cooking elsewhere doesn't let them rate into Maple either.
    await assertRejects(() => rate(casey, caseyHome, "spoonacular", "715538", 1), /once you've cooked/)
  })

  test("ai_idea_cache: members write via the function, expiry is capped at an hour, others can't read", async () => {
    await t.as(alex, () => t.q("select public.put_ai_idea_cache($1, 'ideas:x', $2, 999999)", [maple, JSON.stringify({ ideas: [] })]))
    const [row] = await t.q("select expires_at <= created_at + interval '1 hour' as ok from public.ai_idea_cache where household_id = $1", [maple])
    assert.equal(row.ok, true)
    assert.equal((await t.as(blair, () => t.q("select 1 from public.ai_idea_cache where household_id = $1", [maple]))).length, 1)
    assert.equal((await t.as(casey, () => t.q("select 1 from public.ai_idea_cache where household_id = $1", [maple]))).length, 0)
    await t.as(casey, () => assertRejects(() => t.q("select public.put_ai_idea_cache($1, 'k', '{}')", [maple]), /not in that household/))
    await t.as(alex, () => assertRejects(() => t.q("insert into public.ai_idea_cache (household_id, cache_key, response, expires_at) values ($1, 'k', '{}', now())", [maple]), /permission denied/))
  })

  test("anon can't execute any of the new functions", async () => {
    const calls = [
      ["public.save_ai_recipe($1, $2)", [maple, JSON.stringify(IDEA)]],
      ["public.cook_ai_recipe($1, $2, '[]')", [maple, "00000000-0000-0000-0000-000000000000"]],
      ["public.rate_recipe($1, 'spoonacular', '1', 1::smallint)", [maple]],
      ["public.put_ai_idea_cache($1, 'k', '{}')", [maple]],
    ]
    for (const [call, params] of calls) {
      await t.as(null, () => assertRejects(() => t.q(`select ${call}`, params), /permission denied/))
    }
  })

  test("new tables broadcast household changes", async () => {
    const triggers = await t.q(
      "select event_object_table from information_schema.triggers where trigger_name = 'broadcast_changes' and event_object_table in ('ai_recipes','recipe_ratings') group by 1 order by 1",
    )
    assert.deepEqual(triggers.map((r) => r.event_object_table), ["ai_recipes", "recipe_ratings"])
  })
})
