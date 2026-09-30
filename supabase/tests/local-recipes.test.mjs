import assert from "node:assert/strict"
import { before, describe, test } from "node:test"

import { assertRejects, createTestDb } from "./harness.mjs"

describe("local recipes", () => {
  let t, alex, blair, casey, maple, caseyHome, omelette, curry, shakshuka, pancakes

  /** What the importer does with the secret key: upsert on (source, source_id). */
  const importMeal = async (sourceId, title, ingredients, extra = {}) => {
    const [{ id }] = await t.q(
      `insert into public.recipes (source, source_id, title, meal_types, ready_in_minutes, instructions, image_url, source_url)
       values ('themealdb', $1, $2, $3, $4, $5, $6, $7)
       on conflict (source, source_id) do update set title = excluded.title, meal_types = excluded.meal_types
       returning id`,
      [
        sourceId,
        title,
        extra.meal_types ?? ["main course"],
        extra.ready_in_minutes ?? null,
        ["Cook it."],
        `https://www.themealdb.com/images/media/meals/${sourceId}.jpg`,
        null,
      ],
    )
    await t.q("delete from public.recipe_ingredients where recipe_id = $1", [id])
    for (const [i, line] of ingredients.entries()) {
      await t.q(
        `insert into public.recipe_ingredients (recipe_id, position, original, name, name_key, ingredient_id, optional)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [id, i, line.original ?? line.name, line.name, line.key ?? line.name, line.id ?? null, line.optional ?? false],
      )
    }
    return id
  }

  const saveOwn = (user, household, recipe, ingredients, recipeId = null) =>
    t.as(user, async () => {
      const [row] = await t.q("select public.save_household_recipe($1, $2, $3, $4) as id", [
        household,
        recipeId,
        JSON.stringify(recipe),
        JSON.stringify(ingredients),
      ])
      return row.id
    })

  const match = (user, household, { ids = [], keys = [], ignoreKeys = ["salt", "water"], type = null, time = null, q = null, missing = 3 } = {}) =>
    t.as(user, () =>
      t.q("select * from public.match_local_recipes($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)", [
        household,
        ids,
        keys,
        [],
        ignoreKeys,
        type,
        time,
        q,
        missing,
        200,
      ]),
    )

  const visibleTitles = (user) =>
    t.as(user, async () => (await t.q("select title from public.recipes order by title")).map((r) => r.title))

  before(async () => {
    t = await createTestDb()
    alex = await t.createUser("a@test.dev", { full_name: "Alex" })
    blair = await t.createUser("b@test.dev", { full_name: "Blair" })
    casey = await t.createUser("c@test.dev", { full_name: "Casey" })
    maple = await t.as(alex, async () => (await t.q("select public.create_household('Maple') as id"))[0].id)
    const [{ invite_code }] = await t.q("select invite_code from public.households where id = $1", [maple])
    await t.as(blair, () => t.q("select public.join_household($1)", [invite_code]))
    caseyHome = await t.as(casey, async () => (await t.q("select public.create_household('Casey Home') as id"))[0].id)

    omelette = await importMeal(
      "52001",
      "Cheese Omelette",
      [
        { name: "eggs", id: 1123 },
        { name: "cheddar cheese", id: 1041 },
        { name: "salt" },
        { name: "chives", optional: true },
      ],
      { meal_types: ["breakfast"], ready_in_minutes: 10 },
    )
    curry = await importMeal("52002", "Chicken Curry", [
      { name: "chicken breast", id: 5062 },
      { name: "onion", id: 11282 },
      { name: "garlic", id: 11215 },
      { name: "coconut milk", id: 12118 },
      { name: "rice", id: 20444 },
    ])
    shakshuka = await importMeal("52003", "Shakshuka", [
      { name: "eggs", id: 1123 },
      { name: "tomatoes", key: "tomato", id: 11529 },
      { name: "onion", id: 11282 },
      { name: "cumin" },
      { name: "feta" },
      { name: "bell pepper" },
    ])
  })

  test("the importer's upsert never duplicates a recipe", async () => {
    await importMeal("52001", "Cheese Omelette (updated)", [{ name: "eggs", id: 1123 }, { name: "cheddar cheese", id: 1041 }])
    const rows = await t.q("select id, title from public.recipes where source = 'themealdb' and source_id = '52001'")
    assert.equal(rows.length, 1)
    assert.equal(rows[0].id, omelette)
    await importMeal("52001", "Cheese Omelette", [
      { name: "eggs", id: 1123 },
      { name: "cheddar cheese", id: 1041 },
      { name: "salt" },
      { name: "chives", optional: true },
    ], { meal_types: ["breakfast"] })
  })

  test("everyone signed in reads the shared library; signed-out requests see nothing", async () => {
    assert.deepEqual(await visibleTitles(casey), ["Cheese Omelette", "Chicken Curry", "Shakshuka"])
    const lines = await t.as(casey, () => t.q("select name, household_id from public.recipe_ingredients where recipe_id = $1 order by position", [curry]))
    assert.equal(lines.length, 5)
    assert.ok(lines.every((line) => line.household_id === null))
    await t.as(null, () => assertRejects(() => t.q("select * from public.recipes"), /permission denied/))
    await t.as(null, () => assertRejects(() => t.q("select * from public.recipe_ingredients"), /permission denied/))
  })

  test("clients can't add to, change or delete the shared library", async () => {
    await t.as(alex, () =>
      assertRejects(() => t.q("insert into public.recipes (title) values ('Mine now')"), /row-level security|check constraint/),
    )
    await t.as(alex, () =>
      assertRejects(
        () => t.q("insert into public.recipes (source, source_id, title) values ('themealdb', '999', 'Fake')"),
        /permission denied/,
      ),
    )
    await t.as(alex, () => t.q("update public.recipes set title = 'Hacked' where id = $1", [curry]))
    await t.as(alex, () => t.q("delete from public.recipes where id = $1", [curry]))
    await t.as(alex, () => t.q("delete from public.recipe_ingredients where recipe_id = $1", [curry]))
    await t.as(alex, () =>
      assertRejects(
        () => t.q("insert into public.recipe_ingredients (recipe_id, position, original, name, name_key) values ($1, 50, 'x', 'x', 'x')", [curry]),
        /row-level security/,
      ),
    )
    const [row] = await t.q("select title, (select count(*)::int from public.recipe_ingredients where recipe_id = $1) as lines from public.recipes where id = $1", [curry])
    assert.deepEqual(row, { title: "Chicken Curry", lines: 5 })
  })

  test("members add household recipes in one call, stamped with who made them", async () => {
    pancakes = await saveOwn(
      alex,
      maple,
      { title: "  Grandma's Pancakes ", meal_types: ["breakfast"], ready_in_minutes: 20, servings: 4, instructions: ["Mix.", " Fry. "] },
      [
        { original: "2 cups flour", name: "flour", name_key: "flour", quantity: 2, unit: "cup", ingredient_id: 20081 },
        { original: "2 eggs", name: "eggs", name_key: "egg", quantity: 2, unit: null, ingredient_id: 1123 },
        { original: "1 cup milk", name: "milk", name_key: "milk", quantity: 1, unit: "cup", ingredient_id: 1077 },
      ],
    )
    const [recipe] = await t.as(blair, () =>
      t.q("select title, source, household_id, created_by, servings, instructions, meal_types from public.recipes where id = $1", [pancakes]),
    )
    assert.deepEqual(recipe, {
      title: "Grandma's Pancakes",
      source: "user",
      household_id: maple,
      created_by: alex,
      servings: 4,
      instructions: ["Mix.", "Fry."],
      meal_types: ["breakfast"],
    })
    const lines = await t.as(blair, () =>
      t.q("select position, name, quantity::float8 as quantity, household_id from public.recipe_ingredients where recipe_id = $1 order by position", [pancakes]),
    )
    assert.deepEqual(
      lines.map((l) => [l.position, l.name, l.quantity, l.household_id]),
      [
        [0, "flour", 2, maple],
        [1, "eggs", 2, maple],
        [2, "milk", 1, maple],
      ],
    )
  })

  test("editing replaces the ingredient lines, keeps who made it, and housemates can edit too", async () => {
    await saveOwn(
      blair,
      maple,
      { title: "Grandma's Pancakes", meal_types: ["breakfast"], ready_in_minutes: 25, instructions: ["Mix.", "Rest.", "Fry."] },
      [
        { original: "2 cups flour", name: "flour", name_key: "flour", quantity: 2, unit: "cup" },
        { original: "1 cup buttermilk", name: "buttermilk", name_key: "buttermilk", quantity: 1, unit: "cup" },
      ],
      pancakes,
    )
    const [recipe] = await t.q("select created_by, ready_in_minutes, instructions from public.recipes where id = $1", [pancakes])
    assert.deepEqual(recipe, { created_by: alex, ready_in_minutes: 25, instructions: ["Mix.", "Rest.", "Fry."] })
    const names = await t.q("select name from public.recipe_ingredients where recipe_id = $1 order by position", [pancakes])
    assert.deepEqual(names.map((r) => r.name), ["flour", "buttermilk"])
  })

  test("other households can't see, edit or delete a household's recipes", async () => {
    assert.ok(!(await visibleTitles(casey)).includes("Grandma's Pancakes"))
    assert.ok((await visibleTitles(blair)).includes("Grandma's Pancakes"))
    await assertRejects(
      () => saveOwn(casey, maple, { title: "Nope" }, [{ original: "x", name: "x", name_key: "x" }]),
      /not in that household/,
    )
    await assertRejects(
      () => saveOwn(casey, caseyHome, { title: "Stolen" }, [{ original: "x", name: "x", name_key: "x" }], pancakes),
      /deleted, or isn't your household's/,
    )
    await t.as(casey, () => t.q("update public.recipes set title = 'Hacked' where id = $1", [pancakes]))
    await t.as(casey, () => t.q("delete from public.recipes where id = $1", [pancakes]))
    await t.as(casey, () =>
      assertRejects(
        () => t.q("insert into public.recipe_ingredients (recipe_id, position, original, name, name_key) values ($1, 60, 'x', 'x', 'x')", [pancakes]),
        /row-level security/,
      ),
    )
    const [row] = await t.q("select title from public.recipes where id = $1", [pancakes])
    assert.equal(row.title, "Grandma's Pancakes")
  })

  test("created_by, source and the household can't be forged or moved", async () => {
    await t.as(alex, () =>
      assertRejects(
        () => t.q("insert into public.recipes (household_id, title, created_by) values ($1, 'x', $2)", [maple, blair]),
        /permission denied/,
      ),
    )
    await t.as(alex, () =>
      assertRejects(() => t.q("update public.recipes set household_id = $1 where id = $2", [caseyHome, pancakes]), /permission denied/),
    )
    await t.as(alex, () =>
      assertRejects(() => t.q("update public.recipes set source = 'themealdb' where id = $1", [pancakes]), /permission denied/),
    )
    // A photo has to live in the household's own folder.
    await t.as(alex, () =>
      assertRejects(
        () => t.q("update public.recipes set photo_path = $1 where id = $2", [`${caseyHome}/x.webp`, pancakes]),
        /check constraint/,
      ),
    )
  })

  test("bad input is turned away", async () => {
    const line = [{ original: "x", name: "x", name_key: "x" }]
    await assertRejects(() => saveOwn(alex, maple, { title: " " }, line), /check constraint/)
    await assertRejects(() => saveOwn(alex, maple, { title: "x", meal_types: ["brunch"] }, line), /check constraint/)
    await assertRejects(() => saveOwn(alex, maple, { title: "x", servings: 0 }, line), /check constraint/)
    await assertRejects(() => saveOwn(alex, maple, { title: "x", instructions: [""] }, line), /check constraint/)
    await assertRejects(() => saveOwn(alex, maple, { title: "x" }, []), /between 1 and 100/)
    await assertRejects(() => saveOwn(alex, maple, { title: "x", source_url: "javascript:alert(1)" }, line), /check constraint/)
    await t.as(null, () =>
      assertRejects(
        () => t.q("select public.save_household_recipe($1, null, '{}', '[]')", [maple]),
        /permission denied/,
      ),
    )
  })

  test("matching counts what the pantry covers, skipping basics and optional lines", async () => {
    // Pantry: eggs, cheddar (by id), onion and tomato (by name).
    const rows = await match(alex, maple, { ids: [1123, 1041], keys: ["onion", "tomato"] })
    const byId = new Map(rows.map((r) => [r.recipe_id, [r.have_count, r.missing_count]]))
    assert.deepEqual(byId.get(omelette), [2, 0], "salt and optional chives don't count")
    assert.deepEqual(byId.get(shakshuka), [3, 3])
    assert.equal(byId.has(pancakes), false, "uses nothing from the pantry")
    assert.equal(byId.has(curry), false, "4 missing is more than 3")
    // Fewest missing first.
    assert.equal(rows[0].recipe_id, omelette)
  })

  test("the household's own recipes are matched too, other households' never", async () => {
    const mine = await match(alex, maple, { keys: ["flour"] })
    assert.deepEqual(
      mine.filter((r) => r.recipe_id === pancakes).map((r) => [r.have_count, r.missing_count]),
      [[1, 1]],
    )
    const theirs = await match(casey, caseyHome, { keys: ["flour"] })
    assert.equal(theirs.some((r) => r.recipe_id === pancakes), false)
    // Asking for someone else's household id doesn't help: RLS hides the rows.
    const sneaky = await match(casey, maple, { keys: ["flour"] })
    assert.equal(sneaky.some((r) => r.recipe_id === pancakes), false)
  })

  test("meal type, time and title search filter the matches", async () => {
    const breakfast = await match(alex, maple, { ids: [1123], keys: ["flour", "onion"], type: "breakfast" })
    assert.deepEqual(new Set(breakfast.map((r) => r.recipe_id)), new Set([omelette, pancakes]))
    const quick = await match(alex, maple, { ids: [1123], keys: ["onion"], time: 15 })
    assert.deepEqual(quick.map((r) => r.recipe_id), [omelette])
    // A search shows matching titles however much is missing, even with an empty pantry.
    const search = await match(alex, maple, { q: "chicken  CURRY", missing: 100 })
    assert.deepEqual(search.map((r) => [r.recipe_id, r.have_count, r.missing_count]), [[curry, 0, 5]])
    const wildcard = await match(alex, maple, { q: "%", missing: 100 })
    assert.deepEqual(wildcard, [])
  })

  test("recipe photos: members only, in their household's folder", async () => {
    const [bucket] = await t.q("select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'recipe-photos'")
    assert.deepEqual(bucket, { public: false, file_size_limit: 5242880, allowed_mime_types: ["image/jpeg", "image/png", "image/webp"] })

    const put = (user, name) =>
      t.as(user, () => t.q("insert into storage.objects (bucket_id, name) values ('recipe-photos', $1)", [name]))
    const see = (user) =>
      t.as(user, async () => (await t.q("select name from storage.objects where bucket_id = 'recipe-photos' order by name")).map((r) => r.name))

    await put(alex, `${maple}/pancakes.webp`)
    assert.deepEqual(await see(blair), [`${maple}/pancakes.webp`])
    assert.deepEqual(await see(casey), [])
    await assertRejects(() => put(casey, `${maple}/sneaky.webp`), /row-level security/)
    await assertRejects(() => put(alex, `${maple}/nested/x.webp`), /row-level security/)
    await assertRejects(() => put(alex, "not-a-household/x.webp"), /row-level security/)
    await t.as(casey, () => t.q("delete from storage.objects where bucket_id = 'recipe-photos'"))
    assert.deepEqual(await see(alex), [`${maple}/pancakes.webp`])
    await t.as(null, () => assertRejects(() => t.q("select * from storage.objects"), /permission denied/))
  })

  test("saving: shared and own local recipes, Spoonacular ids with their image, never someone else's", async () => {
    const save = (user, household, row) =>
      t.as(user, () =>
        t.q(
          "insert into public.saved_recipes (household_id, recipe_id, local_recipe_id, title, image_url) values ($1, $2, $3, $4, $5)",
          [household, row.recipe_id ?? null, row.local_recipe_id ?? null, row.title, row.image_url ?? null],
        ),
      )
    await save(alex, maple, { local_recipe_id: curry, title: "Chicken Curry" })
    await save(alex, maple, { local_recipe_id: pancakes, title: "Grandma's Pancakes" })
    await save(blair, maple, { recipe_id: 715538, title: "Tikka", image_url: "https://img.spoonacular.com/recipes/715538-312x231.jpg" })
    await assertRejects(() => save(alex, maple, { local_recipe_id: curry, title: "Again" }), /duplicate key/)
    await assertRejects(() => save(casey, caseyHome, { local_recipe_id: pancakes, title: "Stolen" }), /row-level security/)
    await assertRejects(() => save(alex, maple, { title: "Neither" }), /check constraint/)
    await assertRejects(() => save(alex, maple, { recipe_id: 1, local_recipe_id: omelette, title: "Both" }), /check constraint/)
    await assertRejects(
      () => save(alex, maple, { recipe_id: 2, title: "Elsewhere", image_url: "https://evil.example/x.jpg" }),
      /check constraint/,
    )
    const rows = await t.as(blair, () =>
      t.q("select recipe_id, local_recipe_id, title from public.saved_recipes where household_id = $1 order by title", [maple]),
    )
    assert.deepEqual(rows.map((r) => r.title), ["Chicken Curry", "Grandma's Pancakes", "Tikka"])
    // The old upsert still works.
    await t.as(alex, () =>
      t.q(
        "insert into public.saved_recipes (household_id, recipe_id, title) values ($1, 715538, 'Tikka') on conflict (household_id, recipe_id) do nothing",
        [maple],
      ),
    )
  })

  test("cooking a local recipe logs its id", async () => {
    const [eggs] = await t.as(alex, async () =>
      (await t.q("select * from public.add_pantry_items($1, $2)", [maple, JSON.stringify([{ name: "eggs", quantity: 6, unit: "count", category: "dairy" }])])).map(
        (r) => r.add_pantry_items,
      ),
    )
    await t.as(alex, () =>
      t.q("select * from public.cook_recipe($1, null, 'Cheese Omelette', $2, $3)", [maple, JSON.stringify([{ item_id: eggs, amount: 2 }]), omelette]),
    )
    const [last] = await t.q("select action, details from public.activity_log where household_id = $1 order by id desc limit 1", [maple])
    assert.deepEqual(last, { action: "cooked", details: { local_recipe_id: omelette, recipe_title: "Cheese Omelette" } })
    // The old four-argument call still works.
    await t.as(alex, () =>
      t.q("select * from public.cook_recipe($1, 715538, 'Tikka', $2)", [maple, JSON.stringify([{ item_id: eggs, amount: 1 }])]),
    )
    const [spoon] = await t.q("select details from public.activity_log where household_id = $1 order by id desc limit 1", [maple])
    assert.deepEqual(spoon.details, { recipe_id: 715538, recipe_title: "Tikka" })
  })

  test("household recipes broadcast to the household; the shared library doesn't", async () => {
    const count = async (topic) => (await t.q("select count(*)::int as n from realtime.messages where topic = $1", [topic]))[0].n
    const before = await count(`household:${maple}`)
    await saveOwn(alex, maple, { title: "Toast" }, [{ original: "2 slices bread", name: "bread", name_key: "bread" }])
    assert.ok((await count(`household:${maple}`)) > before)
    const [{ n }] = await t.q("select count(*)::int as n from realtime.messages where topic is null or topic = 'household:'")
    assert.equal(n, 0)
  })

  test("deleting a recipe takes its lines and saves with it; deleting a household takes its recipes", async () => {
    const toast = (await t.q("select id from public.recipes where title = 'Toast'"))[0].id
    await t.as(blair, () => t.q("delete from public.recipes where id = $1", [toast]))
    assert.deepEqual(await t.q("select * from public.recipe_ingredients where recipe_id = $1", [toast]), [])
    await t.q("delete from public.households where id = $1", [maple])
    assert.deepEqual(await t.q("select * from public.recipes where household_id = $1", [maple]), [])
    assert.equal((await t.q("select count(*)::int as n from public.recipes where household_id is null"))[0].n, 3)
  })
})
