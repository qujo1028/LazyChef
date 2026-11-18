import { CircleAlert } from "lucide-react"

import { listAlertIssues } from "@/features/admin/alert-issues"

/** Open "alert" issues from GitHub. Renders nothing when there are none or GitHub can't be reached. */
export async function AlertBanner() {
  const alerts = await listAlertIssues()
  if (alerts.length === 0) return null
  return (
    <div role="alert" className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      <p className="flex items-center gap-2 font-semibold">
        <CircleAlert className="size-4 shrink-0" aria-hidden />
        {alerts.length} open {alerts.length === 1 ? "alert" : "alerts"}
      </p>
      <ul className="mt-1 grid gap-0.5 pl-6">
        {alerts.map((a) => (
          <li key={a.number} className="list-disc">
            <a href={a.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
              {a.title}
            </a>{" "}
            <span className="opacity-80">#{a.number}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
