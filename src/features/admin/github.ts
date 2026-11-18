import "server-only"

// The admin dashboard's GitHub connection: a fine-grained token (GITHUB_DASHBOARD_TOKEN)
// for one repo (GITHUB_REPO, "owner/name"). Feature modules (github-issues.ts,
// github-deploys.ts) build on gh(); this file only knows how to talk to the API.

export const GITHUB_API = "https://api.github.com"
export const GITHUB_API_VERSION = "2022-11-28"
/** Cache tag on every GitHub read, so a board action can refresh them all at once. */
export const GITHUB_CACHE_TAG = "admin-github"

const TIMEOUT_MS = 10_000
const DEFAULT_REVALIDATE_SECONDS = 60

export type GitHubConfig = { token: string; owner: string; repo: string }

const REPO_PATTERN = /^([A-Za-z0-9-]{1,39})\/([A-Za-z0-9._-]{1,100})$/

/** The token and repo, or null when either is unset or GITHUB_REPO isn't "owner/name". */
export function githubConfig(env: Record<string, string | undefined> = process.env): GitHubConfig | null {
  const token = env.GITHUB_DASHBOARD_TOKEN?.trim()
  const match = REPO_PATTERN.exec(env.GITHUB_REPO?.trim() ?? "")
  if (!token || !match) return null
  return { token, owner: match[1], repo: match[2] }
}

export type GitHubErrorCode =
  | "no_config" // token or repo not set
  | "bad_token" // 401, or 403 without rate-limit headers
  | "not_found" // 404 (also what GitHub says when the token can't see the repo)
  | "rate_limited" // 429, or 403 with x-ratelimit-remaining: 0
  | "http" // any other non-2xx
  | "network" // fetch threw or timed out

const MESSAGES: Record<GitHubErrorCode, string> = {
  no_config: "Set GITHUB_DASHBOARD_TOKEN and GITHUB_REPO to connect GitHub.",
  bad_token: "GitHub didn't accept the token, or it's missing a permission.",
  not_found: "GitHub couldn't find that. Check GITHUB_REPO and the token's repository access.",
  rate_limited: "GitHub's rate limit is used up for now. Try again in a few minutes.",
  http: "GitHub had a problem answering.",
  network: "Couldn't reach GitHub.",
}

/** A failed GitHub call. `message` is short and safe to show to admins. */
export class GitHubError extends Error {
  readonly code: GitHubErrorCode
  readonly status: number | null

  constructor(code: GitHubErrorCode, options: { status?: number | null; cause?: unknown } = {}) {
    super(MESSAGES[code], { cause: options.cause })
    this.name = "GitHubError"
    this.code = code
    this.status = options.status ?? null
  }
}

/** Maps a non-2xx response to an error code. */
export function errorCodeFor(status: number, headers: Headers): GitHubErrorCode {
  if (status === 401) return "bad_token"
  if (status === 429) return "rate_limited"
  if (status === 403) return headers.get("x-ratelimit-remaining") === "0" ? "rate_limited" : "bad_token"
  if (status === 404) return "not_found"
  return "http"
}

export type GhOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE"
  body?: unknown
  /** Seconds to cache a GET. Writes are never cached. Default 60. */
  revalidate?: number
}

/**
 * Calls the GitHub REST API. `path` is relative to the repo ("/issues?state=open") or, when it
 * starts with "//", to the API root ("//rate_limit"). Returns the parsed JSON (null for 204).
 * Throws GitHubError; never returns a failed response.
 */
export async function gh<T = unknown>(path: string, options: GhOptions = {}, config = githubConfig()): Promise<T> {
  if (!config) throw new GitHubError("no_config")
  const method = options.method ?? "GET"
  const url = path.startsWith("//")
    ? `${GITHUB_API}${path.slice(1)}`
    : `${GITHUB_API}/repos/${config.owner}/${config.repo}${path}`

  let response: Response
  try {
    response = await fetch(url, {
      method,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${config.token}`,
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
        ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      ...(method === "GET"
        ? { next: { revalidate: options.revalidate ?? DEFAULT_REVALIDATE_SECONDS, tags: [GITHUB_CACHE_TAG] } }
        : { cache: "no-store" as const }),
    })
  } catch (cause) {
    throw new GitHubError("network", { cause })
  }

  if (!response.ok) {
    throw new GitHubError(errorCodeFor(response.status, response.headers), { status: response.status })
  }
  if (response.status === 204) return null as T
  try {
    return (await response.json()) as T
  } catch (cause) {
    throw new GitHubError("http", { status: response.status, cause })
  }
}
