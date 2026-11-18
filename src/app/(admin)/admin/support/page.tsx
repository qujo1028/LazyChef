import { AdminCard, AdminSuspense } from "@/features/admin/components/admin-card"
import { AuditList } from "@/features/admin/components/audit-list"
import { UserLookup } from "@/features/admin/components/user-lookup"
import { requireAdmin } from "@/features/admin/guard"

export default async function AdminSupportPage() {
  await requireAdmin()

  return (
    <div className="grid gap-4">
      <AdminCard title="Find a user">
        <UserLookup />
      </AdminCard>
      <AdminSuspense title="Recent admin actions" rows={5}>
        <AuditList />
      </AdminSuspense>
    </div>
  )
}
