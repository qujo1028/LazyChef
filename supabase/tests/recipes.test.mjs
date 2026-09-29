import assert from "node:assert/strict"
import { before, describe, test } from "node:test"

import { assertRejects, createTestDb } from "./harness.mjs"

describe("spoonacular cache and usage (server only)", () => {
  let t, alex, maple

  /** Run fn with the server's secret key (service_role). */
  async function asServer(fn) {
    await t.db.exec("set role service_role")
    try {
      return await fn()
    } finally {
      await t.db.exec("reset role")
    }
  }

  const put = (key, response, ttl) =>
    asServer(async () =>
      (await t.q("select public.put_spoonacular_cache($1, $2, $3) as expires", [key, JSON.stringify(response), ttl ?? null]))[0].expires,
    )
  const record = (used, left, estimate = null, exhausted = false) =>
    asServer(async () =>
      (
        await t.q(
          "select points_used::float8 as used, points_left::float8 as left, exhausted from public.record_spoonacular_usage($1, $2, $3, $4)",
          [used, left, estimate, exhausted],
        )
      )[0],
    )
  const keys = () => t.q("select cache_key from public.spoonacular_cache order by cache_key").then((rows) => rows.map((r) => r.cache_key))

  before(async () => {
    t = await createTestDb()
    alex = await t.createUser("a@test.dev", { full_name: "Alex" })
    maple = await t.as(alex, async () => (await t.q("select public.create_household('Maple') as id"))[0].id)
    assert.ok(maple)
  })

  test("the server writes and reads one cache shared by every household", async () => {
    await put("find:abc", [{ id: 1, title: "Soup" }])
    const rows = await asServer(() => t.q("select cache_key, response from public.spoonacular_cache"))
    assert.deepEqual(rows, [{ cache_key: "find:abc", response: [{ id: 1, title: "Soup" }] }])
    await put("find:abc", [{ id: 2, title: "Stew" }])
    const [row] = await asServer(() => t.q("select response from public.spoonacular_cache where cache_key = 'find:abc'"))
    assert.deepEqual(row.response, [{ id: 2, title: "Stew" }])
  })

  test("signed-in people and anon can't read, write or call anything", async () => {
    for (const user of [alex, null]) {
      await t.as(user, async () => {
        await assertRejects(() => t.q("select * from public.spoonacular_cache"), /permission denied/)
        await assertRejects(() => t.q("select * from public.spoonacular_usage"), /permission denied/)
        await assertRejects(
          () => t.q("insert into public.spoonacular_cache (cache_key, response) values ('x', '{}')"),
          /permission denied/,
        )
        await assertRejects(() => t.q("select public.put_spoonacular_cache('x', '{}'::jsonb)"), /permission denied/)
        await assertRejects(() => t.q("select public.purge_spoonacular_cache()"), /permission denied/)
        await assertRejects(() => t.q("select * from public.record_spoonacular_usage(1, 49)"), /permission denied/)
      })
    }
  })

  test("entries last at most an hour, whatever the caller asks for", async () => {
    const [{ now }] = await t.q("select now() as now")
    const long = new Date(await put("info:1", { id: 1 }, 999999))
    assert.ok(long - new Date(now) <= 3600_000 + 1000)
    const short = new Date(await put("info:2", { id: 2 }, 60))
    assert.ok(short - new Date(now) <= 61_000)
    // Even the table owner can't store something for longer.
    await assertRejects(
      () =>
        t.q("insert into public.spoonacular_cache (cache_key, response, expires_at) values ('long', '{}', now() + interval '2 hours')"),
      /spoonacular_cache_one_hour/,
    )
  })

  test("expired entries are purged on the next write, or on demand", async () => {
    await t.q("update public.spoonacular_cache set created_at = now() - interval '2 hours', expires_at = now() - interval '1 hour' where cache_key = 'info:1'")
    await put("info:3", { id: 3 })
    assert.ok(!(await keys()).includes("info:1"))
    assert.ok((await keys()).includes("info:3"))

    await t.q("update public.spoonacular_cache set created_at = now() - interval '2 hours', expires_at = now() - interval '1 hour' where cache_key = 'info:2'")
    const [{ purged }] = await asServer(() => t.q("select public.purge_spoonacular_cache() as purged"))
    assert.equal(purged, 1)
    assert.ok(!(await keys()).includes("info:2"))
  })

  test("usage keeps the highest used and lowest left for the UTC day, whatever order requests finish in", async () => {
    await record(3.5, 46.5)
    const row = await record(2, 48)
    assert.deepEqual(row, { used: 3.5, left: 46.5, exhausted: false })
    const [{ requests }] = await t.q("select requests from public.spoonacular_usage")
    assert.equal(requests, 2)
  })

  test("without quota headers, the estimated cost is added", async () => {
    const row = await record(null, null, 1.4)
    assert.equal(row.used, 4.9)
    assert.ok(Math.abs(row.left - 45.1) < 1e-9)
  })

  test("a 402 marks the day as used up", async () => {
    const row = await record(null, null, null, true)
    assert.equal(row.left, 0)
    assert.equal(row.exhausted, true)
    // Later headers can't bring points back for the day.
    assert.equal((await record(10, 40)).left, 0)
  })

  test("old usage rows are purged after 30 days", async () => {
    await t.q("insert into public.spoonacular_usage (day, points_used) values ((now() at time zone 'utc')::date - 31, 50)")
    await asServer(() => t.q("select public.purge_spoonacular_cache()"))
    const days = await t.q("select day from public.spoonacular_usage")
    assert.equal(days.length, 1)
  })

  test("usage rejects nonsense", async () => {
    await asServer(() => assertRejects(() => t.q("select * from public.record_spoonacular_usage(-1, 10)"), /don't look right/))
    await asServer(() => assertRejects(() => t.q("select * from public.record_spoonacular_usage(null, null, 5000)"), /don't look right/))
  })
})
