import assert from "node:assert/strict"
import { before, describe, test } from "node:test"

import { assertRejects, createTestDb } from "./harness.mjs"

describe("weekly goal", () => {
  let t, alex, blair

  const setGoal = (goal) => t.q("select public.set_my_weekly_goal($1) as goal", [goal])
  const mine = () => t.q("select weekly_goal, diet, allergies from public.user_preferences")

  before(async () => {
    t = await createTestDb()
    alex = await t.createUser("a@test.dev", { full_name: "Alex" })
    blair = await t.createUser("b@test.dev", { full_name: "Blair" })
  })

  test("setting a goal creates the row with default food preferences", async () => {
    const [{ goal }] = await t.as(alex, () => setGoal(5))
    assert.equal(goal, 5)
    assert.deepEqual(await t.as(alex, mine), [{ weekly_goal: 5, diet: "none", allergies: [] }])
  })

  test("saving food preferences keeps the goal, and the goal keeps the preferences", async () => {
    await t.as(alex, () => t.q("select public.set_my_preferences('vegan', array['soy'], '{}', false)"))
    assert.deepEqual(await t.as(alex, mine), [{ weekly_goal: 5, diet: "vegan", allergies: ["soy"] }])
    await t.as(alex, () => setGoal(2))
    assert.deepEqual(await t.as(alex, mine), [{ weekly_goal: 2, diet: "vegan", allergies: ["soy"] }])
  })

  test("a new preferences row starts at 3 nights", async () => {
    await t.as(blair, () => t.q("select public.set_my_preferences('none', '{}', '{}', false)"))
    assert.equal((await t.as(blair, mine))[0].weekly_goal, 3)
  })

  test("you only see and change your own goal", async () => {
    await t.as(blair, () => setGoal(7))
    assert.equal((await t.as(alex, mine))[0].weekly_goal, 2)
    await assertRejects(
      () => t.as(alex, () => t.q("update public.user_preferences set weekly_goal = 1")),
      /permission denied/,
    )
  })

  test("goals outside 1 to 7 are refused", async () => {
    await assertRejects(() => t.as(alex, () => setGoal(0)), /from 1 to 7/)
    await assertRejects(() => t.as(alex, () => setGoal(8)), /from 1 to 7/)
    await assertRejects(() => t.as(alex, () => setGoal(null)), /from 1 to 7/)
  })

  test("signed-out callers can't set a goal", async () => {
    await assertRejects(() => t.as(null, () => setGoal(3)), /permission denied/)
  })
})
