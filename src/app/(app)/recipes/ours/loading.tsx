import { Skeleton } from "@/components/ui/skeleton"

export default function OurRecipesLoading() {
  return (
    <div className="grid gap-6" aria-busy="true" aria-label="Loading your recipes">
      <div className="grid gap-2">
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-4 w-48" />
      </div>
      <Skeleton className="h-13 w-full rounded-xl" />
      <div className="flex gap-2 overflow-hidden">
        {[30, 20, 26].map((w, i) => (
          <Skeleton key={i} className="h-11 shrink-0 rounded-full" style={{ width: `${w * 4}px` }} />
        ))}
      </div>
      <div className="grid gap-2.5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex gap-3 rounded-xl border p-2.5">
            <Skeleton className="size-24 shrink-0 rounded-lg" />
            <div className="grid flex-1 content-start gap-2 py-1">
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-3.5 w-3/5" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
