import { AdminCard, CardNotice } from "@/features/admin/components/admin-card"
import { getRecentAdminActions } from "@/features/admin/audit"
import { agoPhrase } from "@/features/admin/health"
import { loadSafely } from "@/features/admin/load"

const FULL_DATE = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })

/** The latest admin actions, newest first. */
export async function AuditList() {
  const title = "Recent admin actions"
  const result = await loadSafely(() => getRecentAdminActions(50))
  if (!result.ok) {
    return (
      <AdminCard title={title}>
        <CardNotice kind={result.kind} message={result.message} />
      </AdminCard>
    )
  }

  const now = new Date()
  const rows = result.data
  return (
    <AdminCard title={title} description="Newest first. Times are shown in UTC when you hover.">
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th scope="col" className="py-2 pr-3 font-medium">When</th>
                <th scope="col" className="py-2 pr-3 font-medium">Admin</th>
                <th scope="col" className="py-2 pr-3 font-medium">Action</th>
                <th scope="col" className="py-2 font-medium">Target</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="py-2 pr-3 whitespace-nowrap">
                    <time dateTime={row.at} title={`${FULL_DATE.format(new Date(row.at))} UTC`}>
                      {agoPhrase(row.at, now)}
                    </time>
                  </td>
                  <td className="py-2 pr-3 break-all">{row.adminEmail ?? "Unknown"}</td>
                  <td className="py-2 pr-3 font-mono text-xs whitespace-nowrap">{row.action}</td>
                  <td className="py-2 font-mono text-xs break-all">{row.target}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminCard>
  )
}
