import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

type Module = typeof import("./index")

/** Fresh module state (cache, quota block, rate window) for each test. */
async function load(): Promise<Module> {
  vi.resetModules()
  return import("./index")
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  })
}

const QUOTA_HEADERS = { "X-API-Quota-Request": "2", "X-API-Quota-Used": "12.5", "X-API-Quota-Left": "37.5" }

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal("fetch", fetchMock)
  vi.stubEnv("SPOONACULAR_API_KEY", "test-key")
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

describe("spoonacularFetch", () => {
  it("fails with no_key without touching the network when the key is missing", async () => {
    vi.stubEnv("SPOONACULAR_API_KEY", "")
    const { spoonacularFetch, isSpoonacularConfigured, SpoonacularError } = await load()
    expect(isSpoonacularConfigured()).toBe(false)
    const error = await spoonacularFetch("/recipes/random").catch((e: unknown) => e)
    expect(error).toBeInstanceOf(SpoonacularError)
    expect(error).toMatchObject({ code: "no_key" })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("sends the key as a header only and reads the quota headers", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: 1 }, 200, QUOTA_HEADERS))
    const { spoonacularFetch } = await load()
    const result = await spoonacularFetch("/food/ingredients/search", { query: { query: "egg" } })

    expect(result).toEqual({ data: { ok: 1 }, quota: { request: 2, used: 12.5, left: 37.5 } })
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit]
    expect(String(url)).toBe("https://api.spoonacular.com/food/ingredients/search?query=egg")
    expect(String(url)).not.toContain("test-key")
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe("test-key")
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it.each([
    [401, "bad_key"],
    [402, "quota"],
    [429, "rate_limit"],
    [500, "http"],
  ])("maps HTTP %i to %s", async (status, code) => {
    fetchMock.mockResolvedValue(jsonResponse({ status: "failure" }, status, QUOTA_HEADERS))
    const { spoonacularFetch } = await load()
    const error = await spoonacularFetch("/x").catch((e: unknown) => e)
    expect(error).toMatchObject({ code, status, quota: { left: 37.5 } })
    expect((error as Error).message).not.toContain("test-key")
  })

  it("maps timeouts and network failures", async () => {
    const { spoonacularFetch } = await load()
    fetchMock.mockRejectedValueOnce(new DOMException("The operation timed out.", "TimeoutError"))
    await expect(spoonacularFetch("/x")).rejects.toMatchObject({ code: "timeout" })
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"))
    await expect(spoonacularFetch("/x")).rejects.toMatchObject({ code: "network" })
  })

  it("maps a non-JSON body to bad_response", async () => {
    fetchMock.mockResolvedValue(new Response("<html>", { status: 200 }))
    const { spoonacularFetch } = await load()
    await expect(spoonacularFetch("/x")).rejects.toMatchObject({ code: "bad_response" })
  })

  it("stops calling after a 402 until midnight UTC", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-09-28T20:00:00Z"))
    fetchMock.mockResolvedValue(jsonResponse({}, 402))
    const { spoonacularFetch } = await load()

    await expect(spoonacularFetch("/x")).rejects.toMatchObject({ code: "quota" })
    await expect(spoonacularFetch("/x")).rejects.toMatchObject({ code: "quota" })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    vi.setSystemTime(new Date("2026-09-29T00:00:01Z"))
    fetchMock.mockResolvedValue(jsonResponse([]))
    await expect(spoonacularFetch("/x")).resolves.toMatchObject({ data: [] })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("runs at most two requests at once", async () => {
    let inFlight = 0
    let peak = 0
    fetchMock.mockImplementation(async () => {
      inFlight++
      peak = Math.max(peak, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 5))
      inFlight--
      return jsonResponse({})
    })
    const { spoonacularFetch } = await load()
    await Promise.all(Array.from({ length: 5 }, () => spoonacularFetch("/x")))
    expect(fetchMock).toHaveBeenCalledTimes(5)
    expect(peak).toBe(2)
  })
})

describe("parseIngredients", () => {
  const RESPONSE = [
    {
      id: 11979,
      original: "jalapeno",
      name: "jalapeno pepper",
      amount: 1,
      unit: "",
      possibleUnits: ["g", "oz", "cup"],
      aisle: "Produce",
    },
    { original: "blorp", name: "blorp", amount: 1, unit: "", possibleUnits: [] },
    {
      id: 2027,
      original: "2 tbsp oregano",
      name: "oregano",
      amount: 2,
      unit: "tbsp",
      possibleUnits: ["tbsp", "tsp"],
      aisle: "Spices and Seasonings",
    },
  ]

  it("posts a form body, one line per ingredient, and returns results per input line", async () => {
    fetchMock.mockResolvedValue(jsonResponse(RESPONSE, 200, { ...QUOTA_HEADERS, "X-API-Quota-Request": "3" }))
    const { parseIngredients } = await load()
    const result = await parseIngredients(["jalapeno", "blorp", "", "2 tbsp oregano", "Jalapeno"])

    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit]
    expect(String(url)).toBe("https://api.spoonacular.com/recipes/parseIngredients")
    expect(init.method).toBe("POST")
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/x-www-form-urlencoded")
    const body = new URLSearchParams(String(init.body))
    expect(body.get("ingredientList")).toBe("jalapeno\nblorp\n2 tbsp oregano")
    expect(body.get("servings")).toBe("1")
    expect(body.get("includeNutrition")).toBe("false")

    expect(result.sent).toBe(3)
    expect(result.quota).toEqual({ request: 3, used: 12.5, left: 37.5 })
    expect(result.ingredients).toEqual([
      { id: 11979, name: "jalapeno pepper", aisle: "Produce", amount: 1, unit: "", possibleUnits: ["g", "oz", "cup"] },
      { id: null, name: "blorp", aisle: null, amount: 1, unit: "", possibleUnits: [] },
      null,
      { id: 2027, name: "oregano", aisle: "Spices and Seasonings", amount: 2, unit: "tbsp", possibleUnits: ["tbsp", "tsp"] },
      { id: 11979, name: "jalapeno pepper", aisle: "Produce", amount: 1, unit: "", possibleUnits: ["g", "oz", "cup"] },
    ])
  })

  it("matches results by the echoed line even when Spoonacular drops one", async () => {
    fetchMock.mockResolvedValue(jsonResponse([RESPONSE[2]]))
    const { parseIngredients } = await load()
    const result = await parseIngredients(["qwxz", "2 tbsp oregano"])
    expect(result.ingredients.map((i) => i?.id ?? null)).toEqual([null, 2027])
  })

  it("answers repeats within the hour from memory, spending no points", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([RESPONSE[0]], 200, QUOTA_HEADERS))
    const { parseIngredients } = await load()
    await parseIngredients(["jalapeno"])

    const again = await parseIngredients(["JALAPENO"])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(again).toMatchObject({ sent: 0, quota: null })
    expect(again.ingredients[0]?.id).toBe(11979)
  })

  it("rejects a response that isn't a list", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: "failure" }))
    const { parseIngredients } = await load()
    await expect(parseIngredients(["egg"])).rejects.toMatchObject({ code: "bad_response" })
  })

  it("makes no request for blank input", async () => {
    const { parseIngredients } = await load()
    await expect(parseIngredients(["", "  "])).resolves.toEqual({ ingredients: [null, null], quota: null, sent: 0 })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
