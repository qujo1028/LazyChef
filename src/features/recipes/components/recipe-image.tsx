"use client"

import { ChefHat } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { cn } from "@/lib/utils"

/**
 * A recipe photo that fades in over a soft placeholder instead of popping in.
 * A plain <img>: the photos are already sized for cards, and Vercel's optimizer would only spend its quota.
 */
export function RecipeImage({ src, className, eager = false }: { src: string | null; className?: string; eager?: boolean }) {
  const ref = useRef<HTMLImageElement>(null)
  const [loaded, setLoaded] = useState<string | null>(null)

  // A cached photo can finish before React attaches onLoad.
  useEffect(() => {
    const img = ref.current
    if (img?.complete && img.naturalWidth > 0) setLoaded(img.currentSrc || src)
  }, [src])

  if (!src) {
    return (
      <div
        className={cn("flex items-center justify-center bg-gradient-to-br from-muted to-accent text-muted-foreground/60", className)}
        aria-hidden
      >
        <ChefHat className="size-8" />
      </div>
    )
  }
  const shown = loaded !== null
  return (
    <div className={cn("relative overflow-hidden bg-gradient-to-br from-muted to-accent", !shown && "animate-pulse", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={ref}
        src={src}
        alt=""
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        referrerPolicy="no-referrer"
        onLoad={() => setLoaded(src)}
        className={cn(
          "absolute inset-0 size-full object-cover transition-[opacity,scale] duration-500 ease-out",
          shown ? "scale-100 opacity-100" : "scale-[1.03] opacity-0",
        )}
      />
    </div>
  )
}
