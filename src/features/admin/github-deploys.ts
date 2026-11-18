import "server-only"

import { z } from "zod"

import { gh, GitHubError } from "@/features/admin/github"

// Vercel reports each deploy to GitHub as a Deployment with status updates, so the Health
// tab reads deploys and CI from GitHub rather than from Vercel's API.

export type DeployState = "success" | "failure" | "error" | "pending" | "in_progress" | "queued" | "inactive" | "unknown"

export type Deploy = {
  id: number
  environment: string
  sha: string
  ref: string
  createdAt: string
  state: DeployState
  url: string | null
  description: string | null
}

export type CiItem = {
  name: string
  state: "success" | "failure" | "pending" | "neutral" | "skipped"
  url: string | null
  source: "check" | "status"
}

const DEPLOY_STATES: readonly DeployState[] = [
  "success",
  "failure",
  "error",
  "pending",
  "in_progress",
  "queued",
  "inactive",
]

/** GitHub's deployment status string, narrowed to the states we show. Anything else is "unknown". */
export function toDeployState(raw: string | null | undefined): DeployState {
  return DEPLOY_STATES.find((state) => state === raw) ?? "unknown"
}

// Only the fields we use; zod strips the rest.
const deploymentSchema = z.object({
  id: z.number(),
  sha: z.string(),
  ref: z.string(),
  environment: z.string(),
  created_at: z.string(),
  description: z.string().nullish(),
})

const deployStatusSchema = z.object({
  state: z.string(),
  environment_url: z.string().nullish(),
})

const commitSchema = z.object({
  sha: z.string(),
  commit: z.object({ message: z.string() }),
})

const checkRunsSchema = z.object({
  check_runs: z.array(
    z.object({
      name: z.string(),
      status: z.string(),
      conclusion: z.string().nullish(),
      html_url: z.string().nullish(),
    }),
  ),
})

const combinedStatusSchema = z.object({
  statuses: z.array(
    z.object({
      context: z.string(),
      state: z.string(),
      target_url: z.string().nullish(),
    }),
  ),
})

type RawDeployment = z.infer<typeof deploymentSchema>

/** The newest status of one deployment, or null when it has none yet. */
async function latestStatus(deploymentId: number): Promise<z.infer<typeof deployStatusSchema> | null> {
  const raw = await gh<unknown>(`/deployments/${deploymentId}/statuses?per_page=1`)
  const statuses = z.array(deployStatusSchema).parse(raw)
  return statuses[0] ?? null
}

function toDeploy(deployment: RawDeployment, status: z.infer<typeof deployStatusSchema> | null): Deploy {
  return {
    id: deployment.id,
    environment: deployment.environment,
    sha: deployment.sha,
    ref: deployment.ref,
    createdAt: deployment.created_at,
    state: status ? toDeployState(status.state) : "unknown",
    url: status?.environment_url ?? null,
    description: deployment.description ?? null,
  }
}

/** The most recent deploys, newest first, each with its latest status. */
export async function listDeploys(limit = 10): Promise<Deploy[]> {
  const raw = await gh<unknown>(`/deployments?per_page=${limit}`)
  const deployments = z.array(deploymentSchema).parse(raw)
  return Promise.all(
    deployments.map(async (deployment) => toDeploy(deployment, await latestStatus(deployment.id))),
  )
}

/** The newest deploy to the Production environment, with its commit's first message line. */
export async function latestProductionDeploy(): Promise<(Deploy & { commitMessage: string | null }) | null> {
  const raw = await gh<unknown>("/deployments?environment=Production&per_page=1")
  const [deployment] = z.array(deploymentSchema).parse(raw)
  if (!deployment) return null

  const [status, commitRaw] = await Promise.all([
    latestStatus(deployment.id),
    gh<unknown>(`/commits/${deployment.sha}`),
  ])
  const commit = commitSchema.parse(commitRaw)
  const commitMessage = commit.commit.message.split("\n")[0]?.trim() || null
  return { ...toDeploy(deployment, status), commitMessage }
}

function checkRunState(run: z.infer<typeof checkRunsSchema>["check_runs"][number]): CiItem["state"] {
  if (run.status !== "completed") return "pending"
  switch (run.conclusion) {
    case "success":
      return "success"
    case "skipped":
      return "skipped"
    case "neutral":
    case "stale":
    case null:
    case undefined:
      return "neutral"
    default:
      // failure, timed_out, action_required, startup_failure, cancelled
      return "failure"
  }
}

function commitStatusState(state: string): CiItem["state"] {
  if (state === "success") return "success"
  if (state === "pending") return "pending"
  if (state === "failure" || state === "error") return "failure"
  return "neutral"
}

/** Check runs for a commit. Returns `unavailable` when the token can't read checks. */
async function checkRunItems(sha: string): Promise<{ items: CiItem[]; unavailable: boolean }> {
  try {
    const raw = await gh<unknown>(`/commits/${sha}/check-runs?per_page=50`)
    const { check_runs: runs } = checkRunsSchema.parse(raw)
    return {
      unavailable: false,
      items: runs.map((run) => ({
        name: run.name,
        state: checkRunState(run),
        url: run.html_url ?? null,
        source: "check" as const,
      })),
    }
  } catch (error) {
    // The token lacks the Checks permission, or can't see the repo: show statuses only.
    if (error instanceof GitHubError && (error.code === "bad_token" || error.code === "not_found")) {
      return { items: [], unavailable: true }
    }
    throw error
  }
}

/** CI results for the tip of main: Actions check runs plus commit statuses (other CI). */
export async function mainCi(): Promise<{ sha: string; items: CiItem[]; checksUnavailable: boolean }> {
  const head = commitSchema.parse(await gh<unknown>("/commits/main"))
  const sha = head.sha

  const [checks, combinedRaw] = await Promise.all([
    checkRunItems(sha),
    gh<unknown>(`/commits/${sha}/status`),
  ])
  const { statuses } = combinedStatusSchema.parse(combinedRaw)

  const statusItems: CiItem[] = statuses.map((status) => ({
    name: status.context,
    state: commitStatusState(status.state),
    url: status.target_url ?? null,
    source: "status",
  }))

  return { sha, items: [...checks.items, ...statusItems], checksUnavailable: checks.unavailable }
}
