import { Skeleton } from "@/components/ui/skeleton"

export default function PantryLoading() {
  return (
    <div className="grid gap-6" aria-busy="true" aria-label="Loading the pantry">
      <div className="flex items-start justify-between gap-3">
        <div className="grid gap-2">
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-4 w-40" />
        </div>
        <Skeleton className="h-11 w-28 rounded-lg" />
      </div>
      <Skeleton className="h-11 w-full rounded-lg" />
      {[3, 2].map((rows, section) => (
        <div key={section} className="grid gap-2">
          <Skeleton className="h-4 w-32" />
          <div className="divide-y rounded-xl border">
            {Array.from({ length: rows }, (_, row) => (
              <div key={row} className="grid gap-1.5 px-3.5 py-3">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-3.5 w-16" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
