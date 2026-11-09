import { Skeleton } from "@/components/ui/skeleton"

/** Loading placeholder shaped like the Recipes pages: heading, tab bar, an optional row, then photo tiles. */
export function RecipeGridSkeleton({ label, row }: { label: string; row: "search" | "chips" | "button" }) {
  return (
    <div className="grid gap-6" aria-busy="true" aria-label={label}>
      <div className="grid gap-2">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-4 w-56" />
      </div>
      <div className="flex gap-6 border-b pb-3">
        {[12, 12, 10].map((w, i) => (
          <Skeleton key={i} className="h-4" style={{ width: `${w * 4}px` }} />
        ))}
      </div>
      {row === "search" ? (
        <div className="flex gap-2">
          <Skeleton className="h-12 flex-1 rounded-xl" />
          <Skeleton className="size-12 rounded-xl" />
        </div>
      ) : row === "chips" ? (
        <div className="flex gap-2 overflow-hidden">
          {[30, 20, 26].map((w, i) => (
            <Skeleton key={i} className="h-11 shrink-0 rounded-full" style={{ width: `${w * 4}px` }} />
          ))}
        </div>
      ) : (
        <Skeleton className="h-12 w-full rounded-xl" />
      )}
      <div className="grid grid-cols-2 gap-x-3 gap-y-5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="grid gap-2">
            <Skeleton className="aspect-square w-full rounded-2xl" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
        ))}
      </div>
    </div>
  )
}
