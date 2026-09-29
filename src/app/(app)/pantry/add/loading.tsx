import { Skeleton } from "@/components/ui/skeleton"

export default function BulkAddLoading() {
  return (
    <div className="grid gap-4" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-5 w-20" />
      <div className="grid gap-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-full max-w-72" />
      </div>
      <Skeleton className="h-52 w-full rounded-lg" />
      <Skeleton className="h-12 w-full rounded-lg" />
    </div>
  )
}
