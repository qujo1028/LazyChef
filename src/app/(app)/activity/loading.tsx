import { Skeleton } from "@/components/ui/skeleton"

export default function ActivityLoading() {
  return (
    <div className="grid gap-6" aria-busy="true" aria-label="Loading activity">
      <div className="grid gap-2">
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-4 w-52" />
      </div>
      <ul className="grid divide-y">
        {[0, 1, 2, 3, 4].map((i) => (
          <li key={i} className="flex gap-3 py-3">
            <Skeleton className="size-10 shrink-0 rounded-full" />
            <div className="grid flex-1 content-start gap-2 pt-1">
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-3.5 w-2/5" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
