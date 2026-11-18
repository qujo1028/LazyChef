import { KanbanSquare } from "lucide-react"

import { EmptyState } from "@/components/empty-state"
import { requireAdmin } from "@/features/admin/guard"

export default async function AdminBoardPage() {
  // Layouts and pages render in parallel, so each page checks too.
  await requireAdmin()

  return (
    <EmptyState icon={KanbanSquare} title="Board coming soon">
      Open issues and pull requests from GitHub will show up here.
    </EmptyState>
  )
}
