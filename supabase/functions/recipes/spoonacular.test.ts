import { describe, expect, it, vi } from "vitest"

import { createSpoonacular, readQuota, SpoonacularError } from "./spoonacular.ts"

const KEY = "test-key-123"

function reply(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "X-API-Quota-Request": "1.4", "X-API-Quota-Used": "11.4", "X-API-Quota-Left": "38.6", ...headers },
  })
}

function setup(responses: (() => Response | Promise<Response>)[], now = () => Date.UTC(2026, 10, 18, 15)) {
  const calls: { url: URL; init: RequestInit | undefined }[] = []
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: new URL(String(url)), init })
    const next = responses.shift()
    if (!next) throw new Error("no more responses")
    return next()
  })
  return { client: createSpoonacular(KEY, { fetch: fetchImpl as typeof fetch, now }), calls, fetchImpl }
}

describe("Spoonacular client", () => {
  it("sends the key in a header only, never in the URL", async () => {
    const { client, calls } = setup([() => reply([{ id: 1, title: "Omelette", usedIngredients: [], missedIngredients: [] }])])
    const { recipes, quota } = await client.findByIngredients(["eggs", "milk"])
    expect(recipes).toHaveLength(1)
    expect(quota).toEqual({ request: 1.4, used: 11.4, left: 38.6 })
    const [{ url, init }] = calls
    expect(url.pathname).toBe("/recipes/findByIngredients")
    expect(url.searchParams.get("ingredients")).toBe("eggs,milk")
    expect(url.searchParams.get("number")).toBe("40")
    expect(url.toString()).not.toContain(KEY)
    expect((init?.headers as Record<string, string>)["x-api-key"]).toBe(KEY)
  })

  it("searches with filters through complexSearch", async () => {
    const { client, calls } = setup([() => reply({ results: [{ id: 2, title: "Curry", readyInMinutes: 25 }] })])
    const { recipes } = await client.search({ names: ["chicken"], type: "main course", maxTime: 30, query: "curry" })
    expect(recipes[0]).toMatchObject({ id: 2, readyInMinutes: 25 })
    const { searchParams } = calls[0].url
    expect(Object.fromEntries(searchParams)).toMatchObject({
      includeIngredients: "chicken",
      type: "main course",
      maxReadyTime: "30",
      query: "curry",
      number: "20",
      fillIngredients: "true",
      addRecipeInformation: "true",
      sort: "min-missing-ingredients",
    })
  })

  it("bulk-loads recipe details", async () => {
    const { client, calls } = setup([() => reply([{ id: 5, title: "Soup", extendedIngredients: [{ name: "Leek", original: "1 leek" }] }])])
    const { recipes } = await client.informationBulk([5, 6])
    expect(calls[0].url.searchParams.get("ids")).toBe("5,6")
    expect(recipes[0].ingredients[0]).toMatchObject({ name: "leek", original: "1 leek" })
  })

  it("stops calling after a 402 until midnight UTC", async () => {
    let clock = Date.UTC(2026, 10, 18, 23, 59)
    const { client, fetchImpl } = setup(
      [() => reply({ message: "quota" }, 402, { "X-API-Quota-Left": "0" }), () => reply([])],
      () => clock,
    )
    await expect(client.findByIngredients(["a"])).rejects.toMatchObject({ code: "quota", status: 402, quota: { left: 0 } })
    await expect(client.findByIngredients(["a"])).rejects.toMatchObject({ code: "quota" })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    clock = Date.UTC(2026, 10, 19, 0, 0, 1)
    await expect(client.findByIngredients(["a"])).resolves.toMatchObject({ recipes: [] })
  })

  it("maps failures to codes without leaking the key", async () => {
    const { client } = setup([
      () => reply({}, 401),
      () => reply({}, 500),
      () => new Response("not json", { status: 200 }),
      () => {
        throw new TypeError("fetch failed")
      },
      () => reply({ nope: true }),
    ])
    const codes: string[] = []
    for (let i = 0; i < 5; i++) {
      try {
        await client.findByIngredients(["a"])
      } catch (error) {
        expect(error).toBeInstanceOf(SpoonacularError)
        expect(String((error as Error).message)).not.toContain(KEY)
        codes.push((error as SpoonacularError).code)
      }
    }
    expect(codes).toEqual(["bad_key", "http", "bad_response", "network", "bad_response"])
  })

  it("reads quota headers, missing or not", () => {
    expect(readQuota(new Headers())).toEqual({ request: null, used: null, left: null })
    expect(readQuota(new Headers({ "X-API-Quota-Left": "abc", "X-API-Quota-Used": "3" }))).toEqual({ request: null, used: 3, left: null })
  })
})
