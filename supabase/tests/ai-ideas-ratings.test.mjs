import assert from "node:assert/strict"
import { before, describe, test } from "node:test"

import { assertRejects, createTestDb } from "./harness.mjs"

const RECIPE = { title: "Pantry Fried Rice", summary: "Quick and cheap.", ready_in_minutes: 20, servings: 2, instructions: ["Cook the rice.", "Fry it with the eggs."] }
const LINES = [
  { original: "2 cups rice", name: "rice", name_key: "rice", quantity: 2, unit: "cup" },
  { original: "2 eggs", name: "eggs", name_key: "eggs", quantity: 2 },
]

describe("AI ideas, ratings and the AI idea cache", () => {
  let t, alex, blair, casey, maple, caseyHome, eggs, aiRecipe, ownRecipe

  const saveAi = (user, household, recipe = RECIPE, lines = LINES) =>
    t.as(user, async () =>
      (await t.q("select public.save_ai_recipe($1, $2, $3) as id", [household, JSON.stringify(recipe), JSON.stringify(lines)]))[0].id,
    )
  const rate = (user, household, ref, rating) =>
    t.as(user, async () => (await t.q("select public.rate_recipe($1, $2, $3::smallint) as r", [household, ref, rating]))[0].r)
  const ratings = (user, household) =>
    t.as(user, () =>
      t.q("select user_id, recipe_ref, rating from public.recipe_ratings where household_id = $1 order by recipe_ref, user_id", [household]),
    )
  const cookSpoon = (user, household, id) =>
    t.as(user, () => t.q("select * from public.cook_recipe($1, $2, 'Tikka', $3)", [household, id, JSON.stringify([{ item_id: eggs, amount: 1 }])]))
  const cookLocal = (user, household, id) =>
    t.as(user, () =>
      t.q("select * from public.cook_recipe($1, null, 'Fried Rice', $2, $3)", [household, JSON.stringify([{ item_id: eggs, amount: 1 }]), id]),
    )
  const putCache = (user, household, key, response, ttl) =>
    t.as(user, async () =>
      (await t.q("select public.put_ai_idea_cache($1, $2, $3, $4) as e", [household, key, JSON.stringify(response), ttl ?? null]))[0].e,
    )

  before(async () => {
    t = await createTestDb()
    alex = await t.createUser("a@test.dev", { full_name: "Alex" })
    blair = await t.createUser("b@test.dev", { full_name: "Blair" })
    casey = await t.createUser("c@test.dev", { full_name: "Casey" })
    maple = await t.as(alex, async () => (await t.q("select public.create_household('Maple') as id"))[0].id)
    const [{ invite_code }] = await t.q("select invite_code from public.households where id = $1", [maple])
    await t.as(blair, () => t.q("select public.join_household($1)", [invite_code]))
    caseyHome = await t.as(casey, async () => (await t.q("select public.create_household('Casey Home') as id"))[0].id)
    ;[eggs] = await t.as(alex, async () =>
      (await t.q("select * from public.add_pantry_items($1, $2)", [maple, JSON.stringify([{ name: "eggs", quantity: 12, unit: "count", category: "dairy" }])])).map(
        (r) => r.add_pantry_items,
      ),
    )
    ownRecipe = await t.as(alex, async () =>
      (await t.q("select public.save_household_recipe($1, null, $2, $3) as id", [maple, JSON.stringify({ title: "Toast" }), JSON.stringify(LINES)]))[0].id,
    )
  })

  // ── save_ai_recipe / ai_generated ──────────────────────────────────────────

  test("save_ai_recipe saves an ordinary household recipe flagged ai_generated", async () => {
    aiRecipe = await saveAi(alex, maple)
    const [row] = await t.q("select household_id, source, ai_generated, created_by, title, instructions from public.recipes where id = $1", [aiRecipe])
    assert.deepEqual(row, {
      household_id: maple,
      source: "user",
      ai_generated: true,
      created_by: alex,
      title: "Pantry Fried Rice",
      instructions: RECIPE.instructions,
    })
    const lines = await t.q("select name, position from public.recipe_ingredients where recipe_id = $1 order by position", [aiRecipe])
    assert.deepEqual(lines, [
      { name: "rice", position: 0 },
      { name: "eggs", position: 1 },
    ])
    // Housemates see it.
    const seen = await t.as(blair, () => t.q("select ai_generated from public.recipes where id = $1", [aiRecipe]))
    assert.deepEqual(seen, [{ ai_generated: true }])
    // Recipes saved the ordinary way aren't flagged.
    assert.deepEqual(await t.q("select ai_generated from public.recipes where id = $1", [ownRecipe]), [{ ai_generated: false }])
  })

  test("save_ai_recipe validates like save_household_recipe and refuses non-members", async () => {
    await assertRejects(() => saveAi(casey, maple), /not in that household/)
    await assertRejects(() => saveAi(alex, caseyHome), /not in that household/)
    await assertRejects(() => saveAi(alex, maple, RECIPE, []), /between 1 and 100/)
    await assertRejects(() => saveAi(alex, maple, { title: "" }), /check constraint/)
    await assertRejects(() => saveAi(null, maple), /permission denied/)
  })

  test("clients can't set or flip ai_generated directly", async () => {
    await assertRejects(
      () => t.as(alex, () => t.q("insert into public.recipes (household_id, title, ai_generated) values ($1, 'Fake', true)", [maple])),
      /permission denied/,
    )
    await assertRejects(
      () => t.as(alex, () => t.q("update public.recipes set ai_generated = true where id = $1", [ownRecipe])),
      /permission denied/,
    )
    await assertRejects(
      () => t.as(alex, () => t.q("update public.recipes set ai_generated = false where id = $1", [aiRecipe])),
      /permission denied/,
    )
    // Editing an AI idea the ordinary way keeps the flag.
    await t.as(alex, () =>
      t.q("select public.save_household_recipe($1, $2, $3, $4)", [maple, aiRecipe, JSON.stringify({ title: "Better Fried Rice" }), JSON.stringify(LINES)]),
    )
    assert.deepEqual(await t.q("select title, ai_generated from public.recipes where id = $1", [aiRecipe]), [
      { title: "Better Fried Rice", ai_generated: true },
    ])
  })

  // ── rate_recipe / recipe_ratings ───────────────────────────────────────────

  test("rating needs a cook first (Spoonacular ref)", async () => {
    await assertRejects(() => rate(alex, maple, "715538", 1), /once you've cooked it/)
    await cookSpoon(alex, maple, 715538)
    assert.equal(await rate(alex, maple, "715538", 1), 1)
    assert.deepEqual(await ratings(alex, maple), [{ user_id: alex, recipe_ref: "715538", rating: 1 }])
  })

  test("rating needs a cook first (local recipe ref)", async () => {
    await assertRejects(() => rate(alex, maple, aiRecipe, -1), /once you've cooked it/)
    await cookLocal(alex, maple, aiRecipe)
    assert.equal(await rate(alex, maple, aiRecipe, -1), -1)
  })

  test("a cook of one recipe doesn't unlock another", async () => {
    await assertRejects(() => rate(alex, maple, "715539", 1), /once you've cooked it/)
    await assertRejects(() => rate(alex, maple, ownRecipe, 1), /once you've cooked it/)
  })

  test("a housemate who didn't cook can't rate; once they cook, they get their own vote", async () => {
    await assertRejects(() => rate(blair, maple, "715538", 1), /once you've cooked it/)
    await cookSpoon(blair, maple, 715538)
    assert.equal(await rate(blair, maple, "715538", -1), -1)
    const key = (r) => `${r.recipe_ref}|${r.user_id}|${r.rating}`
    assert.deepEqual((await ratings(blair, maple)).map(key).sort(), [
      { user_id: alex, recipe_ref: "715538", rating: 1 },
      { user_id: blair, recipe_ref: "715538", rating: -1 },
      { user_id: alex, recipe_ref: aiRecipe, rating: -1 },
    ].map(key).sort())
  })

  test("rating again changes the vote and bumps updated_at; one row per member", async () => {
    const [before] = await t.q("select updated_at from public.recipe_ratings where user_id = $1 and recipe_ref = '715538'", [alex])
    await new Promise((r) => setTimeout(r, 5))
    assert.equal(await rate(alex, maple, "715538", -1), -1)
    const rows = await t.q("select rating, updated_at from public.recipe_ratings where user_id = $1 and recipe_ref = '715538'", [alex])
    assert.equal(rows.length, 1)
    assert.equal(rows[0].rating, -1)
    assert.ok(rows[0].updated_at > before.updated_at)
  })

  test("rate_recipe rejects bad input", async () => {
    await assertRejects(() => rate(alex, maple, "715538", 0), /valid rating/)
    await assertRejects(() => rate(alex, maple, "715538", 2), /valid rating/)
    await assertRejects(() => rate(alex, maple, "0715538", 1), /valid rating/)
    await assertRejects(() => rate(alex, maple, "1234567890", 1), /valid rating/)
    await assertRejects(() => rate(alex, maple, aiRecipe.toUpperCase(), 1), /valid rating/)
    await assertRejects(() => rate(alex, maple, "abc", 1), /valid rating/)
  })

  test("the ref shape is enforced by a CHECK too", async () => {
    await assertRejects(
      () => t.q("insert into public.recipe_ratings (household_id, user_id, recipe_ref, rating) values ($1, $2, 'nope', 1)", [maple, alex]),
      /recipe_ratings_ref_shape/,
    )
  })

  test("ratings are visible to household members only and can't be written directly", async () => {
    assert.deepEqual(await ratings(casey, maple), [])
    await assertRejects(() => rate(casey, maple, "715538", 1), /not in that household/)
    for (const sql of [
      "insert into public.recipe_ratings (household_id, user_id, recipe_ref, rating) values ($1, $2, '715538', 1)",
      "update public.recipe_ratings set rating = 1 where household_id = $1 and user_id = $2",
      "delete from public.recipe_ratings where household_id = $1 and user_id = $2",
    ]) {
      await assertRejects(() => t.as(alex, () => t.q(sql, [maple, alex])), /permission denied/)
    }
  })

  test("a cook in another household doesn't count", async () => {
    // Casey cooks 715538 at home, then joins Maple: the Casey Home cook doesn't unlock Maple.
    await t.as(casey, async () => {
      const [{ add_pantry_items: item }] = await t.q("select * from public.add_pantry_items($1, $2)", [
        caseyHome,
        JSON.stringify([{ name: "eggs", quantity: 2, unit: "count", category: "dairy" }]),
      ])
      await t.q("select * from public.cook_recipe($1, 715538, 'Tikka', $2)", [caseyHome, JSON.stringify([{ item_id: item, amount: 1 }])])
    })
    assert.equal(await rate(casey, caseyHome, "715538", 1), 1)
    assert.deepEqual(await ratings(alex, caseyHome), [])
  })

  test("ratings broadcast to the household", async () => {
    const count = async () => (await t.q("select count(*)::int as n from realtime.messages where topic = $1", [`household:${maple}`]))[0].n
    const before = await count()
    await rate(alex, maple, "715538", 1)
    assert.ok((await count()) > before)
  })

  // ── ai_idea_cache ──────────────────────────────────────────────────────────

  test("put_ai_idea_cache caps the TTL at an hour and members read it", async () => {
    const expires = await putCache(alex, maple, "ideas:v1:abc", { ideas: [1, 2] }, 999999)
    const [{ ok }] = await t.q("select $1::timestamptz <= now() + interval '1 hour' as ok", [expires])
    assert.equal(ok, true)
    const short = await putCache(alex, maple, "ideas:v1:short", { ideas: [] }, 60)
    const [{ ok: shortOk }] = await t.q("select $1::timestamptz <= now() + interval '61 seconds' as ok", [short])
    assert.equal(shortOk, true)
    const rows = await t.as(blair, () => t.q("select cache_key, response from public.ai_idea_cache where household_id = $1 order by cache_key", [maple]))
    assert.deepEqual(rows.map((r) => r.cache_key), ["ideas:v1:abc", "ideas:v1:short"])
    // Overwrites the same key.
    await putCache(alex, maple, "ideas:v1:abc", { ideas: [3] })
    const [row] = await t.q("select response from public.ai_idea_cache where household_id = $1 and cache_key = 'ideas:v1:abc'", [maple])
    assert.deepEqual(row.response, { ideas: [3] })
    // A row can't outlive an hour even when written directly.
    await assertRejects(
      () =>
        t.q("insert into public.ai_idea_cache (household_id, cache_key, response, expires_at) values ($1, 'x', '{}', now() + interval '2 hours')", [
          maple,
        ]),
      /ai_idea_cache_one_hour/,
    )
  })

  test("ai_idea_cache: other households can't read or write, nobody writes directly", async () => {
    assert.deepEqual(await t.as(casey, () => t.q("select * from public.ai_idea_cache where household_id = $1", [maple])), [])
    await assertRejects(() => putCache(casey, maple, "k", {}), /not in that household/)
    await assertRejects(
      () => t.as(alex, () => t.q("insert into public.ai_idea_cache (household_id, cache_key, response, expires_at) values ($1, 'k', '{}', now())", [maple])),
      /permission denied/,
    )
    await assertRejects(() => t.as(alex, () => t.q("delete from public.ai_idea_cache where household_id = $1", [maple])), /permission denied/)
  })

  test("ai_idea_cache rejects oversized or empty entries and clears expired rows on write", async () => {
    await assertRejects(() => putCache(alex, maple, "", {}), /Bad cache entry/)
    await assertRejects(() => putCache(alex, maple, "k".repeat(201), {}), /Bad cache entry/)
    const big = { blob: Array.from({ length: 5000 }, (_, i) => `${i}-${Math.random().toString(36)}-padding-padding-padding`) }
    await assertRejects(() => putCache(alex, maple, "big", big), /Bad cache entry/)
    await t.q("update public.ai_idea_cache set created_at = now() - interval '2 hours', expires_at = now() - interval '1 hour' where cache_key = 'ideas:v1:short'")
    await putCache(alex, maple, "ideas:v1:new", { ideas: [] })
    const keys = (await t.q("select cache_key from public.ai_idea_cache where household_id = $1 order by cache_key", [maple])).map((r) => r.cache_key)
    assert.deepEqual(keys, ["ideas:v1:abc", "ideas:v1:new"])
  })

  // ── Grants ─────────────────────────────────────────────────────────────────

  test("anon can't execute the new functions or read the new tables", async () => {
    await assertRejects(() => t.as(null, () => t.q("select public.save_ai_recipe($1, '{}', '[]')", [maple])), /permission denied/)
    await assertRejects(() => t.as(null, () => t.q("select public.rate_recipe($1, '715538', 1::smallint)", [maple])), /permission denied/)
    await assertRejects(() => t.as(null, () => t.q("select public.put_ai_idea_cache($1, 'k', '{}')", [maple])), /permission denied/)
    await assertRejects(() => t.as(null, () => t.q("select * from public.recipe_ratings")), /permission denied/)
    await assertRejects(() => t.as(null, () => t.q("select * from public.ai_idea_cache")), /permission denied/)
  })

  test("deleting a household takes its ratings and cache", async () => {
    await t.q("delete from public.households where id = $1", [maple])
    assert.deepEqual(await t.q("select * from public.recipe_ratings where household_id = $1", [maple]), [])
    assert.deepEqual(await t.q("select * from public.ai_idea_cache where household_id = $1", [maple]), [])
  })
})
