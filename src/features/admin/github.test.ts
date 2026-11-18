import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { errorCodeFor, gh, GitHubError, githubConfig } from "./github"

const config = { token: "t0k", owner: "acme", repo: "app" }

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("githubConfig", () => {
  it("needs both a token and an owner/name repo", () => {
    expect(githubConfig({})).toBeNull()
    expect(githubConfig({ GITHUB_DASHBOARD_TOKEN: "x" })).toBeNull()
    expect(githubConfig({ GITHUB_DASHBOARD_TOKEN: "x", GITHUB_REPO: "nope" })).toBeNull()
    expect(githubConfig({ GITHUB_DASHBOARD_TOKEN: " x ", GITHUB_REPO: " acme/app " })).toEqual({ token: "x", owner: "acme", repo: "app" })
  })
})

describe("errorCodeFor", () => {
  it("maps statuses", () => {
    const none = new Headers()
    expect(errorCodeFor(401, none)).toBe("bad_token")
    expect(errorCodeFor(403, none)).toBe("bad_token")
    expect(errorCodeFor(403, new Headers({ "x-ratelimit-remaining": "0" }))).toBe("rate_limited")
    expect(errorCodeFor(429, none)).toBe("rate_limited")
    expect(errorCodeFor(404, none)).toBe("not_found")
    expect(errorCodeFor(500, none)).toBe("http")
  })
})

describe("gh", () => {
  it("throws no_config without a config", async () => {
    await expect(gh("/issues", {}, null)).rejects.toMatchObject({ code: "no_config" })
  })

  it("calls the repo URL with auth and caches GETs", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([{ id: 1 }]), { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)
    await expect(gh("/issues?state=open", {}, config)).resolves.toEqual([{ id: 1 }])
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("https://api.github.com/repos/acme/app/issues?state=open")
    expect(init.headers.Authorization).toBe("Bearer t0k")
    expect(init.next).toMatchObject({ revalidate: 60 })
  })

  it("sends writes uncached with a JSON body, and handles 204", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal("fetch", fetchMock)
    await expect(gh("/issues/3", { method: "PATCH", body: { state: "closed" } }, config)).resolves.toBeNull()
    const [, init] = fetchMock.mock.calls[0]
    expect(init.cache).toBe("no-store")
    expect(init.body).toBe('{"state":"closed"}')
  })

  it("supports API-root paths", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)
    await gh("//rate_limit", {}, config)
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.github.com/rate_limit")
  })

  it("turns failures into GitHubError", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 404 })))
    await expect(gh("/x", {}, config)).rejects.toMatchObject({ code: "not_found", status: 404 })
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")))
    const error = await gh("/x", {}, config).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(GitHubError)
    expect((error as GitHubError).code).toBe("network")
  })
})
