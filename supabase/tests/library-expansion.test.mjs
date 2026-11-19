import assert from "node:assert/strict"
import { before, describe, test } from "node:test"

import { assertRejects, createTestDb } from "./harness.mjs"

describe("LazyChef library recipes", () => {
  let t, alex, maple

  const asServer = async (fn) => {
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
    maple = await t.as(alex, async () => (await t.q("select public.create_household('Maple') as id"))[0].id)
  })

  test("the server can add a lazychef recipe with photo credits, and re-running updates it", async () => {
    const insert = () =>
      asServer(() =>
        t.q(
          `insert into public.recipes (source, source_id, title, meal_types, image_url, image_author, image_license,
             image_license_url, image_source_url)
           values ('lazychef', 'us-baked-mac-and-cheese', 'Baked Mac and Cheese', '{main course}',
             'https://x.supabase.co/storage/v1/object/public/library-photos/us-baked-mac-and-cheese.jpg', 'Jane Doe',
             'CC BY-SA 4.0', 'https://creativecommons.org/licenses/by-sa/4.0/',
             'https://commons.wikimedia.org/wiki/File:Mac.jpg')
           on conflict (source, source_id) do update set title = excluded.title
           returning id, image_ai_generated, household_id`,
        ),
      )
    const [first] = await insert()
    const [again] = await insert()
    assert.equal(again.id, first.id)
    assert.equal(first.image_ai_generated, false)
    assert.equal(first.household_id, null)
    const seen = await t.as(alex, () => t.q("select title from public.recipes where source = 'lazychef'"))
    assert.deepEqual(seen, [{ title: "Baked Mac and Cheese" }])
  })

  test("a lazychef recipe needs a source id and no household", async () => {
    await asServer(() =>
      assertRejects(
        () => t.q("insert into public.recipes (source, title) values ('lazychef', 'No slug')"),
        /recipes_source_owner/,
      ),
    )
    await asServer(() =>
      assertRejects(
        () =>
          t.q("insert into public.recipes (source, source_id, household_id, title) values ('lazychef', 'cn-x', $1, 'X')", [
            maple,
          ]),
        /recipes_source_owner/,
      ),
    )
  })

  test("credit columns are length and https checked", async () => {
    await asServer(() =>
      assertRejects(
        () =>
          t.q(
            "insert into public.recipes (source, source_id, title, image_source_url) values ('lazychef', 'us-y', 'Y', 'http://a.b')",
          ),
        /image_source_url/,
      ),
    )
    await asServer(() =>
      assertRejects(
        () =>
          t.q("insert into public.recipes (source, source_id, title, image_author) values ('lazychef', 'us-z', 'Z', $1)", [
            "x".repeat(201),
          ]),
        /image_author/,
      ),
    )
  })

  test("signed-in users can't add or turn a recipe into a lazychef one", async () => {
    await t.as(alex, () =>
      assertRejects(
        () => t.q("insert into public.recipes (source, source_id, title) values ('lazychef', 'us-mine', 'Mine')"),
        /permission denied|row-level security/,
      ),
    )
    await t.as(alex, () =>
      assertRejects(
        () =>
          t.q("insert into public.recipes (household_id, source, source_id, title) values ($1, 'lazychef', 'us-m', 'M')", [
            maple,
          ]),
        /permission denied|row-level security|recipes_source_owner/,
      ),
    )
    const [own] = await t.as(alex, () =>
      t.q("select public.save_household_recipe($1, null, $2, $3) as id", [
        maple,
        JSON.stringify({ title: "Our Stew" }),
        JSON.stringify([{ original: "garlic", name: "garlic", name_key: "garlic" }]),
      ]),
    )
    await t.as(alex, () =>
      assertRejects(
        () => t.q("update public.recipes set source = 'lazychef', source_id = 'us-ours', household_id = null where id = $1", [own.id]),
        /permission denied|row-level security|recipes_source_owner/,
      ),
    )
    const library = await t.as(alex, () => t.q("select id from public.recipes where source = 'lazychef'"))
    await t.as(alex, async () => {
      try {
        assert.deepEqual(await t.q("update public.recipes set title = 'Hacked' where id = $1 returning id", [library[0].id]), [])
      } catch (error) {
        assert.match(error.message, /permission denied/)
      }
    })
    assert.equal((await t.q("select title from public.recipes where id = $1", [library[0].id]))[0].title, "Baked Mac and Cheese")
  })

  test("library-photos is public and only the secret key writes it", async () => {
    const [bucket] = await t.q("select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'library-photos'")
    assert.equal(bucket.public, true)
    assert.equal(Number(bucket.file_size_limit), 2097152)
    assert.deepEqual(bucket.allowed_mime_types, ["image/jpeg", "image/webp"])
    await t.as(alex, () =>
      assertRejects(
        () => t.q("insert into storage.objects (bucket_id, name) values ('library-photos', 'us-x.jpg')"),
        /row-level security/,
      ),
    )
    await t.as(null, () =>
      assertRejects(
        () => t.q("insert into storage.objects (bucket_id, name) values ('library-photos', 'us-x.jpg')"),
        /permission denied|row-level security/,
      ),
    )
  })
})
