import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { latestProductionDeploy, listDeploys, mainCi, toDeployState } from "./github-deploys"

const API = "https://api.github.com/repos/acme/app"

/** Fake GitHub: answers by path (with query), 404 for anything unrouted. */
function routeGitHub(routes: Record<string, unknown>, overrides: Record<string, Response> = {}) {
  return vi.fn(async (url: string) => {
    const path = url.slice(API.length)
    if (path in overrides) return overrides[path].clone()
    if (!(path in routes)) return new Response("", { status: 404 })
    return new Response(JSON.stringify(routes[path]), { status: 200 })
  })
}

beforeEach(() => {
  vi.stubEnv("GITHUB_DASHBOARD_TOKEN", "t0k")
  vi.stubEnv("GITHUB_REPO", "acme/app")
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

const deployment = (id: number, extra: Record<string, unknown> = {}) => ({
  id,
  sha: String(id).repeat(40),
  ref: "main",
  environment: "Production",
  created_at: "2026-11-16T10:00:00Z",
  description: null,
  ...extra,
})

describe("toDeployState", () => {
  it("keeps known GitHub deployment states and maps anything else to unknown", () => {
    expect(toDeployState("success")).toBe("success")
    expect(toDeployState("in_progress")).toBe("in_progress")
    expect(toDeployState("inactive")).toBe("inactive")
    expect(toDeployState("weird")).toBe("unknown")
    expect(toDeployState(null)).toBe("unknown")
    expect(toDeployState(undefined)).toBe("unknown")
  })
})

describe("listDeploys", () => {
  it("returns an empty list without status calls when there are no deploys", async () => {
    const fetchMock = routeGitHub({ "/deployments?per_page=10": [] })
    vi.stubGlobal("fetch", fetchMock)
    await expect(listDeploys()).resolves.toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("takes each deploy's newest status for state and url, and marks deploys with no statuses unknown", async () => {
    const fetchMock = routeGitHub({
      "/deployments?per_page=2": [deployment(1), deployment(2, { environment: "Preview" })],
      "/deployments/1/statuses?per_page=1": [{ state: "success", environment_url: "https://lazychef.app" }],
      "/deployments/2/statuses?per_page=1": [],
    })
    vi.stubGlobal("fetch", fetchMock)

    const deploys = await listDeploys(2)

    expect(deploys).toHaveLength(2)
    expect(deploys[0]).toMatchObject({
      id: 1,
      environment: "Production",
      ref: "main",
      createdAt: "2026-11-16T10:00:00Z",
      state: "success",
      url: "https://lazychef.app",
      description: null,
    })
    expect(deploys[1]).toMatchObject({ id: 2, environment: "Preview", state: "unknown", url: null })
  })

  it("maps an unrecognised status string to unknown", async () => {
    vi.stubGlobal(
      "fetch",
      routeGitHub({
        "/deployments?per_page=10": [deployment(1)],
        "/deployments/1/statuses?per_page=1": [{ state: "rebooting", environment_url: null }],
      }),
    )
    const [deploy] = await listDeploys()
    expect(deploy.state).toBe("unknown")
    expect(deploy.url).toBeNull()
  })
})

describe("latestProductionDeploy", () => {
  it("returns null when nothing has been deployed to production", async () => {
    vi.stubGlobal("fetch", routeGitHub({ "/deployments?environment=Production&per_page=1": [] }))
    await expect(latestProductionDeploy()).resolves.toBeNull()
  })

  it("returns the newest production deploy with the first line of its commit message", async () => {
    const sha = "abcdef1234567890abcdef1234567890abcdef12"
    vi.stubGlobal(
      "fetch",
      routeGitHub({
        "/deployments?environment=Production&per_page=1": [deployment(7, { sha })],
        "/deployments/7/statuses?per_page=1": [{ state: "failure", environment_url: null }],
        [`/commits/${sha}`]: { sha, commit: { message: "Fix pantry sort\n\nLonger body here" } },
      }),
    )

    const deploy = await latestProductionDeploy()

    expect(deploy).toMatchObject({ id: 7, sha, state: "failure", commitMessage: "Fix pantry sort" })
  })
})

describe("mainCi", () => {
  const sha = "1111111111111111111111111111111111111111"

  it("combines check runs and commit statuses, mapping their states", async () => {
    vi.stubGlobal(
      "fetch",
      routeGitHub({
        "/commits/main": { sha, commit: { message: "x" } },
        [`/commits/${sha}/check-runs?per_page=50`]: {
          check_runs: [
            { name: "test", status: "completed", conclusion: "success", html_url: "https://github.com/run/1" },
            { name: "lint", status: "completed", conclusion: "failure", html_url: null },
            { name: "build", status: "in_progress", conclusion: null, html_url: null },
            { name: "docs", status: "completed", conclusion: "skipped", html_url: null },
          ],
        },
        [`/commits/${sha}/status`]: {
          statuses: [{ context: "vercel", state: "error", target_url: "https://vercel.com/x" }],
        },
      }),
    )

    const result = await mainCi()

    expect(result.sha).toBe(sha)
    expect(result.checksUnavailable).toBe(false)
    expect(result.items).toEqual([
      { name: "test", state: "success", url: "https://github.com/run/1", source: "check" },
      { name: "lint", state: "failure", url: null, source: "check" },
      { name: "build", state: "pending", url: null, source: "check" },
      { name: "docs", state: "skipped", url: null, source: "check" },
      { name: "vercel", state: "failure", url: "https://vercel.com/x", source: "status" },
    ])
  })

  it("falls back to commit statuses when the token can't read check runs", async () => {
    for (const status of [403, 404]) {
      vi.stubGlobal(
        "fetch",
        routeGitHub(
          {
            "/commits/main": { sha, commit: { message: "x" } },
            [`/commits/${sha}/status`]: {
              statuses: [{ context: "ci/other", state: "pending", target_url: null }],
            },
          },
          { [`/commits/${sha}/check-runs?per_page=50`]: new Response("", { status }) },
        ),
      )

      const result = await mainCi()

      expect(result.checksUnavailable).toBe(true)
      expect(result.items).toEqual([{ name: "ci/other", state: "pending", url: null, source: "status" }])
    }
  })

  it("still fails for errors other than a missing permission", async () => {
    vi.stubGlobal(
      "fetch",
      routeGitHub(
        {
          "/commits/main": { sha, commit: { message: "x" } },
          [`/commits/${sha}/status`]: { statuses: [] },
        },
        { [`/commits/${sha}/check-runs?per_page=50`]: new Response("", { status: 429 }) },
      ),
    )
    await expect(mainCi()).rejects.toMatchObject({ code: "rate_limited" })
  })

  it("returns no items for a commit without checks or statuses", async () => {
    vi.stubGlobal(
      "fetch",
      routeGitHub({
        "/commits/main": { sha, commit: { message: "x" } },
        [`/commits/${sha}/check-runs?per_page=50`]: { check_runs: [] },
        [`/commits/${sha}/status`]: { statuses: [] },
      }),
    )
    await expect(mainCi()).resolves.toEqual({ sha, items: [], checksUnavailable: false })
  })
})
