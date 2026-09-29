import { Skeleton } from "@/components/ui/skeleton"

export default function ListLoading() {
  return (
    <div className="grid gap-6" aria-busy="true" aria-label="Loading the shopping list">
      <div className="grid gap-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-32" />
      </div>
      <Skeleton className="h-12 w-full rounded-lg" />
      {[3, 2].map((rows, section) => (
        <div key={section} className="grid gap-2">
          <Skeleton className="h-4 w-28" />
          <div className="divide-y rounded-xl border">
            {Array.from({ length: rows }, (_, row) => (
              <div key={row} className="flex items-center gap-3 px-3 py-3.5">
                <Skeleton className="size-7 rounded-full" />
                <Skeleton className="h-4 w-36" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
