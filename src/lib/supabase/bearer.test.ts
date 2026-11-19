import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

const { apiFailure, authenticate, bearerToken, methodNotAllowed, readJsonBody, MAX_BODY_BYTES } = await import("./bearer")

const post = (body: BodyInit | null, headers: Record<string, string> = { "content-type": "application/json" }) =>
  new Request("http://localhost/api/x", { method: "POST", body, headers, duplex: "half" } as RequestInit)

describe("bearerToken", () => {
  it("reads the token from a Bearer header", () => {
    expect(bearerToken("Bearer abc.def.ghi")).toBe("abc.def.ghi")
    expect(bearerToken("bearer abc")).toBe("abc")
    expect(bearerToken("  Bearer   abc  ")).toBe("abc")
  })

  it("refuses anything else", () => {
    expect(bearerToken(null)).toBeNull()
    expect(bearerToken(undefined)).toBeNull()
    expect(bearerToken("")).toBeNull()
    expect(bearerToken("Bearer")).toBeNull()
    expect(bearerToken("Bearer ")).toBeNull()
    expect(bearerToken("Basic abc")).toBeNull()
    expect(bearerToken("abc")).toBeNull()
    expect(bearerToken("Bearer a b")).toBeNull()
    expect(bearerToken(`Bearer ${"x".repeat(9000)}`)).toBeNull()
  })
})

describe("apiFailure and methodNotAllowed", () => {
  it("uses the contract's shape and the code's status", async () => {
    const response = apiFailure("forbidden", "No.")
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ ok: false, code: "forbidden", error: "No." })
    expect(apiFailure("unauthorized", "x").status).toBe(401)
    expect(apiFailure("not_configured", "x").status).toBe(503)
  })

  it("answers other methods with 405", async () => {
    const response = methodNotAllowed()
    expect(response.status).toBe(405)
    expect(response.headers.get("allow")).toBe("POST")
    expect(await response.json()).toMatchObject({ ok: false, code: "bad_request" })
  })
})

describe("readJsonBody", () => {
  it("parses a JSON body", async () => {
    expect(await readJsonBody(post(JSON.stringify({ a: 1 })))).toEqual({ value: { a: 1 } })
    expect(await readJsonBody(post("{}", { "content-type": "application/json; charset=utf-8" }))).toEqual({ value: {} })
  })

  it("refuses other content types with 415", async () => {
    const result = await readJsonBody(post("{}", { "content-type": "text/plain" }))
    expect(result instanceof Response && result.status).toBe(415)
    const none = await readJsonBody(post("{}", {}))
    expect(none instanceof Response && none.status).toBe(415)
  })

  it("refuses a body over the cap, declared or not", async () => {
    const big = JSON.stringify({ pad: "x".repeat(MAX_BODY_BYTES) })
    const declared = await readJsonBody(post(big, { "content-type": "application/json", "content-length": String(big.length) }))
    expect(declared instanceof Response && declared.status).toBe(413)
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(big))
        controller.close()
      },
    })
    const streamed = await readJsonBody(post(stream))
    expect(streamed instanceof Response && streamed.status).toBe(413)
  })

  it("refuses broken JSON with 400", async () => {
    const result = await readJsonBody(post("{nope"))
    expect(result instanceof Response && result.status).toBe(400)
    expect(result instanceof Response && (await result.json()).code).toBe("bad_request")
  })
})

describe("authenticate", () => {
  const withAuth = (header?: string) => new Request("http://localhost/api/x", { method: "POST", headers: header ? { authorization: header } : {} })
  const client = (getUser: () => Promise<unknown>) => {
    const make = vi.fn(() => ({ auth: { getUser } }) as never)
    return make
  }

  it("is 401 without a token, and never builds a client", async () => {
    const make = client(async () => ({ data: { user: { id: "u1" } }, error: null }))
    const result = await authenticate(withAuth(), make)
    expect(result instanceof Response && result.status).toBe(401)
    expect(result instanceof Response && (await result.json()).code).toBe("unauthorized")
    expect(make).not.toHaveBeenCalled()
  })

  it("is 401 when Supabase rejects the token", async () => {
    const make = client(async () => ({ data: { user: null }, error: { message: "invalid JWT" } }))
    const result = await authenticate(withAuth("Bearer bad"), make)
    expect(result instanceof Response && result.status).toBe(401)
  })

  it("is 500, not 401, when Supabase can't be reached", async () => {
    const make = client(async () => {
      throw new Error("network")
    })
    const result = await authenticate(withAuth("Bearer t"), make)
    expect(result instanceof Response && result.status).toBe(500)
  })

  it("returns the person and the client acting as them", async () => {
    const getUser = vi.fn(async () => ({ data: { user: { id: "u1" } }, error: null }))
    const make = client(getUser)
    const result = await authenticate(withAuth("Bearer good"), make)
    expect(result).not.toBeInstanceOf(Response)
    expect(!(result instanceof Response) && result.user.id).toBe("u1")
    expect(make).toHaveBeenCalledWith("good")
    expect(getUser).toHaveBeenCalledWith("good")
  })
})
