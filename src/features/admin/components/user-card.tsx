import { Badge } from "@/components/ui/badge"
import { CompForm } from "@/features/admin/components/comp-form"
import type { SupportUser } from "@/features/admin/support-db"

/** A day in UTC, so a comp that ends "today" reads the same for every admin. */
export function formatDay(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "unknown date"
  return d.toLocaleDateString("en-US", { dateStyle: "medium", timeZone: "UTC" })
}

export function proStatusText(user: SupportUser): string {
  switch (user.proSource) {
    case "subscription":
      return "Pro (own subscription)"
    case "comp":
      return user.compExpiresAt
        ? `Pro (free comp, ends ${formatDay(user.compExpiresAt)})`
        : "Pro (free comp, no end date)"
    case "household":
      return "Pro through their household"
    default:
      return "Free"
  }
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[9rem_1fr] sm:gap-3">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-sm break-words">{children}</dd>
    </div>
  )
}

/** One account's details, its households, and the free Pro controls. */
export function UserCard({ user, onChange }: { user: SupportUser; onChange: (user: SupportUser) => void }) {
  return (
    <section aria-label="Account details" className="grid gap-4 rounded-xl border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-base font-semibold break-words">{user.displayName || "No display name"}</h3>
        <Badge variant={user.proSource ? "default" : "secondary"}>{user.proSource ? "Pro" : "Free"}</Badge>
      </div>

      <dl className="grid gap-2">
        <Row label="Email">{user.email}</Row>
        <Row label="Joined">{user.createdAt ? formatDay(user.createdAt) : "Unknown"}</Row>
        <Row label="Last sign-in">{user.lastSignInAt ? formatDay(user.lastSignInAt) : "Never"}</Row>
        <Row label="Plan">{proStatusText(user)}</Row>
        {user.compNote ? <Row label="Comp note">{user.compNote}</Row> : null}
      </dl>

      <div className="grid gap-2">
        <h4 className="text-sm font-medium">Households</h4>
        {user.households.length === 0 ? (
          <p className="text-sm text-muted-foreground">Not in any household.</p>
        ) : (
          <ul className="grid divide-y rounded-lg border">
            {user.households.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2 text-sm">
                <span className="font-medium break-words">{h.name || "Unnamed household"}</span>
                <span className="text-muted-foreground">
                  {h.role}, {h.members} {h.members === 1 ? "member" : "members"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <CompForm user={user} onChange={onChange} />
    </section>
  )
}
